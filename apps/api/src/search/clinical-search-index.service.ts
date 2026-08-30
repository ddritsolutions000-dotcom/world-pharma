import { Injectable } from '@nestjs/common';
import { HealthArtifactStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  isPublishedArtifactStatus,
  toClinicalSearchTitle,
} from './clinical-search-query';

@Injectable()
export class ClinicalSearchIndexService {
  constructor(private readonly prisma: PrismaService) {}

  async reindexArtifact(artifactId: string, countryId: string): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () =>
      this.reindexArtifactInWorkerContext(artifactId, countryId),
    );
  }

  private async reindexArtifactInWorkerContext(artifactId: string, countryId: string) {
    const artifact = await this.prisma.healthArtifact.findUnique({ where: { id: artifactId } });
    if (!artifact || artifact.countryId !== countryId) {
      await this.unpublish(artifactId, countryId);
      return;
    }
    const published = isPublishedArtifactStatus(artifact.status) && Boolean(artifact.publishedAt);
    const title = toClinicalSearchTitle(artifact.title, artifact.artifactType);
    await this.prisma.clinicalSearchDocument.upsert({
      where: { artifactId_countryId: { artifactId, countryId } },
      create: {
        id: uuidv7(),
        artifactId,
        personId: artifact.personId,
        countryId,
        artifactType: artifact.artifactType,
        title,
        published,
        publishedAt: artifact.publishedAt,
        version: 1,
      },
      update: {
        personId: artifact.personId,
        artifactType: artifact.artifactType,
        title,
        published,
        publishedAt: artifact.publishedAt,
        version: { increment: 1 },
      },
    });
  }

  async unpublish(artifactId: string, countryId: string): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), async () => {
      await this.prisma.clinicalSearchDocument.updateMany({
        where: { artifactId, countryId },
        data: { published: false },
      });
    });
  }

  async purgeArtifact(artifactId: string, countryId: string): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), async () => {
      await this.prisma.clinicalSearchDocument.deleteMany({
        where: { artifactId, countryId },
      });
    });
  }

  async assertArtifactIndexable(artifactId: string) {
    const artifact = await this.prisma.healthArtifact.findUnique({ where: { id: artifactId } });
    if (!artifact) {
      throw Errors.notFound('Health artifact not found.');
    }
    if (!artifact.countryId) {
      throw Errors.validation('Artifact is missing country scope.');
    }
    if (artifact.status !== HealthArtifactStatus.ACTIVE) {
      throw Errors.validation('Only active artifacts can be indexed.');
    }
    return artifact;
  }
}
