import { Injectable, Logger } from '@nestjs/common';
import { KycCaseStatus, KycDocumentStatus, PartnerStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { RbacService } from '../identity/rbac.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { assertKycTransition } from './kyc-state';
import {
  ALLOWED_KYC_CONTENT_TYPES,
  MAX_KYC_BYTES,
  MalwareScanner,
  PrivateObjectStore,
  sanitizeFilename,
} from './object-store';

const BLOCKED_OWNER_UPLOAD = new Set<PartnerStatus>([
  PartnerStatus.SUSPENDED,
  PartnerStatus.BLOCKED,
  PartnerStatus.DEACTIVATED,
]);

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly events: SecurityEventsService,
    private readonly objects: PrivateObjectStore,
    private readonly rbac: RbacService,
    private readonly scanner: MalwareScanner,
  ) {}

  async openCase(input: {
    partnerId: string;
    applicationId?: string;
    actorId: string;
    requestId?: string;
  }) {
    const partner = await this.prisma.partner.findUnique({ where: { id: input.partnerId } });
    if (!partner) {
      throw Errors.notFound('Partner not found');
    }
    await this.assertCan(input.actorId, partner, 'open');
    const existing = await this.prisma.kycCase.findFirst({
      where: { partnerId: partner.id, status: { notIn: ['VERIFIED', 'REJECTED', 'EXPIRED'] } },
    });
    if (existing) {
      return existing;
    }
    const created = await this.prisma.kycCase.create({
      data: {
        id: uuidv7(),
        partnerId: partner.id,
        applicationId: input.applicationId,
        countryId: partner.countryId,
        status: KycCaseStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
    await this.events.emit({
      type: 'KYC_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { kyc_case_id: created.id },
    });
    return created;
  }

  async requiredDocuments(countryCode: string, partnerTypeCode: string): Promise<string[]> {
    const pack = await this.policy.resolvePublished(countryCode);
    if (!pack) {
      return [];
    }
    const row = pack.document.partner_types[partnerTypeCode as keyof typeof pack.document.partner_types];
    return row?.required_documents ?? [];
  }

  async transition(input: {
    kycCaseId: string;
    to: KycCaseStatus;
    actorId: string;
    reason?: string;
    requestId?: string;
  }) {
    const kyc = await this.prisma.kycCase.findUnique({
      where: { id: input.kycCaseId },
      include: { partner: true },
    });
    if (!kyc) {
      throw Errors.notFound('KYC case not found');
    }
    const ownerSubmit =
      kyc.partner.personId === input.actorId &&
      (input.to === KycCaseStatus.SUBMITTED || input.to === KycCaseStatus.IN_PROGRESS);
    if (!ownerSubmit) {
      await this.assertCan(input.actorId, kyc.partner, 'review');
    }
    assertKycTransition(kyc.status, input.to);
    const updated = await this.prisma.kycCase.update({
      where: { id: kyc.id },
      data: {
        status: input.to,
        reviewerId: input.actorId,
        rejectionReason: input.to === KycCaseStatus.REJECTED ? input.reason : kyc.rejectionReason,
        submittedAt: input.to === KycCaseStatus.SUBMITTED ? new Date() : kyc.submittedAt,
        verifiedAt: input.to === KycCaseStatus.VERIFIED ? new Date() : kyc.verifiedAt,
        rejectedAt: input.to === KycCaseStatus.REJECTED ? new Date() : kyc.rejectedAt,
      },
    });
    await this.events.emit({
      type: input.to === KycCaseStatus.SUBMITTED ? 'KYC_SUBMITTED' : 'KYC_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { kyc_case_id: kyc.id, to: input.to },
    });
    return updated;
  }

  async uploadDocument(input: {
    kycCaseId: string;
    actorId: string;
    documentTypeCode: string;
    bytes: Buffer;
    contentType: string;
    originalName: string;
    requestId?: string;
  }) {
    const kyc = await this.prisma.kycCase.findUnique({
      where: { id: input.kycCaseId },
      include: { partner: true },
    });
    if (!kyc) {
      throw Errors.notFound('KYC case not found');
    }
    await this.assertCan(input.actorId, kyc.partner, 'upload');
    if (!ALLOWED_KYC_CONTENT_TYPES.has(input.contentType)) {
      throw Errors.validation('Unsupported document type');
    }
    if (input.bytes.length > MAX_KYC_BYTES) {
      throw Errors.validation('Document exceeds size limit');
    }
    const scan = await this.scanner.scan(input.bytes, input.contentType);
    if (!scan.clean) {
      throw Errors.validation('Document failed malware scan');
    }
    const stored = await this.objects.put({
      bytes: input.bytes,
      contentType: input.contentType,
      prefix: `kyc/${kyc.id}`,
    });
    const safeName = sanitizeFilename(input.originalName);
    const doc = await this.prisma.partnerDocument.create({
      data: {
        id: uuidv7(),
        kycCaseId: kyc.id,
        countryId: kyc.countryId,
        documentTypeCode: input.documentTypeCode,
        objectKey: stored.key,
        contentType: input.contentType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        originalName: safeName,
        status: KycDocumentStatus.UPLOADED,
      },
    });
    this.logger.log(
      JSON.stringify({
        event: 'KYC_DOCUMENT_UPLOADED',
        kyc_case_id: kyc.id,
        document_id: doc.id,
        content_type: input.contentType,
        byte_size: stored.byteSize,
      }),
    );
    await this.events.emit({
      type: 'KYC_DOCUMENT_UPLOADED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { document_id: doc.id, kyc_case_id: kyc.id, content_type: input.contentType },
    });
    return { id: doc.id, contentType: doc.contentType, byteSize: doc.byteSize };
  }

  async reviewDocument(input: {
    documentId: string;
    actorId: string;
    approve: boolean;
    reason?: string;
    requestId?: string;
  }) {
    const doc = await this.prisma.partnerDocument.findUnique({
      where: { id: input.documentId },
      include: { kycCase: { include: { partner: true } } },
    });
    if (!doc) {
      throw Errors.notFound('Document not found');
    }
    await this.assertCan(input.actorId, doc.kycCase.partner, 'review');
    const updated = await this.prisma.partnerDocument.update({
      where: { id: doc.id },
      data: {
        status: input.approve ? KycDocumentStatus.VERIFIED : KycDocumentStatus.REJECTED,
        reviewerId: input.actorId,
        rejectionReason: input.approve ? null : input.reason,
        verifiedAt: input.approve ? new Date() : null,
        rejectedAt: input.approve ? null : new Date(),
      },
    });
    await this.events.emit({
      type: input.approve ? 'KYC_DOCUMENT_VERIFIED' : 'KYC_DOCUMENT_REJECTED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { document_id: doc.id },
    });
    return updated;
  }

  async listDocumentsForCase(kycCaseId: string, actorId: string) {
    const kyc = await this.prisma.kycCase.findUnique({
      where: { id: kycCaseId },
      include: { partner: true },
    });
    if (!kyc) {
      throw Errors.notFound('KYC case not found');
    }
    await this.assertCan(actorId, kyc.partner, 'view');
    const rows = await this.prisma.partnerDocument.findMany({
      where: { kycCaseId },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      document_type_code: row.documentTypeCode,
      status: row.status,
      content_type: row.contentType,
      byte_size: row.byteSize,
      original_name: row.originalName,
      rejection_reason: row.rejectionReason,
      uploaded_at: row.uploadedAt,
    }));
  }

  async listDocumentsForApplication(applicationId: string, actorId: string) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    if (application.partner.personId !== actorId) {
      await this.assertCan(actorId, application.partner, 'review');
    }
    const kyc = await this.prisma.kycCase.findFirst({
      where: { partnerId: application.partnerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!kyc) {
      return { data: [], kyc_case_id: null };
    }
    const docs = await this.listDocumentsForCase(kyc.id, actorId);
    return { data: docs, kyc_case_id: kyc.id };
  }

  async readDocument(input: {
    documentId: string;
    actorId: string;
    permission: 'view' | 'download';
    requestId?: string;
  }) {
    const doc = await this.prisma.partnerDocument.findUnique({
      where: { id: input.documentId },
      include: { kycCase: { include: { partner: true } } },
    });
    if (!doc) {
      throw Errors.notFound('Document not found');
    }
    await this.assertCan(input.actorId, doc.kycCase.partner, 'view');
    const bytes = await this.objects.get(doc.objectKey);
    await this.events.emit({
      type: input.permission === 'download' ? 'KYC_DOCUMENT_DOWNLOADED' : 'KYC_DOCUMENT_VIEWED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { document_id: doc.id },
    });
    return { bytes: bytes.bytes, contentType: doc.contentType, originalName: doc.originalName };
  }

  private async assertCan(
    actorId: string,
    partner: { personId: string; status: PartnerStatus },
    action: 'open' | 'upload' | 'view' | 'review',
  ): Promise<void> {
    const owner = partner.personId === actorId;
    if (action === 'upload' && owner && BLOCKED_OWNER_UPLOAD.has(partner.status)) {
      throw Errors.forbidden('Suspended partner cannot perform this action');
    }
    if (owner && action !== 'review') {
      return;
    }
    if (await this.rbac.hasPermission(actorId, 'kyc:review')) {
      return;
    }
    if (action === 'view' && (await this.rbac.hasPermission(actorId, 'kyc:document_read'))) {
      return;
    }
    throw Errors.forbidden();
  }
}
