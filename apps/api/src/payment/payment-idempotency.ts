import type { Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import type { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

/** Reuses existing idempotency_records — scoped per person, method, and path. */
export async function runPaymentIdempotent<T>(
  prisma: PrismaService,
  input: {
    personId: string;
    key: string;
    method: string;
    path: string;
    run: () => Promise<T>;
  },
): Promise<T> {
  const key = input.key?.trim();
  if (!key) {
    throw Errors.validation('Idempotency-Key is required.');
  }
  const prior = await prisma.idempotencyRecord.findUnique({
    where: { personId_key: { personId: input.personId, key } },
  });
  if (prior) {
    if (prior.method !== input.method || prior.path !== input.path) {
      throw Errors.problem(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency key reuse',
        'This idempotency key was already used for a different operation.',
      );
    }
    return prior.body as T;
  }
  const result = await input.run();
  await prisma.idempotencyRecord.create({
    data: {
      id: uuidv7(),
      personId: input.personId,
      key,
      method: input.method,
      path: input.path,
      statusCode: 200,
      body: result as Prisma.InputJsonValue,
    },
  });
  return result;
}
