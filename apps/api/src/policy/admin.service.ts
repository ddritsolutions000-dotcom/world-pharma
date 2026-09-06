import { Injectable } from '@nestjs/common';
import { PaymentMethodFamily, PolicyPackStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { SERVICE_KEYS, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertMakerChecker } from '../identity/dual-control';
import { PaymentGatewayRegistry } from '../payment/gateway.registry';
import { isLivePaymentEnabled } from '../payment/payment.config';
import { PolicyCache } from './cache';
import { PolicyResolver } from './resolver';
import { validatePolicyDocument } from './validator';
import type { PolicyDocument } from './empty-pack';
import { emptyPolicyDocument } from './empty-pack';
import {
  HEALTHCARE_FLAG_KEYS,
  assertNoForbiddenPolicySecrets,
  assertOperatorSafety,
  diffOperatorViews,
  extractOperatorView,
  paymentMethodFamilies,
  requiresDualControl,
  type PolicyDiffEntry,
  type PolicyOperatorView,
} from './operator';

type PackRow = {
  id: string;
  version: number;
  status: PolicyPackStatus;
  publishedAt: Date | null;
  createdAt: Date;
  checksum: string | null;
  createdById: string | null;
  publishedById: string | null;
};

@Injectable()
export class PolicyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PolicyCache,
    private readonly resolver: PolicyResolver,
    private readonly events: SecurityEventsService,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  catalog() {
    return {
      registered_gateway_codes: this.gateways.registeredCodes(),
      payment_method_families: paymentMethodFamilies(),
      service_keys: [...SERVICE_KEYS],
      healthcare_flag_keys: [...HEALTHCARE_FLAG_KEYS],
      data_residency_modes: ['shared', 'pinned_region', 'dedicated_db'] as const,
      live_payment_enabled: isLivePaymentEnabled(),
      live_unlock_note:
        'Publishing a country pack cannot set PAYMENT_LIVE_ENABLED, create a production PSP, or bypass R14-A human gates.',
      baseline_operator: extractOperatorView(emptyPolicyDocument()),
    };
  }

  async list(isoAlpha2: string) {
    const country = await this.requireCountry(isoAlpha2);
    const versions = await this.prisma.policyPack.findMany({
      where: { countryId: country.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        checksum: true,
        createdById: true,
        publishedById: true,
      },
    });
    const published = versions.find((row) => row.status === PolicyPackStatus.PUBLISHED) ?? null;
    return {
      country_code: country.isoAlpha2,
      data: versions.map((row) => this.serializeVersion(row)),
      published_id: published?.id ?? null,
      ...this.catalog(),
    };
  }

  async get(packId: string) {
    const pack = await this.prisma.policyPack.findUnique({
      where: { id: packId },
      include: { country: true },
    });
    if (!pack) {
      throw Errors.notFound('Unknown policy pack');
    }
    const document = this.parseStoredDocument(pack.document);
    return this.serializePack(pack, document);
  }

  async validateDraftDocument(isoAlpha2: string, document: unknown) {
    await this.requireCountry(isoAlpha2);
    const checked = this.assertValidDocument(document);
    const published = await this.loadPublishedDocument(isoAlpha2);
    return {
      ok: true as const,
      errors: [] as string[],
      operator_status: 'VALIDATED' as const,
      dual_control_required: requiresDualControl(checked),
      live_payment_enabled: isLivePaymentEnabled(),
      diff: diffOperatorViews(published, checked),
      operator: extractOperatorView(checked),
    };
  }

  async validateStoredDraft(packId: string, actorId?: string) {
    const pack = await this.prisma.policyPack.findUnique({
      where: { id: packId },
      include: { country: true },
    });
    if (!pack) {
      throw Errors.notFound('Unknown policy pack');
    }
    if (pack.status !== PolicyPackStatus.DRAFT) {
      throw Errors.validation('Only DRAFT packs can be validated');
    }
    try {
      const checked = this.assertValidDocument(pack.document);
      const published = await this.loadPublishedDocument(pack.country.isoAlpha2);
      await this.events.emit({
        type: 'COUNTRY_POLICY_VALIDATED',
        outcome: 'success',
        personId: actorId,
        metadata: { pack_id: pack.id, country: pack.country.isoAlpha2, version: pack.version },
      });
      return {
        ok: true as const,
        errors: [] as string[],
        operator_status: 'VALIDATED' as const,
        dual_control_required: requiresDualControl(checked),
        live_payment_enabled: isLivePaymentEnabled(),
        diff: diffOperatorViews(published, checked),
        operator: extractOperatorView(checked),
        pack: this.serializeVersion(pack),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'invalid document';
      await this.events.emit({
        type: 'COUNTRY_POLICY_VALIDATED',
        outcome: 'failure',
        personId: actorId,
        metadata: { pack_id: packId, errors: [detail] },
      });
      throw err;
    }
  }

  async diff(packId: string): Promise<{ pack_id: string; country_code: string; entries: PolicyDiffEntry[] }> {
    const pack = await this.prisma.policyPack.findUnique({
      where: { id: packId },
      include: { country: true },
    });
    if (!pack) {
      throw Errors.notFound('Unknown policy pack');
    }
    const document = this.parseStoredDocument(pack.document);
    const published = await this.loadPublishedDocument(pack.country.isoAlpha2);
    const compareAgainst =
      pack.status === PolicyPackStatus.PUBLISHED
        ? await this.loadPreviousPublishedDocument(pack.countryId, pack.version)
        : published;
    return {
      pack_id: pack.id,
      country_code: pack.country.isoAlpha2,
      entries: diffOperatorViews(compareAgainst, document),
    };
  }

  async createDraft(isoAlpha2: string, document: unknown, actorId?: string) {
    const country = await this.requireCountry(isoAlpha2);
    const validatedDoc = this.assertValidDocument(document);
    const latest = await this.prisma.policyPack.findFirst({
      where: { countryId: country.id },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const pack = await this.prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version,
        status: PolicyPackStatus.DRAFT,
        document: validatedDoc as unknown as Prisma.InputJsonValue,
        checksum: createHash('sha256').update(JSON.stringify(validatedDoc)).digest('hex'),
        createdById: actorId,
      },
    });
    await this.events.emit({
      type: 'COUNTRY_POLICY_CREATED',
      outcome: 'success',
      personId: actorId,
      metadata: { country: country.isoAlpha2, version, pack_id: pack.id },
    });
    return this.serializePack({ ...pack, country }, validatedDoc);
  }

  async publish(packId: string, actorId?: string, options?: { dualControl?: boolean }) {
    const pack = await this.prisma.policyPack.findUnique({
      where: { id: packId },
      include: { country: true },
    });
    if (!pack) {
      throw Errors.validation('Unknown policy pack');
    }
    if (pack.status !== PolicyPackStatus.DRAFT) {
      throw Errors.validation('Only DRAFT packs can be published');
    }
    const validatedDoc = this.assertValidDocument(pack.document);
    assertMakerChecker({
      dualControlRequired: Boolean(options?.dualControl) || requiresDualControl(validatedDoc),
      createdByPersonId: pack.createdById,
      actorPersonId: actorId ?? '',
      actionLabel: 'policy pack publish',
    });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.policyPack.updateMany({
        where: { countryId: pack.countryId, status: PolicyPackStatus.PUBLISHED },
        data: { status: PolicyPackStatus.SUPERSEDED, supersededAt: now },
      }),
      this.prisma.policyPack.update({
        where: { id: pack.id },
        data: {
          status: PolicyPackStatus.PUBLISHED,
          publishedAt: now,
          publishedById: actorId,
          effectiveFrom: now,
          document: validatedDoc as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.country.update({
        where: { id: pack.countryId },
        data: { publishedPolicyPackId: pack.id },
      }),
    ]);
    await this.cache.invalidate(pack.country.isoAlpha2);
    await this.events.emit({
      type: 'COUNTRY_POLICY_PUBLISHED',
      outcome: 'success',
      personId: actorId,
      metadata: {
        country: pack.country.isoAlpha2,
        version: pack.version,
        pack_id: pack.id,
        live_payment_enabled: isLivePaymentEnabled(),
      },
    });
    return this.resolver.resolvePublished(pack.country.isoAlpha2);
  }

  async retire(packId: string, actorId?: string) {
    const pack = await this.prisma.policyPack.findUnique({
      where: { id: packId },
      include: { country: true },
    });
    if (!pack || pack.status !== PolicyPackStatus.PUBLISHED) {
      throw Errors.validation('Only PUBLISHED packs can be superseded');
    }
    await this.prisma.policyPack.update({
      where: { id: pack.id },
      data: { status: PolicyPackStatus.SUPERSEDED, supersededAt: new Date() },
    });
    await this.prisma.country.update({
      where: { id: pack.countryId },
      data: { publishedPolicyPackId: null },
    });
    await this.cache.invalidate(pack.country.isoAlpha2);
    await this.events.emit({
      type: 'COUNTRY_POLICY_RETIRED',
      outcome: 'success',
      personId: actorId,
      metadata: { pack_id: pack.id, country: pack.country.isoAlpha2 },
    });
  }

  async rollback(isoAlpha2: string, actorId?: string) {
    const country = await this.requireCountry(isoAlpha2);
    const previous = await this.prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.SUPERSEDED },
      orderBy: { version: 'desc' },
    });
    if (!previous) {
      throw Errors.validation('No superseded pack to roll back to');
    }
    const draft = await this.createDraft(isoAlpha2, previous.document, actorId);
    await this.events.emit({
      type: 'COUNTRY_POLICY_ROLLED_BACK',
      outcome: 'success',
      personId: actorId,
      metadata: { from_version: previous.version, draft_id: draft.id, country: country.isoAlpha2 },
    });
    return this.publish(draft.id, actorId);
  }

  private assertValidDocument(document: unknown): PolicyDocument {
    assertNoForbiddenPolicySecrets(document);
    const validated = validatePolicyDocument(document);
    if (!validated.ok) {
      throw Errors.validation(validated.errors.join('; '));
    }
    const parsed = validated.document as PolicyDocument;
    assertOperatorSafety(parsed, (code) => this.gateways.isRegistered(code));
    return parsed;
  }

  private parseStoredDocument(document: Prisma.JsonValue): PolicyDocument {
    const validated = validatePolicyDocument(document);
    if (!validated.ok || !validated.document) {
      throw Errors.validation(validated.errors.join('; '));
    }
    return validated.document as PolicyDocument;
  }

  private async requireCountry(isoAlpha2: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.toUpperCase() },
    });
    if (!country) {
      throw Errors.validation('Unknown country');
    }
    return country;
  }

  private async loadPublishedDocument(isoAlpha2: string): Promise<PolicyDocument | null> {
    const resolved = await this.resolver.resolvePublished(isoAlpha2);
    return resolved?.document ?? null;
  }

  private async loadPreviousPublishedDocument(countryId: string, currentVersion: number) {
    const previous = await this.prisma.policyPack.findFirst({
      where: { countryId, status: PolicyPackStatus.SUPERSEDED, version: { lt: currentVersion } },
      orderBy: { version: 'desc' },
    });
    if (!previous) {
      return null;
    }
    return this.parseStoredDocument(previous.document);
  }

  private serializeVersion(row: PackRow) {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      published_at: row.publishedAt,
      created_at: row.createdAt,
      checksum: row.checksum,
      created_by_id: row.createdById,
      published_by_id: row.publishedById,
    };
  }

  private serializePack(
    pack: PackRow & { country: { isoAlpha2: string } },
    document: PolicyDocument,
  ) {
    const operator: PolicyOperatorView = extractOperatorView(document);
    return {
      ...this.serializeVersion(pack),
      country_code: pack.country.isoAlpha2,
      document,
      operator,
      operator_status: pack.status === PolicyPackStatus.PUBLISHED ? 'PUBLISHED' : pack.status,
      dual_control_required: requiresDualControl(document),
      live_payment_enabled: isLivePaymentEnabled(),
      payment_method_families: Object.values(PaymentMethodFamily),
      registered_gateway_codes: this.gateways.registeredCodes(),
    };
  }
}
