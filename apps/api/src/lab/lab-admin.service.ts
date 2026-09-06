import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { LabCapabilityService } from './lab-capability.service';

const LAB_REVIEW_EVENT = 'LAB_PARTNER_REVIEW';

@Injectable()
export class LabAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capability: LabCapabilityService,
    private readonly events: SecurityEventsService,
  ) {}

  async listAdminLabs() {
    const rows = await this.prisma.partner.findMany({
      where: { partnerTypeCode: 'LAB' },
      include: {
        organization: { include: { country: { select: { isoAlpha2: true } } } },
        applications: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const offerCounts = await Promise.all(
      rows.map(async (row) => {
        if (!row.organizationId) {
          return 0;
        }
        return this.prisma.catalogOffer.count({ where: { sellerOrgId: row.organizationId } });
      }),
    );
    return {
      labs: rows.map((row, index) => ({
        partner_id: row.id,
        display_name: row.organization?.displayName ?? row.id.slice(0, 8),
        status: row.status,
        application_id: row.applications[0]?.id,
        application_status: row.applications[0]?.status,
        country_code: row.organization?.country?.isoAlpha2 ?? undefined,
        test_offer_count: offerCounts[index],
      })),
    };
  }

  async getAdminLab(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        organization: {
          include: {
            country: { select: { isoAlpha2: true } },
            locations: { take: 20, orderBy: { createdAt: 'asc' } },
          },
        },
        applications: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!partner || partner.partnerTypeCode !== 'LAB') {
      throw Errors.notFound('Lab partner not found');
    }
    const org = partner.organization;
    let capabilities: Array<{ id: string; name: string; status: string }> = [];
    if (org?.id) {
      const view = await this.capability.evaluate(org.id);
      capabilities = [
        { id: 'lab_home', name: 'Home collection', status: view.pack.lab_home_enabled ? 'ENABLED' : 'DISABLED' },
        { id: 'lab_center', name: 'Center collection', status: view.pack.lab_center_enabled ? 'ENABLED' : 'DISABLED' },
        { id: 'eligibility', name: 'Partner eligibility', status: view.state },
        { id: 'acceptance', name: 'Company acceptance', status: view.acceptance },
      ];
    }
    const reports = org?.id
      ? await this.prisma.labReport.findMany({
          where: { labOrgId: org.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { currentVersion: { select: { status: true } } },
        })
      : [];
    const reviewEvents = await this.prisma.securityEvent.findMany({
      where: {
        type: LAB_REVIEW_EVENT,
        metadata: { path: ['partner_id'], equals: partnerId },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      partner_id: partner.id,
      status: partner.status,
      profile: org
        ? {
            display_name: org.displayName,
            legal_name: org.legalName,
            country_code: org.country?.isoAlpha2,
            accreditation_status: partner.status,
            capabilities: capabilities.filter((c) => c.status === 'ENABLED' || c.status === 'ELIGIBLE').map((c) => c.id),
          }
        : null,
      applications: partner.applications.map((row) => ({
        id: row.id,
        status: row.status,
      })),
      capabilities,
      locations: (org?.locations ?? []).map((loc) => ({
        id: loc.id,
        name: loc.name,
        city: loc.city ?? undefined,
        pincode: loc.postalCode ?? undefined,
      })),
      reports: reports.map((row) => ({
        id: row.id,
        status: row.currentVersion?.status ?? 'DRAFT',
        created_at: row.createdAt.toISOString(),
        lab_booking_id: row.labBookingId,
      })),
      reviews: reviewEvents.map((row) => {
        const meta = (row.metadata ?? {}) as { action?: string; notes?: string };
        return {
          id: row.id,
          action: meta.action ?? 'NOTE',
          notes: meta.notes ?? null,
          created_at: row.createdAt.toISOString(),
        };
      }),
      kyc_separated: true,
    };
  }

  async addVerificationNote(input: {
    actorId: string;
    partnerId: string;
    action: string;
    notes?: string;
    requestId?: string;
  }) {
    const partner = await this.prisma.partner.findUnique({ where: { id: input.partnerId } });
    if (!partner || partner.partnerTypeCode !== 'LAB') {
      throw Errors.notFound('Lab partner not found');
    }
    await this.events.emit({
      type: LAB_REVIEW_EVENT,
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: {
        partner_id: input.partnerId,
        action: input.action,
        notes: input.notes ?? null,
        organization_id: partner.organizationId,
      },
    });
    const row = await this.prisma.securityEvent.findFirst({
      where: {
        type: LAB_REVIEW_EVENT,
        personId: input.actorId,
        metadata: { path: ['partner_id'], equals: input.partnerId },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: row?.id ?? uuidv7(),
      action: input.action,
      notes: input.notes,
      created_at: new Date().toISOString(),
    };
  }
}
