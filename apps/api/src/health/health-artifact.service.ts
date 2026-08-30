import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { HealthArtifactType } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { EncounterConsultNoteService } from '../clinical/encounter-consult-note.service';
import { PrescriptionService } from '../clinical/prescription.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { PathologyService } from '../lab/pathology.service';
import { InterpretationService } from '../radiology/interpretation.service';
import {
  ArtifactReadDecision,
  ClinicalAccessService,
} from '../clinical/clinical-access.service';
import { artifactReadDenialMessage } from '../clinical/consent-scope';
import { authTenantContext } from '../tenancy/build-tenant-context';
import { HealthTimelineService } from './health-timeline.service';
import { HealthUploadService } from './health-upload.service';

@Injectable()
export class HealthAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
    private readonly clinicalAccess: ClinicalAccessService,
  ) {}

  async recordAccess(input: {
    countryId: string;
    artifactId: string;
    actorPersonId: string;
    patientPersonId: string;
    purpose: string;
    allowed: boolean;
    reason: string;
    requestId?: string;
    doctorPartnerId?: string;
    organizationId?: string;
    artifactType?: HealthArtifactType;
  }) {
    const audit = await this.prisma.runWithTenant(
      authTenantContext(input.actorPersonId),
      async () =>
        this.prisma.healthArtifactAccessAudit.create({
          data: {
            id: uuidv7(),
            countryId: input.countryId,
            artifactId: input.artifactId,
            actorPersonId: input.actorPersonId,
            patientPersonId: input.patientPersonId,
            doctorPartnerId: input.doctorPartnerId ?? null,
            organizationId: input.organizationId ?? null,
            purpose: input.purpose,
            allowed: input.allowed,
            reason: input.reason,
            requestId: input.requestId ?? null,
          },
        }),
      { fresh: true },
    );
    await this.security.emit({
      type: 'HEALTH_ARTIFACT_READ',
      outcome: input.allowed ? 'success' : 'failure',
      personId: input.actorPersonId,
      requestId: input.requestId,
      metadata: {
        artifact_id: input.artifactId,
        artifact_type: input.artifactType ?? null,
        allowed: input.allowed,
        reason: input.reason,
        audit_id: audit.id,
      },
    });
    return audit;
  }

  async assertCanAccessPatientHealth(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    purpose: string;
    countryId: string;
    countryCode: string;
    organizationId?: string;
  }): Promise<ArtifactReadDecision> {
    const decision = await this.clinicalAccess.evaluateForPatientHealthRead({
      actorId: input.actorId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
      organizationId: input.organizationId,
    });
    if (!decision.allowed) {
      throw Errors.forbidden(artifactReadDenialMessage(decision.reason));
    }
    return decision;
  }

  async assertCanReadArtifactPayload(input: {
    actorId: string;
    audience: string;
    patientPersonId: string;
    artifact: {
      id: string;
      artifactType: HealthArtifactType;
      personId: string;
      countryId: string | null;
      publishedAt: Date | null;
    };
    purpose: string;
    countryId: string;
    countryCode: string;
    requestId?: string;
    organizationId?: string;
  }): Promise<ArtifactReadDecision> {
    const decision = await this.clinicalAccess.evaluateForArtifactRead({
      actorId: input.actorId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      artifactType: input.artifact.artifactType,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
      organizationId: input.organizationId,
    });
    await this.recordAccess({
      countryId: input.countryId,
      artifactId: input.artifact.id,
      actorPersonId: input.actorId,
      patientPersonId: input.patientPersonId,
      purpose: input.purpose,
      allowed: decision.allowed,
      reason: decision.reason,
      requestId: input.requestId,
      doctorPartnerId: decision.doctorPartnerId ?? undefined,
      organizationId: decision.organizationId ?? undefined,
      artifactType: input.artifact.artifactType,
    });
    if (!decision.allowed) {
      throw Errors.forbidden(artifactReadDenialMessage(decision.reason));
    }
    return decision;
  }

  assertPatientOwnership(patientPersonId: string, actorPersonId: string) {
    if (patientPersonId !== actorPersonId) {
      throw Errors.forbidden('You cannot access another person’s health record.');
    }
  }
}

