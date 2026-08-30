import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OrganizationKind } from '@prisma/client';
import { PrismaClient } from '@world-pharma/database';
import { uuidv7 } from '@world-pharma/shared';
import { applyTestIsolation } from '../test/isolate-runtime';

function appDatabaseUrl(): string {
  const raw = process.env['DATABASE_URL'];
  if (!raw) {
    throw new Error('DATABASE_URL is required');
  }
  const url = new URL(raw);
  url.username = 'worldpharma_app';
  url.password = 'worldpharma_app';
  return url.toString();
}

async function applyCtx(
  client: PrismaClient,
  input: {
    actor?: string;
    scope?: string;
    person?: string;
    orgs?: string[];
    country?: string;
    region?: string;
    legalEntity?: string;
  },
): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.actor_kind', ${input.actor ?? 'user'}, true)`;
  await client.$executeRaw`SELECT set_config('app.company_scope', ${input.scope ?? 'organization'}, true)`;
  await client.$executeRaw`SELECT set_config('app.person_id', ${input.person ?? ''}, true)`;
  await client.$executeRaw`SELECT set_config('app.org_ids', ${(input.orgs ?? []).join(',')}, true)`;
  await client.$executeRaw`SELECT set_config('app.location_ids', ${''}, true)`;
  await client.$executeRaw`SELECT set_config('app.country_ids', ${input.country ?? ''}, true)`;
  await client.$executeRaw`SELECT set_config('app.region_ids', ${input.region ?? ''}, true)`;
  await client.$executeRaw`SELECT set_config('app.legal_entity_ids', ${input.legalEntity ?? ''}, true)`;
  await client.$executeRaw`SELECT set_config('app.business_unit_ids', ${''}, true)`;
}

