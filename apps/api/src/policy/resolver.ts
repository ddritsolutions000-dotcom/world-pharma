import { Injectable } from '@nestjs/common';
import { CountryStatus, PolicyPackStatus } from '@prisma/client';
import { SERVICE_ALIASES } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { PolicyCache, type CachedPublishedPack } from './cache';
import type { PolicyDocument } from './empty-pack';
import { validatePolicyDocument } from './validator';

export interface ResolvedPolicy {
  countryId: string;
  isoAlpha2: string;
  version: number;
  packId: string;
  document: PolicyDocument;
}

@Injectable()
export class PolicyResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PolicyCache,
  ) {}

  async resolvePublished(isoAlpha2: string): Promise<ResolvedPolicy | null> {
    const code = isoAlpha2.toUpperCase();
    const cached = await this.cache.read(code);
    if (cached) {
      return this.toResolved(cached);
    }
    const loaded = await this.loadFromDb(code);
    if (loaded) {
      await this.cache.write(code, loaded);
      return this.toResolved(loaded);
    }
    return null;
  }

  canUseService(document: PolicyDocument | null, service: string): boolean {
    if (!document) {
      return false;
    }
    const key = SERVICE_ALIASES[service] ?? SERVICE_ALIASES[service.toLowerCase()];
    if (!key) {
      return false;
    }
    return document.services[key] === true;
  }

  canPartnerJoinPublic(document: PolicyDocument | null, partnerType: string): boolean {
    if (!document) {
      return false;
    }
    const row = document.partner_types[partnerType as keyof PolicyDocument['partner_types']];
    if (!row) {
      return false;
    }
    return row.enabled === true && row.join_public === true;
  }

  isPartnerTypeEnabled(document: PolicyDocument | null, partnerType: string): boolean {
    if (!document) {
      return false;
    }
    const row = document.partner_types[partnerType as keyof PolicyDocument['partner_types']];
    return row?.enabled === true;
  }

  getCurrency(document: PolicyDocument | null): string | null {
    return document?.currency.default ?? null;
  }

  getLocales(document: PolicyDocument | null): string[] {
    return document?.i18n.locales ?? [];
  }

  publicSafeView(resolved: ResolvedPolicy) {
    const services = Object.fromEntries(
      Object.entries(resolved.document.services).map(([key, enabled]) => [key, { enabled }]),
    );
    const partner_types = Object.fromEntries(
      Object.entries(resolved.document.partner_types).map(([code, row]) => [
        code,
        {
          enabled: row.enabled,
          join_public: row.join_public,
          allowed_services: row.allowed_services,
        },
      ]),
    );
    return {
      country_code: resolved.isoAlpha2,
      version: resolved.version,
      locales: resolved.document.i18n.locales,
      default_locale: resolved.document.i18n.default_locale,
      currency: resolved.document.currency.default,
      currencies: resolved.document.currency.allowed,
      timezone: resolved.document.timezone.default,
      services,
      payments: {
        enabled: resolved.document.payments.enabled,
        methods: resolved.document.payments.methods,
        currencies: resolved.document.payments.currencies,
      },
      partner_types,
      recording_allowed: resolved.document.recording_allowed,
      healthcare: {
        doctor_onboarding_enabled: this.isDoctorOnboardingEnabled(resolved.document),
        doctor_public_visibility: this.isDoctorPubliclyVisible(resolved.document),
        telemedicine_eligibility: this.isTelemedicineEligible(resolved.document),
        consultation_capability: this.isConsultationCapable(resolved.document),
        appointments_enabled: this.areAppointmentsEnabled(resolved.document),
        booking_requires_consent: this.isBookingConsentRequired(resolved.document),
        rx_prescribe_enabled: this.isRxPrescribeEnabled(resolved.document),
        rx_dispense_enabled: this.isRxDispenseEnabled(resolved.document),
        rx_erx_enabled: this.isRxErxEnabled(resolved.document),
        rx_amend_enabled: this.isRxAmendEnabled(resolved.document),
        rx_allowed_restriction_codes: this.rxAllowedRestrictionCodes(resolved.document),
        rx_refill_enabled: this.isRxRefillEnabled(resolved.document),
        rx_refill_require_doctor_reauth: this.isRxRefillDoctorReauthRequired(resolved.document),
        rx_subscription_enabled: this.isRxSubscriptionEnabled(resolved.document),
        rx_subscription_auto_execute: this.isRxSubscriptionAutoExecuteEnabled(resolved.document),
      },
    };
  }

  isDoctorOnboardingEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.doctor_onboarding_enabled === true && this.isPartnerTypeEnabled(document, 'DOCTOR');
  }

  isDoctorPubliclyVisible(document: PolicyDocument | null): boolean {
    return document?.healthcare?.doctor_public_visibility === true;
  }

  requiredCredentialTypes(document: PolicyDocument | null): string[] {
    return document?.healthcare?.required_credential_types ?? [];
  }

  isTelemedicineEligible(document: PolicyDocument | null): boolean {
    return document?.healthcare?.telemedicine_eligibility === true;
  }

  isConsultationCapable(document: PolicyDocument | null): boolean {
    return document?.healthcare?.consultation_capability === true;
  }

  areAppointmentsEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.appointments_enabled === true && this.isConsultationCapable(document);
  }

  isBookingConsentRequired(document: PolicyDocument | null): boolean {
    return document?.healthcare?.booking_requires_consent === true;
  }

  isRxPrescribeEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_prescribe_enabled === true;
  }

  isRxDispenseEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_dispense_enabled === true;
  }

  isRxErxEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_erx_enabled === true;
  }

  rxErxProviderCode(document: PolicyDocument | null): string | null {
    const raw = document?.healthcare?.rx_erx_provider_code;
    if (typeof raw !== 'string') {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  isRxAmendEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_amend_enabled === true;
  }

  isRxRefillEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_refill_enabled === true;
  }

  isRxRefillDoctorReauthRequired(document: PolicyDocument | null): boolean {
    // Fail-closed default: when refill is considered, doctor re-auth is required unless pack sets false.
    if (!document?.healthcare) {
      return true;
    }
    return document.healthcare.rx_refill_require_doctor_reauth !== false;
  }

  isRxSubscriptionEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.rx_subscription_enabled === true;
  }

  /** Hard fail-closed: auto recurring refill never implied by missing policy. */
  isRxSubscriptionAutoExecuteEnabled(document: PolicyDocument | null): boolean {
    return (
      document?.healthcare?.rx_subscription_enabled === true &&
      document?.healthcare?.rx_subscription_auto_execute === true
    );
  }

  rxAllowedRestrictionCodes(document: PolicyDocument | null): string[] {
    return document?.healthcare?.rx_allowed_restriction_codes ?? [];
  }

  isRestrictionCodeAllowed(document: PolicyDocument | null, code: string | null | undefined): boolean {
    if (!code) {
      return true;
    }
    const allowed = this.rxAllowedRestrictionCodes(document);
    return allowed.includes(code);
  }

  isHealthTimelineEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.health_timeline_enabled === true;
  }

  isClinicalSearchEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.clinical_search_enabled === true;
  }

  isCareNavigationEnabled(document: PolicyDocument | null): boolean {
    return document?.healthcare?.care_navigation_enabled === true;
  }

  isDiscoveryEnabled(document: PolicyDocument | null): boolean {
    return document?.search?.discovery_enabled !== false;
  }

  isAnalyticsEnabled(document: PolicyDocument | null): boolean {
    return document?.analytics?.enabled === true;
  }

  analyticsRetentionDays(document: PolicyDocument | null): number {
    return document?.analytics?.retention_days ?? 365;
  }

  personalizationRetentionDays(document: PolicyDocument | null): number {
    return document?.crm?.personalization?.retention_days ?? 90;
  }

  discoveryBlocklistTerms(document: PolicyDocument | null): string[] {
    return document?.search?.blocklist_terms ?? [];
  }

  isQueryBlocked(document: PolicyDocument | null, query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    for (const term of this.discoveryBlocklistTerms(document)) {
      const blocked = term.trim().toLowerCase();
      if (blocked && normalized.includes(blocked)) {
        return true;
      }
    }
    return false;
  }

  private toResolved(cached: CachedPublishedPack): ResolvedPolicy {
    return {
      countryId: cached.countryId,
      isoAlpha2: cached.isoAlpha2,
      version: cached.version,
      packId: cached.packId,
      document: cached.document,
    };
  }

  private async loadFromDb(isoAlpha2: string): Promise<CachedPublishedPack | null> {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2 },
    });
    if (!country || country.status !== CountryStatus.ACTIVE) {
      return null;
    }
    // Prefer the country pointer set on publish — version-max alone can pick a stale pack in tests/reuse.
    let pack = country.publishedPolicyPackId
      ? await this.prisma.policyPack.findFirst({
          where: { id: country.publishedPolicyPackId, status: PolicyPackStatus.PUBLISHED },
        })
      : null;
    if (!pack) {
      pack = await this.prisma.policyPack.findFirst({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        orderBy: { version: 'desc' },
      });
    }
    if (!pack) {
      return null;
    }
    const validated = validatePolicyDocument(pack.document);
    if (!validated.ok || !validated.document) {
      return null;
    }
    return {
      packId: pack.id,
      countryId: country.id,
      isoAlpha2: country.isoAlpha2,
      version: pack.version,
      document: validated.document,
    };
  }
}
