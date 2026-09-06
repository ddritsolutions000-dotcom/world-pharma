import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { HealthPackagesCatalogService } from './health-packages-catalog.service';

@Injectable()
export class HealthPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: HealthPackagesCatalogService,
  ) {}

  async getHealthPackages(
    principal: Principal | null,
    query: {
      country_code?: string;
      category?: string;
      gender?: string;
      age_group?: string;
      price_range?: string;
      search?: string;
      limit?: number;
    },
  ) {
    if (!query.country_code?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: query.country_code.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal?.personId }), async () => {
      const result = await this.catalog.listPublic(query.country_code!, {
        category: query.category,
        search: query.search,
        limit: query.limit,
      });
      let packages = result.packages;
      if (query.gender) {
        packages = packages.filter((pkg) => pkg.suitable_for.includes(query.gender!));
      }
      if (query.age_group) {
        packages = packages.filter((pkg) => pkg.age_groups.includes(query.age_group!));
      }
      if (query.price_range) {
        const [min, max] = query.price_range.split('-').map(Number);
        packages = packages.filter((pkg) => pkg.price >= min && pkg.price <= max);
      }
      return {
        packages,
        total: packages.length,
        filters: {
          category: query.category,
          gender: query.gender,
          age_group: query.age_group,
          price_range: query.price_range,
        },
      };
    });
  }

  async getPackageDetails(principal: Principal | null, packageId: string, countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal?.personId }), async () => {
      const pkg = await this.catalog.getPublic(countryCode, packageId);
      return {
        ...pkg,
        tests: this.getPackageTests(packageId),
        preparation: {
          fasting_required: pkg.requires_fasting,
          fasting_hours: pkg.requires_fasting ? 10 : 0,
          instructions: pkg.requires_fasting
            ? 'Fast for 10-12 hours before sample collection. Water is allowed.'
            : 'No fasting required for this package.',
        },
        lab_partners: [],
        sandbox_note: 'Sandbox health package — booking and live lab settlement remain gated.',
      };
    });
  }

  async requestHomeCollection(
    principal: Principal,
    input: { package_id: string; country_code?: string; preferred_date?: string; address_id?: string },
  ) {
    if (!input.country_code?.trim()) {
      throw Errors.validation('country_code is required');
    }
    await this.getPackageDetails(principal, input.package_id, input.country_code);
    return {
      status: 'REQUESTED',
      sandbox: true,
      message:
        'Sandbox home-collection request recorded. Lab ops will confirm a slot. This is not a live NABL booking.',
    };
  }

  private getPackageTests(packageId: string) {
    const tests: Record<string, string[]> = {
      'full-body-basic': ['Complete Blood Count', 'Lipid Profile', 'Liver Function Test', 'Kidney Function Test'],
      'diabetes-basic': ['Fasting Blood Sugar', 'HbA1c', 'Lipid Profile'],
    };
    return tests[packageId] ?? ['General screening panel'];
  }

  async getPopularPackages(principal: Principal | null, countryCode?: string) {
    const result = await this.getHealthPackages(principal, { country_code: countryCode, limit: 10 });
    return {
      packages: result.packages.filter((p) => p.is_popular),
    };
  }

  async getPackagesByConcern(
    principal: Principal | null,
    concern: string,
    countryCode?: string,
  ) {
    return this.getHealthPackages(principal, {
      country_code: countryCode,
      category: concern,
      limit: 20,
    });
  }

  async bookHealthPackage(
    principal: Principal,
    input: { package_id: string; country_code?: string; preferred_date?: string; address_id?: string },
  ) {
    return this.requestHomeCollection(principal, input);
  }
}
