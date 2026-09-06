import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { HealthPackagesController } from './health-packages.controller';
import { PublicHealthPackagesController } from './public.controller';
import { AdminHealthPackagesController } from './admin.controller';
import { HealthPackagesCatalogService } from './health-packages-catalog.service';
import { HealthPackagesService } from './health-packages.service';

@Module({
  imports: [IdentityModule],
  controllers: [HealthPackagesController, PublicHealthPackagesController, AdminHealthPackagesController],
  providers: [HealthPackagesService, HealthPackagesCatalogService, PrismaService],
  exports: [HealthPackagesService, HealthPackagesCatalogService],
})
export class HealthPackagesModule {}
