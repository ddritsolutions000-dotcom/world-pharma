import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@world-pharma/database';
import type { TenantContext } from './tenant-context';

export type TenantStore = {
  tx: Prisma.TransactionClient;
  ctx: TenantContext;
  /**
   * Serializes nested SAVEPOINT sections on this interactive transaction.
   * PostgreSQL savepoints form a stack: concurrent nested SAVEPOINT/RELEASE
   * on the same connection races and yields SQLSTATE 3B001.
   */
  nestMutex?: Promise<void>;
  /** Re-entrancy depth for the active nestMutex holder (S462 rider pickup deadlock). */
  nestDepth?: number;
};

export const tenantAls = new AsyncLocalStorage<TenantStore>();

/** Run `fn` exclusively relative to other nested savepoint sections on `store`. */
export async function withTenantNestLock<T>(store: TenantStore, fn: () => Promise<T>): Promise<T> {
  // Same async chain may nest runWithTenant → $transaction; must not await our own mutex.
  if ((store.nestDepth ?? 0) > 0) {
    store.nestDepth = (store.nestDepth ?? 0) + 1;
    try {
      return await fn();
    } finally {
      store.nestDepth = (store.nestDepth ?? 1) - 1;
    }
  }
  const previous = store.nestMutex ?? Promise.resolve();
  let releaseNext!: () => void;
  store.nestMutex = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });
  await previous;
  store.nestDepth = 1;
  try {
    return await fn();
  } finally {
    store.nestDepth = 0;
    releaseNext();
  }
}
