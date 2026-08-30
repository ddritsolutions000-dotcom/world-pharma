import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { PrismaService } from '../app/prisma.service';
import type { Principal } from '../identity/current-principal';
import { applyTenantGucs } from './apply-tenant-gucs';
import { authTenantContext, buildUserTenantContext, workerTenantContext } from './build-tenant-context';
import { tenantAls } from './tenant-als';
import { emptyTenantContext } from './tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      principal?: Principal;
      path?: string;
      url?: string;
      originalUrl?: string;
    }>();
    const path = request.path ?? request.originalUrl ?? request.url ?? '';
    if (path.startsWith('/health')) {
      return next.handle();
    }
    if (path.includes('/webhooks/')) {
      return from(
        this.prisma.runWithTenant(workerTenantContext(), () => lastValueFrom(next.handle())),
      );
    }
    const principal = request.principal;
    const initial = principal
      ? { ...emptyTenantContext('user'), personId: principal.personId }
      : authTenantContext();
    return from(
      this.prisma.runWithTenant(initial, async () => {
        if (principal) {
          const store = tenantAls.getStore();
          if (store) {
            const full = await buildUserTenantContext(this.prisma, principal);
            // Keep ALS ctx aligned with GUCs so nested runWithTenant restore
            // does not wipe org/country scope back to the empty initial ctx.
            store.ctx = full;
            await applyTenantGucs(store.tx, full);
          }
        }
        return lastValueFrom(next.handle());
      }),
    );
  }
}
