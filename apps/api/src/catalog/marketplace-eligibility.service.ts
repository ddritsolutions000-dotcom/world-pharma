import { Injectable } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { assertVendorSellerAccess } from './access';

/** Product attestation codes — not legal certifications. Pack flags remain authoritative. */
export const MARKETPLACE_ATTESTATION_CODE = 'MARKETPLACE_SELLER_SANDBOX_V1' as const;

export type MarketplaceEligibilityState =
  | 'ELIGIBLE'
  | 'PENDING'
  | 'BLOCKED'
  | 'REQUIRES_ATTESTATION'
  | 'DISABLED';

export type MarketplaceAcceptance =
  | 'NONE'
  | 'PENDING'
  | 'ACCEPTED'
  | 'BLOCKED';

type SellerRecord = {
  attested_at?: string;
  attested_by?: string;
  attestation_code?: string;
  acceptance: MarketplaceAcceptance;
  accepted_at?: string;
  accepted_by?: string;
  blocked_reason?: string;
  updated_at: string;
};

export type MarketplaceEligibilityView = {
  seller_org_id: string;
  country_code: string | null;
  state: MarketplaceEligibilityState;
  acceptance: MarketplaceAcceptance;
  attestation_code_required: typeof MARKETPLACE_ATTESTATION_CODE;
  attested: boolean;
  attested_at: string | null;
  pack: {
    published: boolean;
    marketplace_enabled: boolean;
    vendor_partner_type_enabled: boolean;
  };
  organization_status: string | null;
  gates: {
    country: boolean;
    seller_organization: boolean;
    marketplace_participation: boolean;
    vendor_partner_type: boolean;
    finance_settlement_visibility: boolean;
    support_notification: boolean;
    catalog_write: boolean;
  };
  blocked_reason: string | null;
  next_action: string | null;
  sandbox_note: string;
  live_payout: false;
};

