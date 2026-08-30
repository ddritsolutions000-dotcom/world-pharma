import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CountryStatus, PolicyPackStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PARTNER_TYPE_CODES, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { emptyPolicyDocument, TECHNICAL_COUNTRY } from './empty-pack';
import { assertSafeDefaults, validatePolicyDocument } from './validator';

const PARTNER_TYPE_NAMES: Record<(typeof PARTNER_TYPE_CODES)[number], string> = {
  DOCTOR: 'Doctor',
  PHARMACY: 'Pharmacy',
  VENDOR: 'Vendor',
  LAB: 'Laboratory',
  IMAGING_CENTER: 'Imaging center',
  DELIVERY_PARTNER: 'Delivery partner',
  PHLEBOTOMIST: 'Phlebotomist',
  PATHOLOGIST: 'Pathologist',
  RADIOLOGIST: 'Radiologist',
  CLINIC: 'Clinic',
  HOSPITAL: 'Hospital',
  AFFILIATE: 'Affiliate',
  HEALTHCARE_BUSINESS: 'Healthcare business',
};

@Injectable()
export class PolicySeedService implements OnModuleInit {
  private readonly logger = new Logger(PolicySeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCatalog();
  }

  async ensureCatalog(): Promise<void> {
    await this.prisma.partnerType.createMany({
      data: PARTNER_TYPE_CODES.map((code) => ({
        id: uuidv7(),
        code,
        name: PARTNER_TYPE_NAMES[code],
      })),
      skipDuplicates: true,
    });

    const document = emptyPolicyDocument();
    const validated = validatePolicyDocument(document);
    if (!validated.ok) {
      throw new Error(`empty pack invalid: ${validated.errors.join('; ')}`);
    }
    const safety = assertSafeDefaults(document);
    if (safety.length) {
      throw new Error(`empty pack is not safe: ${safety.join('; ')}`);
    }

    let country = await this.prisma.country.findUnique({
      where: { isoAlpha2: TECHNICAL_COUNTRY.isoAlpha2 },
    });
    if (!country) {
      country = await this.prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: TECHNICAL_COUNTRY.isoAlpha2,
          isoAlpha3: TECHNICAL_COUNTRY.isoAlpha3,
          nameI18n: TECHNICAL_COUNTRY.nameI18n,
          status: CountryStatus.ACTIVE,
          defaultLocale: TECHNICAL_COUNTRY.defaultLocale,
          defaultCurrency: TECHNICAL_COUNTRY.defaultCurrency,
          defaultTimezone: TECHNICAL_COUNTRY.defaultTimezone,
          phonePrefix: null,
          dataResidencyMode: 'shared',
        },
      });
    }

    const existing = await this.prisma.policyPack.findFirst({
      where: { countryId: country.id, version: 1 },
    });
    if (!existing) {
      const packId = uuidv7();
      const checksum = createHash('sha256').update(JSON.stringify(document)).digest('hex');
      await this.prisma.policyPack.create({
        data: {
          id: packId,
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: document as unknown as Prisma.InputJsonValue,
          checksum,
          effectiveFrom: new Date(),
          publishedAt: new Date(),
        },
      });
      await this.prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: packId },
      });
      this.logger.log(`Seeded technical country ${TECHNICAL_COUNTRY.isoAlpha2} empty pack v1`);
    }
  }
}
