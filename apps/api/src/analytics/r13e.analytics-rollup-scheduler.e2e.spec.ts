import { INestApplication } from '@nestjs/common';
import {
  ConversionEventKind,
  OutboxStatus,
  PersonalizationEventKind,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { nextPolicyPackVersion } from '../test/next-policy-pack-version';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { utcDayStart } from './analytics-query';
import { AnalyticsRollupSchedulerService } from './analytics-rollup-scheduler.service';
import {
  ANALYTICS_DAILY_ROLLUP_EVENT,
  CRM_PERSONALIZATION_PURGE_EVENT,
  purgeOccurrenceKey,
  rollupOccurrenceKey,
} from './analytics-rollup-scheduler.config';

describe('R13-E analytics rollup scheduler (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: AnalyticsRollupSchedulerService;
  let ingest: AnalyticsIngestService;
  let countryEnabledId: string;
  let countryDisabledId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    scheduler = app.get(AnalyticsRollupSchedulerService);
    ingest = app.get(AnalyticsIngestService);

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.analytics = { enabled: true, retention_days: 30 };

    let countryEnabled = await prisma.country.findUnique({ where: { isoAlpha2: 'TR' } });
    if (!countryEnabled) {
      countryEnabled = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TR',
          isoAlpha3: 'TRR',
          nameI18n: { en: 'Analytics scheduler A' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: countryEnabled.id,
        version: await nextPolicyPackVersion(prisma, countryEnabled.id),
        status: PolicyPackStatus.PUBLISHED,
        document: enabledDoc as never,
        checksum: `r13e-sched-enabled-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const enabledPack = await prisma.policyPack.findFirst({
      where: { countryId: countryEnabled.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (enabledPack) {
      await prisma.country.update({
        where: { id: countryEnabled.id },
        data: { publishedPolicyPackId: enabledPack.id },
      });
    }
    countryEnabledId = countryEnabled.id;
    await app.get(PolicyCache).invalidate('TR');

    let countryDisabled = await prisma.country.findUnique({ where: { isoAlpha2: 'DE' } });
    if (!countryDisabled) {
      countryDisabled = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'DE',
          isoAlpha3: 'DEU',
          nameI18n: { en: 'Analytics scheduler B' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }
    const disabledDoc = emptyPolicyDocument();
    disabledDoc.analytics = { enabled: false, retention_days: 365 };
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: countryDisabled.id,
        version: await nextPolicyPackVersion(prisma, countryDisabled.id),
        status: PolicyPackStatus.PUBLISHED,
        document: disabledDoc as never,
        checksum: `r13e-sched-disabled-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const disabledPack = await prisma.policyPack.findFirst({
      where: { countryId: countryDisabled.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (disabledPack) {
      await prisma.country.update({
        where: { id: countryDisabled.id },
        data: { publishedPolicyPackId: disabledPack.id },
      });
    }
    countryDisabledId = countryDisabled.id;
    await app.get(PolicyCache).invalidate('DE');
  });

  afterAll(async () => {
    await app?.close();
  });

  const suiteSalt = Math.floor(Date.now() / 1000) % 12;

  function metricDateForTest(index: number) {
    return utcDayStart(new Date(Date.UTC(2099, suiteSalt, index + 1, 12, 0, 0)));
  }

  function runDateForTest(index: number) {
    return utcDayStart(new Date(Date.UTC(2099, suiteSalt + 1, index + 1, 12, 0, 0)));
  }

  async function seedConversionEvent(countryId: string, metricDate: Date) {
    await prisma.conversionEvent.create({
      data: {
        id: uuidv7(),
        countryId,
        eventKind: ConversionEventKind.CHECKOUT_STARTED,
        source: 'checkout_session',
        sourceKey: uuidv7(),
        occurredAt: new Date(metricDate.getTime() + 3_600_000),
        metadata: {},
      },
    });
  }

  it('runs scheduled daily rollup via outbox and writes country metrics', async () => {
    const metricDate = metricDateForTest(10);
    const metricDateKey = metricDate.toISOString().slice(0, 10);
    await seedConversionEvent(countryEnabledId, metricDate);
    await seedConversionEvent(countryDisabledId, metricDate);

    const outcome = await scheduler.tickOnce(metricDate);
    expect(outcome.status).toBe('completed');
    expect(outcome.metric_date).toBe(metricDateKey);
    expect(outcome.countries_processed).toBeGreaterThanOrEqual(1);

    const enabledMetric = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryEnabledId, metricDate } },
    });
    expect(enabledMetric?.checkoutStartedCount).toBeGreaterThanOrEqual(1);

    const disabledMetric = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryDisabledId, metricDate } },
    });
    expect(disabledMetric).toBeNull();

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        type: ANALYTICS_DAILY_ROLLUP_EVENT,
        occurrenceKey: rollupOccurrenceKey(metricDateKey),
      },
    });
    expect(outbox?.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('skips duplicate scheduler ticks for the same metric date (idempotent replay)', async () => {
    const metricDate = metricDateForTest(11);
    await seedConversionEvent(countryEnabledId, metricDate);

    const completed = await scheduler.tickOnce(metricDate);
    expect(completed.status).toBe('completed');

    const skipped = await scheduler.tickOnce(metricDate);
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('already_completed');
  });

  it('runs scheduled retention purge via outbox and deletes stale personalization rows', async () => {
    const runDate = runDateForTest(1);
    const runDateKey = runDate.toISOString().slice(0, 10);
    await prisma.personalizationEvent.create({
      data: {
        id: uuidv7(),
        countryId: countryEnabledId,
        eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
        source: 'purge-scheduler',
        sourceKey: uuidv7(),
        occurredAt: new Date('2019-01-01T00:00:00.000Z'),
        metadata: {},
      },
    });

    const outcome = await scheduler.tickPurgeOnce(runDate);
    expect(outcome.status).toBe('completed');
    expect(outcome.run_date).toBe(runDateKey);
    expect(outcome.countries_processed).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.personalizationEvent.count({
      where: { countryId: countryEnabledId, source: 'purge-scheduler' },
    });
    expect(remaining).toBe(0);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        type: CRM_PERSONALIZATION_PURGE_EVENT,
        occurrenceKey: purgeOccurrenceKey(runDateKey),
      },
    });
    expect(outbox?.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('skips duplicate purge scheduler ticks for the same run date', async () => {
    const runDate = runDateForTest(2);
    const completed = await scheduler.tickPurgeOnce(runDate);
    expect(completed.status).toBe('completed');

    const skipped = await scheduler.tickPurgeOnce(runDate);
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('already_completed');
  });

  it('does not double-count when canonical ingest runs again after scheduler rollup', async () => {
    const metricDate = metricDateForTest(12);
    await seedConversionEvent(countryEnabledId, metricDate);

    const outcome = await scheduler.tickOnce(metricDate);
    expect(outcome.status).toBe('completed');

    const before = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryEnabledId, metricDate } },
    });

    await ingest.ingestCountryDay(countryEnabledId, metricDate);

    const after = await prisma.analyticsDailyCountryMetric.findUnique({
      where: { countryId_metricDate: { countryId: countryEnabledId, metricDate } },
    });
    expect(after?.checkoutStartedCount).toBe(before?.checkoutStartedCount);
  });
});
