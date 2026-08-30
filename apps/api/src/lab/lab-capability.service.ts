import { Injectable } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { assertLabOrgAccess } from '../catalog/access';
import { workerTenantContext } from '../tenancy/build-tenant-context';

/** Product attestation — not legal accreditation or licensing. Pack flags remain authoritative. */
export const LAB_PARTNER_ATTESTATION_CODE = 'LAB_PARTNER_SANDBOX_V1' as const;

export type LabEligibilityState =
  | 'ELIGIBLE'
  | 'PENDING'
  | 'BLOCKED'
  | 'REQUIRES_ATTESTATION'
  | 'DISABLED';

export type LabAcceptance = 'NONE' | 'PENDING' | 'ACCEPTED' | 'BLOCKED';

type LabRecord = {
  attested_at?: string;
  attested_by?: string;
  attestation_code?: string;
  acceptance: LabAcceptance;
  accepted_at?: string;
  accepted_by?: string;
  blocked_reason?: string;
  updated_at: string;
};

export type LabEligibilityView = {
  lab_org_id: string;
  country_code: string | null;
  state: LabEligibilityState;
  acceptance: LabAcceptance;
  attestation_code_required: typeof LAB_PARTNER_ATTESTATION_CODE;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    lab_home_enabled: boolean;
    lab_center_enabled: boolean;
    lab_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    lab_organization: boolean;
    lab_service: boolean;
    lab_partner_type: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  booking_enabled: boolean;
  live_payout: false;
};

