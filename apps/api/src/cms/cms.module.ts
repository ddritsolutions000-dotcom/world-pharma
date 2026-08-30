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

@Module({
  imports: [IdentityModule, EventsModule, PartnerModule, forwardRef(() => PlatformModule)],
  controllers: [AdminCmsController, HelpCenterController, AdminSupportController],
  providers: [
    PrismaService,
    CmsAuditService,
    CmsContentService,
    CmsSearchService,
    CmsAssetService,
    AdminSupportService,
  ],
  exports: [CmsContentService, CmsSearchService],
})
export class CmsModule {}
