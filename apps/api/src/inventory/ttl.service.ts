import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryTtlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryTtlService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.prisma
        .runWithTenant(workerTenantContext(), () => this.inventory.expireDueReservations())
        .catch((error) => {
          this.logger.warn(
            JSON.stringify({ event: 'inventory_ttl_failed', error: error instanceof Error ? error.message : String(error) }),
          );
        });
    }, 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
