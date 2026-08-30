import { Injectable } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { assertImagingOrgAccess } from '../catalog/access';
import { workerTenantContext } from '../tenancy/build-tenant-context';

/** Product attestation — not legal accreditation, licensing, or production healthcare authorization. */
export const RADIOLOGY_PARTNER_ATTESTATION_CODE = 'RADIOLOGY_PARTNER_SANDBOX_V1' as const;

export type ImagingEligibilityState =
  | 'ELIGIBLE'
  | 'PENDING'
  | 'BLOCKED'
  | 'REQUIRES_ATTESTATION'
  | 'DISABLED';

export type ImagingAcceptance = 'NONE' | 'PENDING' | 'ACCEPTED' | 'BLOCKED';

type ImagingRecord = {
  attested_at?: string;
  attested_by?: string;
  attestation_code?: string;
  acceptance: ImagingAcceptance;
  accepted_at?: string;
  accepted_by?: string;
  blocked_reason?: string;
  updated_at: string;
};

export type ImagingEligibilityView = {
  imaging_org_id: string;
  country_code: string | null;
  state: ImagingEligibilityState;
  acceptance: ImagingAcceptance;
  attestation_code_required: typeof RADIOLOGY_PARTNER_ATTESTATION_CODE;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    imaging_center_enabled: boolean;
    imaging_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    imaging_organization: boolean;
    imaging_service: boolean;
    imaging_partner_type: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  booking_enabled: boolean;
  live_payout: false;
};

