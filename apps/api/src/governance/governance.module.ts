import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [IdentityModule],
  controllers: [GovernanceController],
  providers: [PrismaService, GovernanceService],
})
export class GovernanceModule {}
