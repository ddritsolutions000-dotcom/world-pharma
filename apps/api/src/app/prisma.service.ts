import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@world-pharma/database';
import { applyTenantGucs } from '../tenancy/apply-tenant-gucs';
import { tenantAls } from '../tenancy/tenant-als';
import type { TenantContext } from '../tenancy/tenant-context';

const root = new PrismaClient();

/** Shared client used by Nest proxies. Exported for Jest worker teardown only. */
export async function disconnectSharedPrisma(): Promise<void> {
  await root.$disconnect();
}

export async function runWithTenant<T>(
  ctx: TenantContext,
  fn: () => Promise<T>,
  opts?: { fresh?: boolean },
): Promise<T> {
  const existing = opts?.fresh ? undefined : tenantAls.getStore();
  if (existing) {
    const previous = existing.ctx;
    const sp = `rls_ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await existing.tx.$executeRawUnsafe(`SAVEPOINT ${sp}`);
    await applyTenantGucs(existing.tx, ctx);
    existing.ctx = ctx;
    try {
      const result = await fn();
      await existing.tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (error) {
      await existing.tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw error;
    } finally {
      existing.ctx = previous;
      try {
        await applyTenantGucs(existing.tx, previous);
      } catch {
        // parent transaction may already be aborted
      }
    }
  }
  return root.$transaction(async (tx) => {
    await applyTenantGucs(tx, ctx);
    return tenantAls.run({ tx, ctx }, fn);
  });
}

export interface PrismaService extends PrismaClient {
  runWithTenant<T>(ctx: TenantContext, fn: () => Promise<T>, opts?: { fresh?: boolean }): Promise<T>;
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  constructor() {
    return new Proxy(root, {
      get(target, prop, receiver) {
        if (prop === 'runWithTenant') {
          return runWithTenant;
        }
        if (prop === 'onModuleDestroy') {
          return async () => {
            if (process.env['NODE_ENV'] === 'test' || process.env['WP_TEST_ISOLATED'] === '1') {
              return;
            }
            await root.$disconnect();
          };
        }
        const tx = tenantAls.getStore()?.tx;
        if (prop === '$transaction' && tx) {
          return async (arg: unknown, options?: unknown) => {
            if (typeof arg === 'function') {
              const sp = `rls_nest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
              await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`);
              try {
                const result = await (arg as (inner: typeof tx) => Promise<unknown>)(tx);
                await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
                return result;
              } catch (error) {
                await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
                throw error;
              }
            }
            if (Array.isArray(arg)) {
              return Promise.all(arg);
            }
            const nested = Reflect.get(target, prop, receiver) as (...args: unknown[]) => unknown;
            return nested.call(target, arg, options);
          };
        }
        const source = tx ?? target;
        const value = Reflect.get(source, prop, source);
        return typeof value === 'function' ? value.bind(source) : value;
      },
    }) as unknown as PrismaService;
  }

  async onModuleDestroy(): Promise<void> {
    // Module-level singleton: disconnecting on every Nest app.close() races later e2e
    // suites (reconnect flakiness + Jest open-handle noise). Final disconnect runs in
    // jest-after-env afterAll / production process shutdown only.
    if (process.env['NODE_ENV'] === 'test' || process.env['WP_TEST_ISOLATED'] === '1') {
      return;
    }
    await root.$disconnect();
  }
}
