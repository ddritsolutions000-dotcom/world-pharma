/**
 * R13-A backfill CLI — run with worker tenant context.
 * Usage: npx ts-node -r tsconfig-paths/register apps/api/src/search/search-reindex.cli.ts --country=XX [--locale=en]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { SearchIndexJobService } from './search-index-job.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

async function main() {
  const args = process.argv.slice(2);
  const countryCode = args.find((a) => a.startsWith('--country='))?.split('=')[1];
  const locale = args.find((a) => a.startsWith('--locale='))?.split('=')[1] ?? 'en';
  if (!countryCode) {
    console.error('Usage: search-reindex.cli.ts --country=XX [--locale=en]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const jobs = app.get(SearchIndexJobService);
    const country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      throw new Error(`Country ${countryCode} not found`);
    }
    const result = await prisma.runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      jobs.backfillCatalog(country.id, locale),
    );
    console.log(JSON.stringify({ ok: true, country: countryCode, ...result }));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
