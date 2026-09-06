/** Known partner application field codes — labels for UI; values stored on PartnerApplication.applicationFields. */
export const PARTNER_FIELD_LABELS: Record<string, string> = {
  legal_name: 'Legal business name',
  display_name: 'Display / trade name',
  tax_id: 'Tax identification number',
  registration_number: 'Business registration number',
  contact_phone: 'Contact phone (E.164)',
  contact_email: 'Contact email',
  business_address: 'Business address',
  website_url: 'Website URL',
  bank_account_ref: 'Bank account reference (metadata only — no secrets)',
};

export function partnerFieldLabel(code: string): string {
  return PARTNER_FIELD_LABELS[code] ?? code.replace(/_/g, ' ');
}

export function sanitizeApplicationFields(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 512) {
      continue;
    }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
      continue;
    }
    out[key] = trimmed;
  }
  return out;
}

export type CatalogProductAttributes = {
  manufacturer_name?: string | null;
  country_of_manufacture?: string | null;
  highlights?: string[];
  composition?: string | null;
  composition_not_applicable?: boolean;
  dosage_form?: string | null;
  warnings?: string | null;
  storage?: string | null;
  usage_directions?: string | null;
};

function clipAttr(raw: string | null | undefined, max: number): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim().slice(0, max);
  return trimmed || null;
}

export function parseCatalogAttributes(raw: unknown): CatalogProductAttributes {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const row = raw as Record<string, unknown>;
  return {
    manufacturer_name: typeof row.manufacturer_name === 'string' ? row.manufacturer_name : null,
    country_of_manufacture:
      typeof row.country_of_manufacture === 'string' ? row.country_of_manufacture : null,
    highlights: Array.isArray(row.highlights)
      ? row.highlights.filter((item): item is string => typeof item === 'string')
      : [],
    composition: typeof row.composition === 'string' ? row.composition : null,
    composition_not_applicable: row.composition_not_applicable === true,
    dosage_form: typeof row.dosage_form === 'string' ? row.dosage_form : null,
    warnings: typeof row.warnings === 'string' ? row.warnings : null,
    storage: typeof row.storage === 'string' ? row.storage : null,
    usage_directions: typeof row.usage_directions === 'string' ? row.usage_directions : null,
  };
}

export function sanitizeCatalogAttributes(raw: unknown): CatalogProductAttributes {
  const parsed = parseCatalogAttributes(raw);
  return {
    manufacturer_name: clipAttr(parsed.manufacturer_name, 200),
    country_of_manufacture: clipAttr(parsed.country_of_manufacture, 8),
    highlights: (parsed.highlights ?? []).map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 8),
    composition: clipAttr(parsed.composition, 2000),
    composition_not_applicable: parsed.composition_not_applicable === true,
    dosage_form: clipAttr(parsed.dosage_form, 80),
    warnings: clipAttr(parsed.warnings, 4000),
    storage: clipAttr(parsed.storage, 2000),
    usage_directions: clipAttr(parsed.usage_directions, 4000),
  };
}