@Injectable()
export class LabCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly policy: PolicyResolver,
    private readonly security: SecurityEventsService,
  ) {}

  private recordKey(labOrgId: string) {
    return `lab:partner:${labOrgId}`;
  }

  private async loadRecord(labOrgId: string): Promise<LabRecord> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.get(this.recordKey(labOrgId));
    if (!raw) {
      return { acceptance: 'NONE', updated_at: new Date().toISOString() };
    }
    try {
      const parsed = JSON.parse(raw) as LabRecord;
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

  private async saveRecord(labOrgId: string, record: LabRecord): Promise<void> {
    await this.redis.ensureConnected();
    await this.redis.client.set(
      this.recordKey(labOrgId),
      JSON.stringify(record),
      'EX',
      60 * 60 * 24 * 365 * 5,
    );
  }

  async evaluate(labOrgId: string): Promise<LabEligibilityView> {
    // Public capability read uses worker tenant — customers are not members of LAB orgs (RLS).
    const org = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findUnique({
        where: { id: labOrgId },
        include: { country: { select: { isoAlpha2: true, id: true } } },
      }),
    );
    const sandbox_note =
      'Lab partner capability is pack-gated and sandbox-only. Specimen collection, CoC, pathology, and live money remain OFF (R7-C+ / R14).';
    if (!org || org.kind !== OrganizationKind.LAB) {
      return {
        lab_org_id: labOrgId,
        country_code: null,
        state: 'DISABLED',
        acceptance: 'NONE',
        attestation_code_required: LAB_PARTNER_ATTESTATION_CODE,
        attested: false,
        attested_at: null,
        pack: {
          published: false,
          lab_home_enabled: false,
          lab_center_enabled: false,
          lab_partner_type_enabled: false,
        },
        organization_status: org?.status ?? null,
        gates: {
          country: false,
          lab_organization: false,
          lab_service: false,
          lab_partner_type: false,
          catalog_write: false,
        },
        blocked_reason: 'Organization is not a laboratory.',
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
    const labHome = this.policy.canUseService(document, 'lab_home');
    const labCenter = this.policy.canUseService(document, 'lab_center');
    const labService = labHome || labCenter;
    const labTypeEnabled = this.policy.isPartnerTypeEnabled(document, 'LAB');
    const record = await this.loadRecord(labOrgId);
    const attested =
      Boolean(record.attested_at) && record.attestation_code === LAB_PARTNER_ATTESTATION_CODE;
    const orgActive = org.status === OrganizationStatus.ACTIVE;

    let state: LabEligibilityState;
    let blocked_reason: string | null = null;
    let next_action: string | null = null;

    if (!packPublished || !document) {
      state = 'DISABLED';
      blocked_reason = 'No published country pack. Lab capability is fail-closed.';
    } else if (!labService) {
      state = 'DISABLED';
      blocked_reason = 'lab_home and lab_center services are disabled for this country pack.';
    } else if (!labTypeEnabled) {
      state = 'DISABLED';
      blocked_reason = 'LAB partner type is disabled for this country pack.';
    } else if (!orgActive) {
      state = 'BLOCKED';
      blocked_reason = `Organization status is ${org.status}.`;
      next_action = 'Ask company governance to activate the laboratory organization.';
    } else if (record.acceptance === 'BLOCKED') {
      state = 'BLOCKED';
      blocked_reason = record.blocked_reason ?? 'Company governance blocked lab participation.';
    } else if (!attested) {
      state = 'REQUIRES_ATTESTATION';
      next_action = `Submit attestation code ${LAB_PARTNER_ATTESTATION_CODE}.`;
    } else if (record.acceptance !== 'ACCEPTED') {
      state = 'PENDING';
      next_action = 'Waiting for company governance acceptance.';
    } else {
      state = 'ELIGIBLE';
      next_action = null;
    }

    return {
      lab_org_id: labOrgId,
      country_code: countryCode,
      state,
      acceptance: record.acceptance,
      attestation_code_required: LAB_PARTNER_ATTESTATION_CODE,
      attested,
      attested_at: record.attested_at ?? null,
      pack: {
        published: packPublished,
        lab_home_enabled: labHome,
        lab_center_enabled: labCenter,
        lab_partner_type_enabled: labTypeEnabled,
      },
      organization_status: org.status,
      gates: {
        country: packPublished,
        lab_organization: orgActive,
        lab_service: labService,
        lab_partner_type: labTypeEnabled,
        catalog_write: state === 'ELIGIBLE',
      },
      blocked_reason,
      next_action,
      sandbox_note,
      booking_enabled: state === 'ELIGIBLE',
      live_payout: false,
    };
  }

  async assertCatalogWrite(principal: Principal, labOrgId: string): Promise<LabEligibilityView> {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const view = await this.evaluate(labOrgId);
    if (view.state === 'ELIGIBLE' && view.gates.catalog_write) {
      return view;
    }
    if (view.state === 'REQUIRES_ATTESTATION') {
      throw Errors.problem(
        403,
        'LAB_ATTESTATION_REQUIRED',
        'Attestation required',
        view.next_action ?? 'Lab partner attestation is required.',
      );
    }
    if (view.state === 'PENDING') {
      throw Errors.problem(
        403,
        'LAB_PENDING_ACCEPTANCE',
        'Acceptance pending',
        view.next_action ?? 'Company governance must accept lab participation.',
      );
    }
    if (view.state === 'BLOCKED') {
      throw Errors.problem(
        403,
        'LAB_BLOCKED',
        'Lab blocked',
        view.blocked_reason ?? 'Lab participation is blocked.',
      );
    }
    throw Errors.serviceDisabled(view.blocked_reason ?? 'Lab capability is not available for this organization.');
  }

  async attest(principal: Principal, labOrgId: string, code: string): Promise<LabEligibilityView> {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const current = await this.evaluate(labOrgId);
    if (
      !current.pack.published ||
      !(current.pack.lab_home_enabled || current.pack.lab_center_enabled) ||
      !current.pack.lab_partner_type_enabled
    ) {
      throw Errors.serviceDisabled(current.blocked_reason ?? 'Lab pack gate failed.');
    }
    if (current.organization_status !== OrganizationStatus.ACTIVE) {
      throw Errors.forbidden(current.blocked_reason ?? 'Organization is not active.');
    }
    if (current.acceptance === 'BLOCKED') {
      throw Errors.problem(403, 'LAB_BLOCKED', 'Lab blocked', current.blocked_reason ?? 'Blocked.');
    }
    if (code !== LAB_PARTNER_ATTESTATION_CODE) {
      throw Errors.validation(
        `Invalid attestation code. Required: ${LAB_PARTNER_ATTESTATION_CODE} (sandbox product acknowledgement, not a legal accreditation).`,
      );
    }
    const now = new Date().toISOString();
    const record = await this.loadRecord(labOrgId);
    const next: LabRecord = {
      ...record,
      attested_at: now,
      attested_by: principal.personId,
      attestation_code: LAB_PARTNER_ATTESTATION_CODE,
      acceptance: record.acceptance === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
      updated_at: now,
    };
    if (next.acceptance === 'NONE') {
      next.acceptance = 'PENDING';
    }
    await this.saveRecord(labOrgId, next);
    await this.security.emit({
      type: 'LAB_PARTNER_ATTESTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        lab_org_id: labOrgId,
        attestation_code: LAB_PARTNER_ATTESTATION_CODE,
        country_code: current.country_code,
        sandbox: true,
        booking_enabled: false,
        live_payout: false,
      },
    });
    return this.evaluate(labOrgId);
  }

  async setAcceptance(
    actorPersonId: string,
    labOrgId: string,
    action: 'accept' | 'block' | 'reset',
    reason?: string,
  ): Promise<LabEligibilityView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: labOrgId },
      select: { id: true, kind: true },
    });
    if (!org || org.kind !== OrganizationKind.LAB) {
      throw Errors.forbidden('Organization is not a laboratory.');
    }
    const record = await this.loadRecord(labOrgId);
    const now = new Date().toISOString();
    let next: LabRecord = { ...record, updated_at: now };
    if (action === 'accept') {
      if (!record.attested_at || record.attestation_code !== LAB_PARTNER_ATTESTATION_CODE) {
        throw Errors.validation('Lab partner must attest before company acceptance.');
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
    await this.saveRecord(labOrgId, next);
    await this.security.emit({
      type:
        action === 'accept'
          ? 'LAB_PARTNER_ACCEPTED'
          : action === 'block'
            ? 'LAB_PARTNER_BLOCKED'
            : 'LAB_PARTNER_ACCEPTANCE_RESET',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        lab_org_id: labOrgId,
        action,
        reason: reason?.trim() || undefined,
        sandbox: true,
        booking_enabled: false,
        live_payout: false,
      },
    });
    return this.evaluate(labOrgId);
  }

  async listLabActivity(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        personId: principal.personId,
        type: {
          in: [
            'LAB_PARTNER_ATTESTED',
            'LAB_PARTNER_ACCEPTED',
            'LAB_PARTNER_BLOCKED',
            'LAB_PARTNER_ACCEPTANCE_RESET',
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
      const meta = row.metadata as { lab_org_id?: string } | null;
      if (!meta?.lab_org_id) {
        return true;
      }
      return meta.lab_org_id === labOrgId;
    });
    return {
      data: filtered.map((row) => ({
        id: row.id,
        type: row.type,
        outcome: row.outcome,
        created_at: row.createdAt.toISOString(),
        metadata: this.sanitizeActivityMetadata(row.metadata),
      })),
      note: 'Lab activity from shared security-event kernel. No clinical PHI. CoC and pathology remain OFF.',
    };
  }

  private sanitizeActivityMetadata(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const src = metadata as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of [
      'lab_org_id',
      'lab_booking_id',
      'collection_mode',
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
