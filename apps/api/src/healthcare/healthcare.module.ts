import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { HealthcareNetworkAdminController } from './healthcare-network.admin.controller';
import { HealthcarePartnerReadinessService } from './healthcare-partner-readiness.service';

@Module({
  imports: [IdentityModule],
  controllers: [HealthcareNetworkAdminController],
  providers: [PrismaService, HealthcarePartnerReadinessService],
  exports: [HealthcarePartnerReadinessService],
})
export class HealthcareModule {}
