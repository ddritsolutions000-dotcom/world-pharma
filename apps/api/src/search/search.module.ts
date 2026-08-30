import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { LabModule } from '../lab/lab.module';
import { PolicyModule } from '../policy/policy.module';
import { PrismaService } from '../app/prisma.service';
import { AdminSearchController } from './admin-search.controller';
import { ClinicalSearchIndexService } from './clinical-search-index.service';
import { ProviderSearchService } from './provider-search.service';
import { SearchIndexDispatchService } from './search-index-dispatch.service';
import { SearchIndexJobService } from './search-index-job.service';
import { SearchIndexResolverService } from './search-index-resolver.service';

@Module({
  imports: [IdentityModule, EventsModule, CatalogModule, LabModule, PolicyModule],
  controllers: [AdminSearchController],
  providers: [
    PrismaService,
    ProviderSearchService,
    ClinicalSearchIndexService,
    SearchIndexJobService,
    SearchIndexResolverService,
    SearchIndexDispatchService,
  ],
  exports: [SearchIndexJobService, ProviderSearchService, ClinicalSearchIndexService],
})
export class SearchModule {}
