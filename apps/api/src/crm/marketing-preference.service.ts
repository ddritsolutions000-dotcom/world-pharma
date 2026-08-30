import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { resolveCountryByCode } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { SuppressionService } from './marketing/suppression.service';

export type MarketingPreferenceView = {
  person_id: string;
  country_id: string;
  country_code: string;
  marketing_allowed: boolean;
  email_allowed: boolean;
  push_allowed: boolean;
  sms_allowed: boolean;
  whatsapp_allowed: boolean;
  version: number;
  updated_at: string;
};

const DEFAULTS = {
  marketing_allowed: false,
  email_allowed: false,
  push_allowed: false,
  sms_allowed: false,
  whatsapp_allowed: false,
};

@Injectable()
export class MarketingPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly suppressions: SuppressionService,
  ) {}

  async getForPerson(personId: string, countryCode: string): Promise<MarketingPreferenceView> {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId }), async () => {
      const row = await this.prisma.marketingPreference.findUnique({
        where: { personId_countryId: { personId, countryId: country.id } },
      });
      if (!row) {
        return this.presentDefaults(personId, country.id, country.isoAlpha2);
      }
      return this.present(row, country.isoAlpha2);
    });
  }

  async updateForPerson(
    personId: string,
    countryCode: string,
    patch: Partial<{
      marketing_allowed: boolean;
      email_allowed: boolean;
      push_allowed: boolean;
      sms_allowed: boolean;
      whatsapp_allowed: boolean;
    }>,
    actorPersonId: string,
    expectedVersion?: number,
  ): Promise<MarketingPreferenceView> {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId }), async () => {
      const existing = await this.prisma.marketingPreference.findUnique({
        where: { personId_countryId: { personId, countryId: country.id } },
      });
      if (existing && expectedVersion != null && existing.version !== expectedVersion) {
        throw Errors.problem(409, 'VERSION_CONFLICT', 'Version conflict', 'Preference was updated elsewhere.');
      }
      const nextMarketing =
        patch.marketing_allowed !== undefined ? patch.marketing_allowed : (existing?.marketingAllowed ?? false);
      const data = {
        marketingAllowed: nextMarketing,
        emailAllowed: patch.email_allowed ?? existing?.emailAllowed ?? false,
        pushAllowed: patch.push_allowed ?? existing?.pushAllowed ?? false,
        smsAllowed: patch.sms_allowed ?? existing?.smsAllowed ?? false,
        whatsappAllowed: patch.whatsapp_allowed ?? existing?.whatsappAllowed ?? false,
      };
      if (!nextMarketing) {
        data.emailAllowed = false;
        data.pushAllowed = false;
        data.smsAllowed = false;
        data.whatsappAllowed = false;
      }
      const row = existing
        ? await this.prisma.marketingPreference.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await this.prisma.marketingPreference.create({
            data: {
              id: uuidv7(),
              personId,
              countryId: country.id,
              ...data,
            },
          });
      if (existing?.marketingAllowed !== row.marketingAllowed) {
        await this.securityEvents.emit({
          type: 'MARKETING_PREF_CHANGED',
          outcome: 'success',
          personId: actorPersonId,
          metadata: {
            subject_person_id: personId,
            country_id: country.id,
            marketing_allowed: row.marketingAllowed,
          },
        });
        if (!row.marketingAllowed) {
          await this.suppressions.recordOptOut(personId, country.id);
        } else {
          await this.suppressions.revokeOptOut(personId, country.id);
        }
      }
      return this.present(row, country.isoAlpha2);
    });
  }

  presentDefaults(personId: string, countryId: string, countryCode: string): MarketingPreferenceView {
    return {
      person_id: personId,
      country_id: countryId,
      country_code: countryCode,
      ...DEFAULTS,
      version: 0,
      updated_at: new Date(0).toISOString(),
    };
  }

  private present(
    row: {
      personId: string;
      countryId: string;
      marketingAllowed: boolean;
      emailAllowed: boolean;
      pushAllowed: boolean;
      smsAllowed: boolean;
      whatsappAllowed: boolean;
      version: number;
      updatedAt: Date;
    },
    countryCode: string,
  ): MarketingPreferenceView {
    return {
      person_id: row.personId,
      country_id: row.countryId,
      country_code: countryCode,
      marketing_allowed: row.marketingAllowed,
      email_allowed: row.emailAllowed,
      push_allowed: row.pushAllowed,
      sms_allowed: row.smsAllowed,
      whatsapp_allowed: row.whatsappAllowed,
      version: row.version,
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