@Injectable()
export class MarketplaceEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly policy: PolicyResolver,
    private readonly security: SecurityEventsService,
  ) {}

  private recordKey(sellerOrgId: string) {
    return `marketplace:seller:${sellerOrgId}`;
  }

  private async loadRecord(sellerOrgId: string): Promise<SellerRecord> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.get(this.recordKey(sellerOrgId));
    if (!raw) {
      return { acceptance: 'NONE', updated_at: new Date().toISOString() };
    }
    try {
      const parsed = JSON.parse(raw) as SellerRecord;
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

  private async saveRecord(sellerOrgId: string, record: SellerRecord): Promise<void> {
    await this.redis.ensureConnected();
    await this.redis.client.set(
      this.recordKey(sellerOrgId),
      JSON.stringify(record),
      'EX',
      60 * 60 * 24 * 365 * 5,
    );
  }

  async evaluate(sellerOrgId: string): Promise<MarketplaceEligibilityView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: sellerOrgId },
      include: { country: { select: { isoAlpha2: true, id: true } } },
    });
    const sandbox_note =
      'Marketplace eligibility is pack-gated and sandbox-only. Real payouts / live PSP remain OFF (R14).';
    if (!org || org.kind !== OrganizationKind.VENDOR) {
      return {
        seller_org_id: sellerOrgId,
        country_code: null,
        state: 'DISABLED',
        acceptance: 'NONE',
        attestation_code_required: MARKETPLACE_ATTESTATION_CODE,
        attested: false,
        attested_at: null,
        pack: { published: false, marketplace_enabled: false, vendor_partner_type_enabled: false },
        organization_status: org?.status ?? null,
        gates: {
          country: false,
          seller_organization: false,
          marketplace_participation: false,
          vendor_partner_type: false,
          finance_settlement_visibility: false,
          support_notification: false,
          catalog_write: false,
        },
        blocked_reason: 'Organization is not a vendor seller.',
        next_action: null,
        sandbox_note,
        live_payout: false,
      };
    }

    const countryCode = org.country.isoAlpha2;
    const resolved = await this.policy.resolvePublished(countryCode);
    const document = resolved?.document ?? null;
    const packPublished = Boolean(resolved);
    const marketplaceEnabled = this.policy.canUseService(document, 'marketplace');
    const vendorTypeEnabled = this.policy.isPartnerTypeEnabled(document, 'VENDOR');
    const record = await this.loadRecord(sellerOrgId);
    const attested =
      Boolean(record.attested_at) && record.attestation_code === MARKETPLACE_ATTESTATION_CODE;
    const orgActive = org.status === OrganizationStatus.ACTIVE;

    let state: MarketplaceEligibilityState;
    let blocked_reason: string | null = null;
    let next_action: string | null = null;

    if (!packPublished || !document) {
      state = 'DISABLED';
      blocked_reason = 'No published country pack. Marketplace is fail-closed.';
    } else if (!marketplaceEnabled) {
      state = 'DISABLED';
      blocked_reason = 'Marketplace service is disabled for this country pack.';
    } else if (!vendorTypeEnabled) {
      state = 'DISABLED';
      blocked_reason = 'VENDOR partner type is disabled for this country pack.';
    } else if (!orgActive) {
      state = 'BLOCKED';
      blocked_reason = `Organization status is ${org.status}.`;
      next_action = 'Ask company governance to activate the seller organization.';
    } else if (record.acceptance === 'BLOCKED') {
      state = 'BLOCKED';
      blocked_reason = record.blocked_reason ?? 'Company governance blocked marketplace participation.';
    } else if (!attested) {
      state = 'REQUIRES_ATTESTATION';
      next_action = `Submit attestation code ${MARKETPLACE_ATTESTATION_CODE}.`;
    } else if (record.acceptance !== 'ACCEPTED') {
      state = 'PENDING';
      next_action = 'Waiting for company governance acceptance.';
    } else {
      state = 'ELIGIBLE';
      next_action = null;
    }

    const packOk = packPublished && marketplaceEnabled && vendorTypeEnabled;
    const financeVisible = packOk && orgActive && record.acceptance !== 'BLOCKED';
    const supportOk = financeVisible;
    const catalogWrite = state === 'ELIGIBLE';

    return {
      seller_org_id: sellerOrgId,
      country_code: countryCode,
      state,
      acceptance: record.acceptance,
      attestation_code_required: MARKETPLACE_ATTESTATION_CODE,
      attested,
      attested_at: record.attested_at ?? null,
      pack: {
        published: packPublished,
        marketplace_enabled: marketplaceEnabled,
        vendor_partner_type_enabled: vendorTypeEnabled,
      },
      organization_status: org.status,
      gates: {
        country: packPublished,
        seller_organization: orgActive,
        marketplace_participation: marketplaceEnabled,
        vendor_partner_type: vendorTypeEnabled,
        finance_settlement_visibility: financeVisible,
        support_notification: supportOk,
        catalog_write: catalogWrite,
      },
      blocked_reason,
      next_action,
      sandbox_note,
      live_payout: false,
    };
  }

  async assertCatalogWrite(principal: Principal, sellerOrgId: string): Promise<MarketplaceEligibilityView> {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const view = await this.evaluate(sellerOrgId);
    if (view.state === 'ELIGIBLE' && view.gates.catalog_write) {
      return view;
    }
    if (view.state === 'REQUIRES_ATTESTATION') {
      throw Errors.problem(
        403,
        'MARKETPLACE_ATTESTATION_REQUIRED',
        'Attestation required',
        view.next_action ?? 'Marketplace seller attestation is required.',
      );
    }
    if (view.state === 'PENDING') {
      throw Errors.problem(
        403,
        'MARKETPLACE_PENDING_ACCEPTANCE',
        'Acceptance pending',
        view.next_action ?? 'Company governance must accept marketplace participation.',
      );
    }
    if (view.state === 'BLOCKED') {
      throw Errors.problem(
        403,
        'MARKETPLACE_BLOCKED',
        'Marketplace blocked',
        view.blocked_reason ?? 'Marketplace participation is blocked.',
      );
    }
    throw Errors.serviceDisabled(view.blocked_reason ?? 'Marketplace is not available for this seller.');
  }

  async attest(
    principal: Principal,
    sellerOrgId: string,
    code: string,
  ): Promise<MarketplaceEligibilityView> {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const current = await this.evaluate(sellerOrgId);
    if (!current.pack.published || !current.pack.marketplace_enabled || !current.pack.vendor_partner_type_enabled) {
      throw Errors.serviceDisabled(current.blocked_reason ?? 'Marketplace pack gate failed.');
    }
    if (current.organization_status !== OrganizationStatus.ACTIVE) {
      throw Errors.forbidden(current.blocked_reason ?? 'Organization is not active.');
    }
    if (current.acceptance === 'BLOCKED') {
      throw Errors.problem(403, 'MARKETPLACE_BLOCKED', 'Marketplace blocked', current.blocked_reason ?? 'Blocked.');
    }
    if (code !== MARKETPLACE_ATTESTATION_CODE) {
      throw Errors.validation(
        `Invalid attestation code. Required: ${MARKETPLACE_ATTESTATION_CODE} (sandbox product acknowledgement, not a legal certification).`,
      );
    }
    const now = new Date().toISOString();
    const record = await this.loadRecord(sellerOrgId);
    const next: SellerRecord = {
      ...record,
      attested_at: now,
      attested_by: principal.personId,
      attestation_code: MARKETPLACE_ATTESTATION_CODE,
      acceptance: record.acceptance === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
      updated_at: now,
    };
    if (next.acceptance === 'NONE') {
      next.acceptance = 'PENDING';
    }
    await this.saveRecord(sellerOrgId, next);
    await this.security.emit({
      type: 'MARKETPLACE_SELLER_ATTESTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        seller_org_id: sellerOrgId,
        attestation_code: MARKETPLACE_ATTESTATION_CODE,
        country_code: current.country_code,
        sandbox: true,
        live_payout: false,
      },
    });
    return this.evaluate(sellerOrgId);
  }

  async setAcceptance(
    actorPersonId: string,
    sellerOrgId: string,
    action: 'accept' | 'block' | 'reset',
    reason?: string,
  ): Promise<MarketplaceEligibilityView> {
    const org = await this.prisma.organization.findUnique({
      where: { id: sellerOrgId },
      select: { id: true, kind: true },
    });
    if (!org || org.kind !== OrganizationKind.VENDOR) {
      throw Errors.forbidden('Organization is not a vendor seller.');
    }
    const record = await this.loadRecord(sellerOrgId);
    const now = new Date().toISOString();
    let next: SellerRecord = { ...record, updated_at: now };
    if (action === 'accept') {
      if (!record.attested_at || record.attestation_code !== MARKETPLACE_ATTESTATION_CODE) {
        throw Errors.validation('Seller must attest before company acceptance.');
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
    await this.saveRecord(sellerOrgId, next);
    await this.security.emit({
      type:
        action === 'accept'
          ? 'MARKETPLACE_SELLER_ACCEPTED'
          : action === 'block'
            ? 'MARKETPLACE_SELLER_BLOCKED'
            : 'MARKETPLACE_SELLER_ACCEPTANCE_RESET',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        seller_org_id: sellerOrgId,
        action,
        reason: reason?.trim() || undefined,
        sandbox: true,
        live_payout: false,
      },
    });
    return this.evaluate(sellerOrgId);
  }

  async listSellerActivity(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        personId: principal.personId,
        type: {
          in: [
            'MARKETPLACE_SELLER_ATTESTED',
            'MARKETPLACE_SELLER_ACCEPTED',
            'MARKETPLACE_SELLER_BLOCKED',
            'MARKETPLACE_SELLER_ACCEPTANCE_RESET',
            'INVENTORY_RECEIVED',
            'INVENTORY_ADJUSTED',
            'INVENTORY_TRANSFERRED',
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
      const meta = row.metadata as { seller_org_id?: string } | null;
      if (!meta?.seller_org_id) {
        return true;
      }
      return meta.seller_org_id === sellerOrgId;
    });
    return {
      data: filtered.map((row) => ({
        id: row.id,
        type: row.type,
        outcome: row.outcome,
        created_at: row.createdAt.toISOString(),
        metadata: this.sanitizeActivityMetadata(row.metadata),
      })),
      note: 'Seller activity from shared security-event kernel. No clinical PHI.',
    };
  }

  private sanitizeActivityMetadata(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const src = metadata as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of ['seller_org_id', 'attestation_code', 'country_code', 'action', 'sandbox', 'live_payout']) {
      if (key in src) {
        out[key] = src[key];
      }
    }
    return out;
  }
}