@Injectable()
export class HealthArtifactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HealthAccessService,
    private readonly timeline: HealthTimelineService,
    private readonly pathology: PathologyService,
    private readonly interpretation: InterpretationService,
    @Inject(forwardRef(() => PrescriptionService))
    private readonly prescriptions: PrescriptionService,
    @Inject(forwardRef(() => EncounterConsultNoteService))
    private readonly consultNotes: EncounterConsultNoteService,
    private readonly uploads: HealthUploadService,
  ) {}

  async getMetadataForPatient(input: { artifactId: string; personId: string; countryId: string }) {
    const artifact = await this.loadOwnedArtifact(input.artifactId, input.personId, input.countryId);
    return this.presentMetadata(artifact);
  }

  async getMetadataForDoctor(input: {
    artifactId: string;
    patientPersonId: string;
    doctorPersonId: string;
    countryId: string;
    countryCode: string;
    purpose: string;
    audience: string;
    requestId?: string;
    organizationId?: string;
  }) {
    const artifact = await this.asPatientTenant(input.patientPersonId, () =>
      this.loadPatientArtifact(input.artifactId, input.patientPersonId, input.countryId),
    );
    await this.access.assertCanReadArtifactPayload({
      actorId: input.doctorPersonId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      artifact,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
      requestId: input.requestId,
      organizationId: input.organizationId,
    });
    return this.presentMetadata(artifact);
  }

  async getTimelineForDoctor(input: {
    patientPersonId: string;
    doctorPersonId: string;
    countryId: string;
    countryCode: string;
    purpose: string;
    audience: string;
    cursor?: string;
    limit?: number;
    types?: HealthArtifactType[];
  }) {
    const decision = await this.access.assertCanAccessPatientHealth({
      actorId: input.doctorPersonId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
    });
    const page = await this.asPatientTenant(input.patientPersonId, () =>
      this.timeline.listForPatient({
        personId: input.patientPersonId,
        countryId: input.countryId,
        types: input.types,
        cursor: input.cursor,
        limit: input.limit,
      }),
    );
    const scope = decision.consentScope ?? [];
    const items = page.items.filter(
      (item) =>
        !item.artifact_type ||
        scope.includes(item.artifact_type as HealthArtifactType),
    );
    return { items, next_cursor: page.next_cursor };
  }

  async getPayloadForPatient(input: {
    artifactId: string;
    personId: string;
    countryId: string;
    countryCode: string;
    audience: string;
    requestId?: string;
  }) {
    const artifact = await this.loadOwnedArtifact(input.artifactId, input.personId, input.countryId);
    return this.resolvePayload({
      artifact,
      patientPersonId: input.personId,
      actorId: input.personId,
      audience: input.audience,
      countryId: input.countryId,
      countryCode: input.countryCode,
      purpose: 'patient_self',
      requestId: input.requestId,
    });
  }

  async getPayloadForDoctor(input: {
    artifactId: string;
    patientPersonId: string;
    doctorPersonId: string;
    countryId: string;
    countryCode: string;
    purpose: string;
    audience: string;
    requestId?: string;
    organizationId?: string;
  }) {
    const artifact = await this.asPatientTenant(input.patientPersonId, () =>
      this.loadPatientArtifact(input.artifactId, input.patientPersonId, input.countryId),
    );
    if (!artifact.publishedAt) {
      throw Errors.problem(404, 'ARTIFACT_NOT_AVAILABLE', 'Artifact not available', 'Report is not published yet.');
    }
    await this.access.assertCanReadArtifactPayload({
      actorId: input.doctorPersonId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      artifact,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
      requestId: input.requestId,
      organizationId: input.organizationId,
    });
    return this.asPatientTenant(input.patientPersonId, () =>
      this.delegatePayload(artifact, input.patientPersonId),
    );
  }

  private async resolvePayload(input: {
    artifact: {
      id: string;
      artifactType: HealthArtifactType;
      personId: string;
      countryId: string | null;
      publishedAt: Date | null;
      labBookingId: string | null;
      imagingBookingId: string | null;
      prescriptionId: string | null;
      prescriptionVersionId: string | null;
    };
    patientPersonId: string;
    actorId: string;
    audience: string;
    countryId: string;
    countryCode: string;
    purpose: string;
    requestId?: string;
    organizationId?: string;
  }) {
    if (!input.artifact.publishedAt) {
      throw Errors.problem(404, 'ARTIFACT_NOT_AVAILABLE', 'Artifact not available', 'Report is not published yet.');
    }
    await this.access.assertCanReadArtifactPayload({
      actorId: input.actorId,
      audience: input.audience,
      patientPersonId: input.patientPersonId,
      artifact: input.artifact,
      purpose: input.purpose,
      countryId: input.countryId,
      countryCode: input.countryCode,
      requestId: input.requestId,
      organizationId: input.organizationId,
    });
    return this.delegatePayload(input.artifact, input.patientPersonId);
  }

  private asPatientTenant<T>(patientPersonId: string, fn: () => Promise<T>) {
    return this.prisma.runWithTenant(authTenantContext(patientPersonId), fn);
  }

  private async loadOwnedArtifact(artifactId: string, personId: string, countryId: string) {
    const artifact = await this.prisma.healthArtifact.findUnique({
      where: { id: artifactId },
      include: { upload: true },
    });
    if (!artifact || artifact.personId !== personId) {
      throw Errors.notFound('Health artifact not found');
    }
    if (artifact.countryId && artifact.countryId !== countryId) {
      throw Errors.forbidden('Health artifact is not available in this country.');
    }
    return artifact;
  }

  private async loadPatientArtifact(artifactId: string, patientPersonId: string, countryId: string) {
    const artifact = await this.prisma.healthArtifact.findUnique({
      where: { id: artifactId },
      include: { upload: true },
    });
    if (!artifact || artifact.personId !== patientPersonId) {
      throw Errors.notFound('Health artifact not found');
    }
    if (artifact.countryId && artifact.countryId !== countryId) {
      throw Errors.forbidden('Health artifact is not available in this country.');
    }
    return artifact;
  }

  private presentMetadata(artifact: {
    id: string;
    artifactType: HealthArtifactType;
    title: string | null;
    publishedAt: Date;
    sandbox: boolean;
    labBookingId: string | null;
    imagingBookingId: string | null;
    prescriptionId: string | null;
    prescriptionVersionId: string | null;
    encounterId?: string | null;
    status: string;
    upload?: { id: string } | null;
  }) {
    return {
      id: artifact.id,
      artifact_type: artifact.artifactType,
      title: artifact.title ?? this.defaultTitle(artifact.artifactType),
      published_at: artifact.publishedAt.toISOString(),
      sandbox: artifact.sandbox,
      source_module: artifact.upload
        ? 'upload'
        : artifact.encounterId
          ? 'encounter'
          : artifact.labBookingId
            ? 'lab'
            : artifact.imagingBookingId
              ? 'radiology'
              : artifact.prescriptionId
                ? 'clinical'
                : null,
      source_id:
        artifact.upload?.id ??
        artifact.encounterId ??
        artifact.labBookingId ??
        artifact.imagingBookingId ??
        artifact.prescriptionVersionId,
      status: artifact.status,
      payload_available: Boolean(artifact.publishedAt),
    };
  }

  private defaultTitle(type: HealthArtifactType) {
    if (type === HealthArtifactType.LAB_REPORT) {
      return 'Lab diagnostic report';
    }
    if (type === HealthArtifactType.IMAGING_REPORT) {
      return 'Imaging report';
    }
    if (type === HealthArtifactType.PRESCRIPTION_STRUCTURED) {
      return 'Prescription';
    }
    if (type === HealthArtifactType.DOCUMENT) {
      return 'Uploaded health document';
    }
    if (type === HealthArtifactType.PRESCRIPTION_UPLOAD) {
      return 'Uploaded prescription image';
    }
    if (type === HealthArtifactType.CONSULT_NOTE) {
      return 'Consultation summary';
    }
    return 'Health record';
  }

  private async delegatePayload(
    artifact: {
      id: string;
      artifactType: HealthArtifactType;
      labBookingId: string | null;
      imagingBookingId: string | null;
      prescriptionId: string | null;
      prescriptionVersionId: string | null;
      encounterId?: string | null;
    },
    personId: string,
  ) {
    if (artifact.artifactType === HealthArtifactType.LAB_REPORT && artifact.labBookingId) {
      const report = await this.pathology.getCustomerPublishedReport(artifact.labBookingId, personId);
      return { artifact_type: artifact.artifactType, payload: report };
    }
    if (artifact.artifactType === HealthArtifactType.IMAGING_REPORT && artifact.imagingBookingId) {
      const report = await this.interpretation.getCustomerPublishedReport(artifact.imagingBookingId, personId);
      return { artifact_type: artifact.artifactType, payload: report };
    }
    if (
      artifact.artifactType === HealthArtifactType.PRESCRIPTION_STRUCTURED &&
      artifact.prescriptionId &&
      artifact.prescriptionVersionId
    ) {
      const report = await this.prescriptions.customerPrescriptionForHealth(
        personId,
        artifact.prescriptionId,
        artifact.prescriptionVersionId,
      );
      return { artifact_type: artifact.artifactType, payload: report };
    }
    if (
      (artifact.artifactType === HealthArtifactType.DOCUMENT ||
        artifact.artifactType === HealthArtifactType.PRESCRIPTION_UPLOAD)
    ) {
      const payload = await this.uploads.getUploadPayload(artifact.id, personId);
      return { artifact_type: artifact.artifactType, payload };
    }
    if (artifact.artifactType === HealthArtifactType.CONSULT_NOTE && artifact.encounterId) {
      const payload = await this.consultNotes.getHealthPayload(artifact.encounterId, personId);
      return { artifact_type: artifact.artifactType, payload };
    }
    throw Errors.problem(404, 'ARTIFACT_NOT_AVAILABLE', 'Artifact not available', 'Payload is not available for this artifact.');
  }
}
