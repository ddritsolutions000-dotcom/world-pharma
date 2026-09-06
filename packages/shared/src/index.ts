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
export { hashPassword, verifyPassword } from './password';
export {
  PARTNER_TYPE_CODES,
  SERVICE_KEYS,
  SERVICE_ALIASES,
  type PartnerTypeCode,
  type ServiceKey,
} from './policy';
export {
  PARTNER_FIELD_LABELS,
  partnerFieldLabel,
  sanitizeApplicationFields,
  parseCatalogAttributes,
  sanitizeCatalogAttributes,
  type CatalogProductAttributes,
} from './partner-fields';
export {
  SITE_NAV_SLUG,
  SITE_FOOTER_SLUG,
  SITE_HERO_SLUG,
  SITE_SEO_SLUG,
  SITE_CHROME_SLUGS,
  DEFAULT_SITE_NAV,
  DEFAULT_CATEGORY_RAIL,
  SITE_SERVICES,
  VIEW_ALL_SERVICES_LINK,
  FOOTER_SERVICE_PREVIEW_COUNT,
  isServicesFooterColumn,
  footerServicePreviewLinks,
  DEFAULT_SITE_FOOTER,
  DEFAULT_SITE_HERO,
  DEFAULT_SITE_SEO,
  parseSiteNav,
  parseSiteFooter,
  parseSiteHero,
  parseSiteSeo,
  sanitizeHref,
  pathMatchesPrefix,
  isNavSectionActive,
  findRedirect,
  type SiteNavDocument,
  type SiteFooterDocument,
  type SiteHeroDocument,
  type SiteSeoDocument,
  type SiteShortcut,
  type SiteNavSection,
  type SiteLink,
  type SiteRedirect,
} from './site-chrome';