@Injectable()
export class RadiologyCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly policy: PolicyResolver,
    private readonly security: SecurityEventsService,
  ) {}

  private recordKey(imagingOrgId: string) {
    return `radiology:partner:${imagingOrgId}`;
  }

  private async loadRecord(imagingOrgId: string): Promise<ImagingRecord> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.get(this.recordKey(imagingOrgId));
    if (!raw) {
      return { acceptance: 'NONE', updated_at: new Date().toISOString() };
    }
    try {
      const parsed = JSON.parse(raw) as ImagingRecord;
      return {
        acceptance: parsed.acceptance ?? 'NONE',
        attested_at: parsed.attested_at,
        attested_by: parsed.attested_by,
        attestation_code: parsed.attestation_code,
        accepted_at: parsed.accepted_at,
        accepted_by: parsed.accepted_by,
        blocked_reason: parsed.blocked_reason,
        updated_at: parsed.updated_at ?? new Date().toISOString(),
      };
    } catch {
      return { acceptance: 'NONE', updated_at: new Date().toISOString() };
    }
  }

  private async saveRecord(imagingOrgId: string, record: ImagingRecord): Promise<void> {
    await this.redis.ensureConnected();
    await this.redis.client.set(
      this.recordKey(imagingOrgId),
      JSON.stringify(record),
      'EX',
      60 * 60 * 24 * 365 * 5,
    );
  }

  async evaluate(imagingOrgId: string): Promise<ImagingEligibilityView> {
    const org = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findUnique({
        where: { id: imagingOrgId },
        include: { country: { select: { isoAlpha2: true, id: true } } },
      }),
    );
    const sandbox_note =
      'Imaging partner capability is pack-gated and sandbox-only. Booking, acquisition, interpretation, DICOM/PACS, and live money remain OFF (R8-B+ / R14).';
    if (!org || org.kind !== OrganizationKind.IMAGING_CENTER) {
      return {
        imaging_org_id: imagingOrgId,
        country_code: null,
        state: 'DISABLED',
        acceptance: 'NONE',
        attestation_code_required: RADIOLOGY_PARTNER_ATTESTATION_CODE,
        attested: false,
        attested_at: null,
        pack: {
          published: false,
          imaging_center_enabled: false,
          imaging_partner_type_enabled: false,
        },
        organization_status: org?.status ?? null,
        gates: {
          country: false,
          imaging_organization: false,
          imaging_service: false,
          imaging_partner_type: false,
          catalog_write: false,
        },
        blocked_reason: 'Organization is not an imaging center.',
        next_action: null,
        sandbox_note,
        booking_enabled: false,
        live_payout: false,
      };
    }

    const countryCode = org.country.isoAlpha2;
    const resolved = await this.policy.resolvePublished(countryCode);
    const document = resolved?.document ?? null;
    const packPublished = Boolean(resolved);
    const imagingCenter = this.policy.canUseService(document, 'imaging_center');
    const imagingTypeEnabled = this.policy.isPartnerTypeEnabled(document, 'IMAGING_CENTER');
    const record = await this.loadRecord(imagingOrgId);
    const attested =
      Boolean(record.attested_at) && record.attestation_code === RADIOLOGY_PARTNER_ATTESTATION_CODE;
    const orgActive = org.status === OrganizationStatus.ACTIVE;

    let state: ImagingEligibilityState;
    let blocked_reason: string | null = null;
    let next_action: string | null = null;

    if (!packPublished || !document) {
      state = 'DISABLED';
      blocked_reason = 'No published country pack. Imaging capability is fail-closed.';
    } else if (!imagingCenter) {
      state = 'DISABLED';
      blocked_reason = 'imaging_center service is disabled for this country pack.';
    } else if (!imagingTypeEnabled) {
      state = 'DISABLED';
      blocked_reason = 'IMAGING_CENTER partner type is disabled for this country pack.';
    } else if (!orgActive) {
      state = 'BLOCKED';
      blocked_reason = `Organization status is ${org.status}.`;
      next_action = 'Ask company governance to activate the imaging center organization.';
    } else if (record.acceptance === 'BLOCKED') {
      state = 'BLOCKED';
      blocked_reason = record.blocked_reason ?? 'Company governance blocked imaging participation.';
    } else if (!attested) {
      state = 'REQUIRES_ATTESTATION';
      next_action = `Submit attestation code ${RADIOLOGY_PARTNER_ATTESTATION_CODE}.`;
    } else if (record.acceptance !== 'ACCEPTED') {
      state = 'PENDING';
      next_action = 'Waiting for company governance acceptance.';
    } else {
      state = 'ELIGIBLE';
      next_action = null;
    }

    return {
      imaging_org_id: imagingOrgId,
      country_code: countryCode,
      state,
      acceptance: record.acceptance,
      attestation_code_required: RADIOLOGY_PARTNER_ATTESTATION_CODE,
      attested,
      attested_at: record.attested_at ?? null,
      pack: {
        published: packPublished,
        imaging_center_enabled: imagingCenter,
        imaging_partner_type_enabled: imagingTypeEnabled,
      },
      organization_status: org.status,
      gates: {
        country: packPublished,
        imaging_organization: orgActive,
        imaging_service: imagingCenter,
        imaging_partner_type: imagingTypeEnabled,
        catalog_write: state === 'ELIGIBLE',
      },
      blocked_reason,
      next_action,
      sandbox_note,
      booking_enabled: state === 'ELIGIBLE',
      live_payout: false,
    };
  }

  async assertCatalogWrite(principal: Principal, imagingOrgId: string): Promise<ImagingEligibilityView> {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const view = await this.evaluate(imagingOrgId);
    if (view.state === 'ELIGIBLE' && view.gates.catalog_write) {
      return view;
    }
    if (view.state === 'REQUIRES_ATTESTATION') {
      throw Errors.problem(
        403,
        'IMAGING_ATTESTATION_REQUIRED',
        'Attestation required',
        view.next_action ?? 'Imaging partner attestation is required.',
      );
    }
    if (view.state === 'PENDING') {
      throw Errors.problem(
        403,
        'IMAGING_PENDING_ACCEPTANCE',
        'Acceptance pending',
        view.next_action ?? 'Company governance must accept imaging participation.',
      );
    }
    if (view.state === 'BLOCKED') {
      throw Errors.problem(
        403,
        'IMAGING_BLOCKED',
        'Imaging blocked',
        view.blocked_reason ?? 'Imaging participation is blocked.',
      );
    }
    throw Errors.serviceDisabled(view.blocked_reason ?? 'Imaging capability is not available for this organization.');
  }

  async attest(principal: Principal, imagingOrgId: string, code: string): Promise<ImagingEligibilityView> {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const current = await this.evaluate(imagingOrgId);
    if (
      !current.pack.published ||
      !current.pack.imaging_center_enabled ||
      !current.pack.imaging_partner_type_enabled
    ) {
      throw Errors.serviceDisabled(current.blocked_reason ?? 'Imaging pack gate failed.');
    }
    if (current.organization_status !== OrganizationStatus.ACTIVE) {
      throw Errors.forbidden(current.blocked_reason ?? 'Organization is not active.');
    }
    if (current.acceptance === 'BLOCKED') {
      throw Errors.problem(403, 'IMAGING_BLOCKED', 'Imaging blocked', current.blocked_reason ?? 'Blocked.');
    }
    if (code !== RADIOLOGY_PARTNER_ATTESTATION_CODE) {
      throw Errors.validation(
        `Invalid attestation code. Required: ${RADIOLOGY_PARTNER_ATTESTATION_CODE} (sandbox product acknowledgement, not a legal accreditation).`,
      );
    }
    const now = new Date().toISOString();
    const record = await this.loadRecord(imagingOrgId);
    const next: ImagingRecord = {
      ...record,
      attested_at: now,
      attested_by: principal.personId,
      attestation_code: RADIOLOGY_PARTNER_ATTESTATION_CODE,
      acceptance: record.acceptance === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
      updated_at: now,
    };
    if (next.acceptance === 'NONE') {
      next.acceptance = 'PENDING';
    }
    await this.saveRecord(imagingOrgId, next);
    const updated = await this.evaluate(imagingOrgId);
    await this.security.emit({
      type: 'IMAGING_PARTNER_ATTESTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_org_id: imagingOrgId,
        attestation_code: RADIOLOGY_PARTNER_ATTESTATION_CODE,
        country_code: current.country_code,
        sandbox: true,
        booking_enabled: updated.booking_enabled,
        live_payout: false,
      },
    });
    return updated;
  }

  async setAcceptance(
    actorPersonId: string,
    imagingOrgId: string,
    action: 'accept' | 'block' | 'reset',
    reason?: string,
  ): Promise<ImagingEligibilityView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: imagingOrgId },
      select: { id: true, kind: true },
    });
    if (!org || org.kind !== OrganizationKind.IMAGING_CENTER) {
      throw Errors.forbidden('Organization is not an imaging center.');
    }
    const record = await this.loadRecord(imagingOrgId);
    const now = new Date().toISOString();
    let next: ImagingRecord = { ...record, updated_at: now };
    if (action === 'accept') {
      if (!record.attested_at || record.attestation_code !== RADIOLOGY_PARTNER_ATTESTATION_CODE) {
        throw Errors.validation('Imaging partner must attest before company acceptance.');
      }
      next = {
        ...next,
        acceptance: 'ACCEPTED',
        accepted_at: now,
        accepted_by: actorPersonId,
        blocked_reason: undefined,
      };
    } else if (action === 'block') {
      next = {
        ...next,
        acceptance: 'BLOCKED',
        blocked_reason: reason?.trim() || 'Blocked by company governance.',
        accepted_by: actorPersonId,
        accepted_at: now,
      };
    } else {
      next = {
        attested_at: record.attested_at,
        attested_by: record.attested_by,
        attestation_code: record.attestation_code,
        acceptance: record.attested_at ? 'PENDING' : 'NONE',
        updated_at: now,
      };
    }
    await this.saveRecord(imagingOrgId, next);
    const updated = await this.evaluate(imagingOrgId);
    await this.security.emit({
      type:
        action === 'accept'
          ? 'IMAGING_PARTNER_ACCEPTED'
          : action === 'block'
            ? 'IMAGING_PARTNER_BLOCKED'
            : 'IMAGING_PARTNER_ACCEPTANCE_RESET',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        imaging_org_id: imagingOrgId,
        action,
        reason: reason?.trim() || undefined,
        sandbox: true,
        booking_enabled: updated.booking_enabled,
        live_payout: false,
      },
    });
    return updated;
  }

  async listImagingActivity(principal: Principal, imagingOrgId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        personId: principal.personId,
        type: {
          in: [
            'IMAGING_PARTNER_ATTESTED',
            'IMAGING_PARTNER_ACCEPTED',
            'IMAGING_PARTNER_BLOCKED',
            'IMAGING_PARTNER_ACCEPTANCE_RESET',
            'ORGANIZATION_MEMBER_ADDED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        outcome: true,
        metadata: true,
        createdAt: true,
      },
    });
    const filtered = rows.filter((row) => {
      const meta = row.metadata as { imaging_org_id?: string } | null;
      if (!meta?.imaging_org_id) {
        return true;
      }
      return meta.imaging_org_id === imagingOrgId;
    });
    return {
      data: filtered.map((row) => ({
        id: row.id,
        type: row.type,
        outcome: row.outcome,
        created_at: row.createdAt.toISOString(),
        metadata: this.sanitizeActivityMetadata(row.metadata),
      })),
      note: 'Imaging activity from shared security-event kernel. No clinical PHI. Acquisition and reports remain OFF.',
    };
  }

  private sanitizeActivityMetadata(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const src = metadata as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of [
      'imaging_org_id',
      'attestation_code',
      'country_code',
      'action',
      'sandbox',
      'booking_enabled',
      'live_payout',
    ]) {
      if (key in src) {
        out[key] = src[key];
      }
    }
    return out;
  }
}
