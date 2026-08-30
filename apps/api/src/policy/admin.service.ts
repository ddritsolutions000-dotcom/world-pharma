import { Injectable } from '@nestjs/common';
import { Prisma, PolicyPackStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertMakerChecker } from '../identity/dual-control';
import { PolicyCache } from './cache';
import { PolicyResolver } from './resolver';
import { validatePolicyDocument } from './validator';

@Injectable()
export class PolicyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PolicyCache,
    private readonly resolver: PolicyResolver,
    private readonly events: SecurityEventsService,
  ) {}

  async createDraft(isoAlpha2: string, document: unknown, actorId?: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.toUpperCase() },
    });
    if (!country) {
      throw Errors.validation('Unknown country');
    }
    const validated = validatePolicyDocument(document);
    if (!validated.ok) {
      throw Errors.validation(validated.errors.join('; '));
    }
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
        document: validated.document as unknown as Prisma.InputJsonValue,
        checksum: createHash('sha256').update(JSON.stringify(validated.document)).digest('hex'),
        createdById: actorId,
      },
    });
    await this.events.emit({
      type: 'COUNTRY_POLICY_CREATED',
      outcome: 'success',
      personId: actorId,
      metadata: { country: country.isoAlpha2, version, pack_id: pack.id },
    });
    return pack;
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
    assertMakerChecker({
      dualControlRequired: Boolean(options?.dualControl),
      createdByPersonId: pack.createdById,
      actorPersonId: actorId ?? '',
      actionLabel: 'policy pack publish',
    });
    const validated = validatePolicyDocument(pack.document);
    if (!validated.ok) {
      await this.events.emit({
        type: 'COUNTRY_POLICY_VALIDATED',
        outcome: 'failure',
        personId: actorId,
        metadata: { pack_id: packId, errors: validated.errors },
      });
      throw Errors.validation(validated.errors.join('; '));
    }
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
          document: validated.document as unknown as Prisma.InputJsonValue,
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
      metadata: { country: pack.country.isoAlpha2, version: pack.version, pack_id: pack.id },
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
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.toUpperCase() },
    });
    if (!country) {
      throw Errors.validation('Unknown country');
    }
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
      metadata: { from_version: previous.version, draft_id: draft.id },
    });
    return this.publish(draft.id, actorId);
  }

  list(isoAlpha2: string) {
    return this.prisma.policyPack.findMany({
      where: { country: { isoAlpha2: isoAlpha2.toUpperCase() } },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        checksum: true,
      },
    });
  }
}
