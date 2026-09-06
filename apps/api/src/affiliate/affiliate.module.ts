import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { AffiliateAttributionService } from './affiliate-attribution.service';
import { AffiliateClickService } from './affiliate-click.service';
import { AffiliateContextService } from './affiliate-context.service';
import { AffiliateSelfController, AdminAffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';
import { AffiliateStatementService } from './affiliate-statement.service';
import { PublicAffiliateController } from './public-affiliate.controller';

@Module({
  imports: [IdentityModule, SecurityModule],
  controllers: [AdminAffiliateController, AffiliateSelfController, PublicAffiliateController],
  providers: [
    PrismaService,
    AffiliateContextService,
    AffiliateService,
    AffiliateStatementService,
    AffiliateClickService,
    AffiliateAttributionService,
  ],
  exports: [AffiliateAttributionService, AffiliateService, AffiliateStatementService],
})
export class AffiliateModule {}
