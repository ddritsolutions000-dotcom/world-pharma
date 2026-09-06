export type DuplicateMatchInput = {
  title: string | null;
  manufacturer: string | null;
  composition: string | null;
  strength: string | null;
  packSize: string | null;
  sku: string | null;
};

export type DuplicateMatchResult = {
  possible: boolean;
  match_keys: string[];
};

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic exact-field matcher. Never merges; only flags POSSIBLE_DUPLICATE
 * when enough canonical fields agree.
 */
export function evaluatePossibleDuplicate(
  incoming: DuplicateMatchInput,
  existing: DuplicateMatchInput,
): DuplicateMatchResult {
  const matchKeys: string[] = [];
  if (norm(incoming.sku) && norm(incoming.sku) === norm(existing.sku)) {
    matchKeys.push('sku');
  }
  if (norm(incoming.manufacturer) && norm(incoming.manufacturer) === norm(existing.manufacturer)) {
    matchKeys.push('manufacturer');
  }
  if (norm(incoming.title) && norm(incoming.title) === norm(existing.title)) {
    matchKeys.push('product_name');
  }
  if (norm(incoming.composition) && norm(incoming.composition) === norm(existing.composition)) {
    matchKeys.push('composition');
  }
  if (norm(incoming.strength) && norm(incoming.strength) === norm(existing.strength)) {
    matchKeys.push('strength');
  }
  if (norm(incoming.packSize) && norm(incoming.packSize) === norm(existing.packSize)) {
    matchKeys.push('pack_size');
  }

  const identity =
    matchKeys.includes('sku') ||
    (matchKeys.includes('manufacturer') &&
      matchKeys.includes('product_name') &&
      (matchKeys.includes('composition') || matchKeys.includes('strength') || matchKeys.includes('pack_size')));

  return { possible: identity, match_keys: matchKeys };
}
