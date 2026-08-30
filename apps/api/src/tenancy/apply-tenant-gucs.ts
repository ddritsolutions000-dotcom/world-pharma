import type { Prisma } from '@world-pharma/database';
import type { TenantContext } from './tenant-context';

function csv(ids: string[]): string {
  return [...new Set(ids.filter(Boolean))].join(',');
}

export async function applyTenantGucs(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
): Promise<void> {
  await tx.$executeRawUnsafe('SET LOCAL ROLE worldpharma_app');
  await tx.$executeRaw`SELECT set_config('app.actor_kind', ${ctx.actorKind}, true)`;
  await tx.$executeRaw`SELECT set_config('app.company_scope', ${ctx.companyScope}, true)`;
  await tx.$executeRaw`SELECT set_config('app.person_id', ${ctx.personId ?? ''}, true)`;
  await tx.$executeRaw`SELECT set_config('app.org_ids', ${csv(ctx.organizationIds)}, true)`;
  await tx.$executeRaw`SELECT set_config('app.location_ids', ${csv(ctx.locationIds)}, true)`;
  await tx.$executeRaw`SELECT set_config('app.country_ids', ${csv(ctx.countryIds)}, true)`;
  await tx.$executeRaw`SELECT set_config('app.region_ids', ${csv(ctx.regionIds)}, true)`;
  await tx.$executeRaw`SELECT set_config('app.legal_entity_ids', ${csv(ctx.legalEntityIds)}, true)`;
  await tx.$executeRaw`SELECT set_config('app.business_unit_ids', ${csv(ctx.businessUnitIds)}, true)`;
}
