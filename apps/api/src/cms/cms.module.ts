import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PartnerModule } from '../partner/partner.module';
import { PlatformModule } from '../platform/platform.module';
import { AdminCmsController } from './admin-cms.controller';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { CmsAssetService } from './cms-asset.service';
import { CmsAuditService } from './cms-audit.service';
import { CmsContentService } from './cms-content.service';
import { CmsSearchService } from './cms-search.service';
import { HelpCenterController } from './help-center.controller';
import { CustomerHealthContentController } from './customer-health-content.controller';
import { PublicHealthContentController } from './public-health-content.controller';
import { HealthContentService } from './health-content.service';

@Module({
  imports: [IdentityModule, EventsModule, PartnerModule, forwardRef(() => PlatformModule)],
  controllers: [AdminCmsController, HelpCenterController, AdminSupportController, CustomerHealthContentController, PublicHealthContentController],
  providers: [
    PrismaService,
    CmsAuditService,
    CmsContentService,
    CmsSearchService,
    CmsAssetService,
    AdminSupportService,
    HealthContentService,
  ],
  exports: [CmsContentService, CmsSearchService],
})
export class CmsModule {}
