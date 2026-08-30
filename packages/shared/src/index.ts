export const PLATFORM_NAME = 'world-pharma';

/** Blueprint: persist money as integer minor units (never float). */
export type MoneyMinor = bigint;

/** Blueprint: tenant/country scoping on future domain rows. */
export type CountryId = string;

export { uuidv7 } from './uuid';
export {
  normalizeEmail,
  normalizePhone,
  normalizeIdentifier,
  isEmail,
  redactIdentifier,
  type IdentifierType,
  type NormalizedIdentifier,
} from './identifiers';
export {
  hmacSha256Hex,
  sha256Hex,
  randomToken,
  randomOtpDigits,
  safeEqualHex,
  hashIp,
} from './crypto';
export {
  PARTNER_TYPE_CODES,
  SERVICE_KEYS,
  SERVICE_ALIASES,
  type PartnerTypeCode,
  type ServiceKey,
} from './policy';
