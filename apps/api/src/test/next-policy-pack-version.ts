import type { PrismaService } from '../app/prisma.service';

/** Monotonic policy-pack version for a country — avoids (country_id, version) collisions in e2e. */
export async function nextPolicyPackVersion(prisma: PrismaService, countryId: string): Promise<number> {
  const agg = await prisma.policyPack.aggregate({
    where: { countryId },
    _max: { version: true },
  });
  return (agg._max.version ?? 0) + 1;
}
