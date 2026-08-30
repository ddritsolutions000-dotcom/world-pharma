import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CatalogModule } from '../catalog/catalog.module';
import { CmsModule } from '../cms/cms.module';
import { PolicyModule } from '../policy/policy.module';
import { SearchModule } from '../search/search.module';
import { DiscoveryCustomerController } from './discovery-customer.controller';
import { DiscoverySearchService } from './discovery-search.service';

@Module({
  imports: [CatalogModule, CmsModule, PolicyModule, SearchModule],
  controllers: [DiscoveryCustomerController],
  providers: [PrismaService, DiscoverySearchService],
  exports: [DiscoverySearchService],
})
export class DiscoveryModule {}