describe('multi-tenant RLS (worldpharma_app)', () => {
  const admin = new PrismaClient();
  const app = new PrismaClient({ datasources: { db: { url: appDatabaseUrl() } } });
  let countryId = '';
  let orgA = '';
  let orgB = '';
  let personA = '';
  let personB = '';

  beforeAll(async () => {
    applyTestIsolation();
    if (!process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL is required');
    }
    const country = await admin.country.findFirst();
    if (!country) {
      throw new Error('fixture country required');
    }
    countryId = country.id;
    personA = uuidv7();
    personB = uuidv7();
    orgA = uuidv7();
    orgB = uuidv7();
    await admin.person.createMany({
      data: [
        { id: personA, status: 'ACTIVE' },
        { id: personB, status: 'ACTIVE' },
      ],
    });
    await admin.organization.createMany({
      data: [
        {
          id: orgA,
          countryId,
          kind: OrganizationKind.VENDOR,
          legalName: 'RLS-A',
          displayName: 'RLS-A',
          status: 'ACTIVE',
        },
        {
          id: orgB,
          countryId,
          kind: OrganizationKind.VENDOR,
          legalName: 'RLS-B',
          displayName: 'RLS-B',
          status: 'ACTIVE',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.$disconnect();
    await admin.$disconnect();
  });

  it('worldpharma_app is NOSUPERUSER and NOBYPASSRLS', async () => {
    const rows = await admin.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'worldpharma_app'
    `;
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('has zero USING(true) RLS policies (B-RLS-01)', async () => {
    const rows = await admin.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          COALESCE(qual::text, '') = 'true'
          OR COALESCE(with_check::text, '') = 'true'
        )
    `;
    expect(Number(rows[0]?.cnt ?? 0)).toBe(0);
  });

  it('denies SELECT when tenant context is missing', async () => {
    await applyCtx(app, { actor: '', scope: 'none' });
    const n = await app.organization.count();
    expect(n).toBe(0);
  });

  it('denies cross-tenant SELECT, UPDATE, and DELETE', async () => {
    const seen = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        orgs: [orgA],
        actor: 'user',
        scope: 'organization',
        country: countryId,
      });
      return tx.organization.findMany({ where: { id: { in: [orgA, orgB] } } });
    });
    const ids = seen.map((row) => row.id);
    expect(ids).toContain(orgA);
    expect(ids).not.toContain(orgB);

    const updated = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        orgs: [orgA],
        actor: 'user',
        scope: 'organization',
        country: countryId,
      });
      return tx.organization.updateMany({ where: { id: orgB }, data: { displayName: 'hack' } });
    });
    expect(updated.count).toBe(0);

    const deleted = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        orgs: [orgA],
        actor: 'user',
        scope: 'organization',
        country: countryId,
      });
      return tx.organization.deleteMany({ where: { id: orgB } });
    });
    expect(deleted.count).toBe(0);
  });

  it('denies cross-tenant INSERT of another organization id', async () => {
    const forged = uuidv7();
    await expect(
      app.$transaction(async (tx) => {
        await applyCtx(tx as unknown as PrismaClient, {
          person: personA,
          orgs: [orgA],
          actor: 'user',
          scope: 'organization',
          country: countryId,
        });
        return tx.organization.create({
          data: {
            id: forged,
            countryId,
            kind: OrganizationKind.VENDOR,
            legalName: 'forged',
            displayName: 'forged',
            status: 'ACTIVE',
          },
        });
      }),
    ).rejects.toBeDefined();
  });

  it('does not leak SET LOCAL after COMMIT', async () => {
    await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.person_id', ${personA}, true)`;
    });
    const after = await app.$queryRaw<{ v: string | null }[]>`
      SELECT current_setting('app.person_id', true) AS v
    `;
    expect(after[0]?.v ?? '').not.toBe(personA);
  });

  it('worker actor can read outbox without company platform scope', async () => {
    const n = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, { actor: 'worker', scope: 'none' });
      return tx.outboxEvent.count();
    });
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it('country company scope cannot see another country org', async () => {
    const otherCountry = await admin.country.findFirst({ where: { id: { not: countryId } } });
    if (!otherCountry) {
      return;
    }
    const seen = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        actor: 'user',
        scope: 'country',
        country: otherCountry.id,
      });
      return tx.organization.findMany({ where: { id: { in: [orgA, orgB] } } });
    });
    expect(seen.map((row) => row.id)).toEqual([]);
  });

  it('does not treat client headers as tenant authority', () => {
    const src = readFileSync(join(__dirname, 'tenant.interceptor.ts'), 'utf8');
    expect(src).not.toMatch(/x-organization-id/i);
    expect(src).not.toMatch(/x-country-id/i);
    expect(src).toContain('buildUserTenantContext');
  });

  it('FORCE RLS is enabled on pre-R6 repair tables (CR-PRE-R6-REPAIR-123)', async () => {
    const rows = await admin.$queryRawUnsafe<{ relname: string; rls: boolean; force: boolean }[]>(`
      SELECT c.relname,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'rider_presence',
          'prescriptions',
          'prescription_versions',
          'prescription_lines',
          'prescription_status_history',
          'dispensing_cases',
          'dispense_events',
          'dispense_line_mappings',
          'rx_commerce_handoffs',
          'refill_requests',
          'refill_request_history',
          'rx_subscriptions'
        )
      ORDER BY c.relname
    `);
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row.rls).toBe(true);
      expect(row.force).toBe(true);
    }
    const role = await admin.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'worldpharma_app'
    `;
    expect(role[0]?.rolsuper).toBe(false);
    expect(role[0]?.rolbypassrls).toBe(false);
  });

  it('rider_presence: fail-closed, cross-person denied, cross-org denied, worker/platform preserved', async () => {
    const presenceA = uuidv7();
    const presenceB = uuidv7();
    await admin.riderPresence.createMany({
      data: [
        { id: presenceA, personId: personA, organizationId: orgA, online: true },
        { id: presenceB, personId: personB, organizationId: orgB, online: true },
      ],
    });

    const missing = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, { actor: '', scope: 'none' });
      return tx.riderPresence.count();
    });
    expect(missing).toBe(0);

    const asCustomerA = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        orgs: [],
        actor: 'user',
        scope: 'none',
        country: countryId,
      });
      return tx.riderPresence.findMany({ where: { id: { in: [presenceA, presenceB] } } });
    });
    expect(asCustomerA.map((r) => r.id)).toEqual([presenceA]);

    const asOrgA = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        orgs: [orgA],
        actor: 'user',
        scope: 'organization',
        country: countryId,
      });
      return tx.riderPresence.findMany({ where: { id: { in: [presenceA, presenceB] } } });
    });
    expect(asOrgA.map((r) => r.id).sort()).toEqual([presenceA]);
    expect(asOrgA.map((r) => r.id)).not.toContain(presenceB);

    const asWrongOrg = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: uuidv7(),
        orgs: [orgA],
        actor: 'user',
        scope: 'organization',
        country: countryId,
      });
      return tx.riderPresence.findMany({ where: { id: presenceB } });
    });
    expect(asWrongOrg).toEqual([]);

    const asWorker = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, { actor: 'worker', scope: 'none' });
      return tx.riderPresence.findMany({ where: { id: { in: [presenceA, presenceB] } } });
    });
    expect(asWorker.map((r) => r.id).sort()).toEqual([presenceA, presenceB].sort());

    const asPlatform = await app.$transaction(async (tx) => {
      await applyCtx(tx as unknown as PrismaClient, {
        person: personA,
        actor: 'user',
        scope: 'platform',
        country: countryId,
      });
      return tx.riderPresence.findMany({ where: { id: { in: [presenceA, presenceB] } } });
    });
    expect(asPlatform.map((r) => r.id).sort()).toEqual([presenceA, presenceB].sort());
  });
});
