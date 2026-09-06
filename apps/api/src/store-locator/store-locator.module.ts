import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PublicStoreLocatorController } from './public.controller';
import { AdminStoreLocatorController } from './admin.controller';
import { StoreLocatorController } from './store-locator.controller';
import { StoreLocatorService } from './store-locator.service';

@Module({
  imports: [IdentityModule],
  controllers: [StoreLocatorController, PublicStoreLocatorController, AdminStoreLocatorController],
  providers: [StoreLocatorService, PrismaService],
  exports: [StoreLocatorService],
})
export class StoreLocatorModule {}
