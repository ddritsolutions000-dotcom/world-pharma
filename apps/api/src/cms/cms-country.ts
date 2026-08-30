import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function resolveCountryByCode(prisma: PrismaService, countryCode?: string) {
  const code = countryCode?.trim().toUpperCase();
  if (!code) {
    throw Errors.validation('country_code is required');
  }
  const country = await prisma.country.findUnique({
    where: { isoAlpha2: code },
    select: { id: true, isoAlpha2: true },
  });
  if (!country) {
    throw Errors.notFound('Country not found');
  }
  return country;
}

export function assertUuid(id: string, label: string) {
  if (!isUuid(id)) {
    throw Errors.validation(`Invalid ${label}`);
  }
}
