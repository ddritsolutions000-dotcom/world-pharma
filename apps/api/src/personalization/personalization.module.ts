import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { SecurityModule } from '../security/security.module';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';

@Module({
  imports: [IdentityModule, PolicyModule, SecurityModule],
  controllers: [PersonalizationController],
  providers: [PrismaService, PersonalizationService],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
