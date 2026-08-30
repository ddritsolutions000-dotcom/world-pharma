import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@world-pharma/database';
import type { TenantContext } from './tenant-context';

export type TenantStore = { tx: Prisma.TransactionClient; ctx: TenantContext };

export const tenantAls = new AsyncLocalStorage<TenantStore>();
