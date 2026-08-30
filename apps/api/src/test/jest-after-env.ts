/**
 * Jest worker teardown — close the shared Prisma engine once after all suites.
 * Prevents open-handle hang without --forceExit and without per-suite disconnect races.
 */
import { disconnectSharedPrisma } from '../app/prisma.service';

afterAll(async () => {
  await disconnectSharedPrisma();
}, 60_000);
