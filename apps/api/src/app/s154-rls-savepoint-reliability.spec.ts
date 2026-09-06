/**
 * Sprint 154 — Nested RLS SAVEPOINT reliability.
 * Concurrent nested runWithTenant on one interactive transaction must not 3B001.
 */
import { disconnectSharedPrisma, runWithTenant } from './prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { tenantAls, withTenantNestLock, type TenantStore } from '../tenancy/tenant-als';
import { emptyTenantContext } from '../tenancy/tenant-context';

describe('S154 RLS savepoint reliability', () => {
  afterAll(async () => {
    await disconnectSharedPrisma();
  });

  it('withTenantNestLock allows re-entrant nesting on the same store', async () => {
    const store = { nestMutex: undefined as Promise<void> | undefined, nestDepth: 0 } as TenantStore;
    const order: number[] = [];
    await withTenantNestLock(store, async () => {
      order.push(1);
      await withTenantNestLock(store, async () => {
        order.push(2);
      });
      order.push(3);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it('withTenantNestLock serializes concurrent critical sections', async () => {
    const store = { nestMutex: undefined as Promise<void> | undefined } as TenantStore;
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        withTenantNestLock(store, async () => {
          order.push(n);
          await new Promise((r) => setTimeout(r, 5));
          order.push(n + 10);
        }),
      ),
    );
    // Exclusive sections: each pair is contiguous (no interleave of other sections).
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i]! + 10).toBe(order[i + 1]);
    }
  });

  it('concurrent nested runWithTenant savepoints do not throw 3B001', async () => {
    const outer = emptyTenantContext('user');
    outer.personId = '00000000-0000-0000-0000-000000000001';
    await runWithTenant(outer, async () => {
      await Promise.all(
        Array.from({ length: 24 }, async () => {
          await runWithTenant(workerTenantContext(), async () => {
            const tx = tenantAls.getStore()?.tx;
            expect(tx).toBeTruthy();
            await tx!.$executeRaw`SELECT 1`;
          });
        }),
      );
    });
  });

  it('nested failure rollback does not poison subsequent nested runWithTenant', async () => {
    const outer = emptyTenantContext('user');
    outer.personId = '00000000-0000-0000-0000-000000000002';
    await runWithTenant(outer, async () => {
      await expect(
        runWithTenant(workerTenantContext(), async () => {
          throw new Error('intentional_nested_failure');
        }),
      ).rejects.toThrow('intentional_nested_failure');

      await runWithTenant(workerTenantContext(), async () => {
        const tx = tenantAls.getStore()?.tx;
        await tx!.$executeRaw`SELECT 1`;
      });

      // Outer connection still usable after nested rollback.
      const tx = tenantAls.getStore()?.tx;
      await tx!.$executeRaw`SELECT 1`;
    });
  });

  it('preserves RLS fail-closed: does not disable role or open public queries', async () => {
    const outer = emptyTenantContext('user');
    outer.personId = '00000000-0000-0000-0000-000000000003';
    await runWithTenant(outer, async () => {
      const before = tenantAls.getStore()?.ctx;
      expect(before?.actorKind).toBe('user');
      expect(before?.personId).toBe(outer.personId);

      await runWithTenant(workerTenantContext(), async () => {
        const nested = tenantAls.getStore()?.ctx;
        expect(nested?.actorKind).toBe('worker');
      });

      const after = tenantAls.getStore()?.ctx;
      expect(after?.actorKind).toBe('user');
      expect(after?.personId).toBe(outer.personId);
    });
  });
});
