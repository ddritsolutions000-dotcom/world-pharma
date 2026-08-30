import { Controller, Get, Param } from '@nestjs/common';
import { CountryStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { PolicyResolver } from './resolver';

@Controller()
export class PolicyPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PolicyResolver,
  ) {}

  @Get('countries')
  async listCountries() {
    const rows = await this.prisma.country.findMany({
      where: { status: CountryStatus.ACTIVE },
      orderBy: { isoAlpha2: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        iso_alpha2: row.isoAlpha2,
        iso_alpha3: row.isoAlpha3,
        name: row.nameI18n,
        status: row.status,
        default_locale: row.defaultLocale,
        default_currency: row.defaultCurrency,
        default_timezone: row.defaultTimezone,
      })),
    };
  }

  @Get('countries/:countryCode')
  async getCountry(@Param('countryCode') countryCode: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.toUpperCase() },
    });
    if (!country || country.status !== CountryStatus.ACTIVE) {
      throw Errors.notFound('Country is not available.');
    }
    return {
      id: country.id,
      iso_alpha2: country.isoAlpha2,
      iso_alpha3: country.isoAlpha3,
      name: country.nameI18n,
      status: country.status,
      default_locale: country.defaultLocale,
      default_currency: country.defaultCurrency,
      default_timezone: country.defaultTimezone,
    };
  }

  @Get('countries/:countryCode/policy')
  async currentPolicy(@Param('countryCode') countryCode: string) {
    const resolved = await this.resolver.resolvePublished(countryCode);
    if (!resolved) {
      throw Errors.notFound('No published policy pack.');
    }
    return this.resolver.publicSafeView(resolved);
  }

  @Get('policy-packs/current')
  async currentByQuery() {
    throw Errors.validation('Use GET /countries/{code}/policy');
  }

  @Get('countries/:countryCode/services')
  async services(@Param('countryCode') countryCode: string) {
    const resolved = await this.resolver.resolvePublished(countryCode);
    if (!resolved) {
      throw Errors.notFound('No published policy pack.');
    }
    return {
      country_code: resolved.isoAlpha2,
      services: Object.fromEntries(
        Object.entries(resolved.document.services).map(([key, enabled]) => [key, { enabled }]),
      ),
    };
  }

  @Get('countries/:countryCode/partner-types')
  async partnerTypes(@Param('countryCode') countryCode: string) {
    const resolved = await this.resolver.resolvePublished(countryCode);
    if (!resolved) {
      throw Errors.notFound('No published policy pack.');
    }
    return {
      country_code: resolved.isoAlpha2,
      partner_types: Object.fromEntries(
        Object.entries(resolved.document.partner_types).map(([code, row]) => [
          code,
          { enabled: row.enabled, join_public: row.join_public },
        ]),
      ),
    };
  }
}
