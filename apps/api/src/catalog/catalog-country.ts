import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

export function requireCountryCode(code: string | undefined | null): string {
  const countryCode = code?.trim().toUpperCase();
  if (!countryCode) {
    throw Errors.validation('country_code is required');
  }
  return countryCode;
}

export async function resolveCountryByCode(prisma: PrismaService, code: string) {
  const countryCode = requireCountryCode(code);
  const country = await prisma.country.findUnique({
    where: { isoAlpha2: countryCode },
  });
  if (!country) {
    throw Errors.notFound('Country not available');
  }
  return country;
}

export function assertUuid(value: string, field: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!value || !uuidRegex.test(value)) {
    throw Errors.validation(`${field} must be a valid UUID`);
  }
}
