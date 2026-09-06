export type EligibilityGateMap = Record<string, boolean>;

export type OrgPickRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
};

export type CountryPickRow = {
  id: string;
  iso2: string;
  name: string;
};

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function asRows(body: unknown): Record<string, unknown>[] {
  const rows = Array.isArray((body as { data?: unknown }).data)
    ? ((body as { data: unknown[] }).data)
    : Array.isArray(body)
      ? body
      : [];
  return rows.map((raw) => (raw ?? {}) as Record<string, unknown>);
}

export function presentOrgPicks(body: unknown, kinds?: string[]): OrgPickRow[] {
  const rows = asRows(body).map((row, index) => ({
    id: pick(row, 'id') || `org-${index}`,
    name: pick(row, 'displayName', 'display_name', 'legalName', 'legal_name') || pick(row, 'id'),
    kind: pick(row, 'kind'),
    status: pick(row, 'status'),
  }));
  if (!kinds?.length) {
    return rows.filter((row) => row.id);
  }
  return rows.filter((row) => kinds.includes(row.kind));
}

export function presentCountryPicks(body: unknown): CountryPickRow[] {
  return asRows(body)
    .map((row, index) => ({
      id: pick(row, 'id') || `country-${index}`,
      iso2: pick(row, 'isoAlpha2', 'iso_alpha2', 'iso2').toUpperCase(),
      name: pick(row, 'displayName', 'display_name') || pick(row, 'name') || pick(row, 'isoAlpha2', 'iso_alpha2'),
    }))
    .filter((row) => row.id && row.iso2.length === 2);
}

export type LocationPickRow = {
  id: string;
  name: string;
};

export function presentLocationPicks(body: unknown): LocationPickRow[] {
  return asRows(body)
    .map((row, index) => ({
      id: pick(row, 'id') || `loc-${index}`,
      name: pick(row, 'name') || pick(row, 'id'),
    }))
    .filter((row) => row.id);
}

export type PersonPickRow = {
  id: string;
  label: string;
};

function uniquePeople(rows: PersonPickRow[]): PersonPickRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.id || seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}

export function presentMembershipPeople(body: unknown): PersonPickRow[] {
  return uniquePeople(
    asRows(body).map((row) => {
      const person =
        row.person && typeof row.person === 'object' ? (row.person as Record<string, unknown>) : {};
      const id = pick(row, 'personId', 'person_id') || pick(person, 'id');
      const role =
        row.role && typeof row.role === 'object'
          ? pick(row.role as Record<string, unknown>, 'code', 'name')
          : '';
      const identifiers = Array.isArray(person.identifiers) ? person.identifiers : [];
      let email = '';
      for (const ident of identifiers) {
        if (!ident || typeof ident !== 'object') {
          continue;
        }
        const rec = ident as Record<string, unknown>;
        if (pick(rec, 'type').toUpperCase() === 'EMAIL') {
          email = pick(rec, 'valueNormalized', 'value_normalized');
        }
      }
      return {
        id,
        label: [email || (id ? `${id.slice(0, 8)}…` : ''), role].filter(Boolean).join(' · '),
      };
    }),
  );
}

export function presentPartnerPeople(body: unknown, types?: string[]): PersonPickRow[] {
  return uniquePeople(
    asRows(body).flatMap((row) => {
      const type = pick(row, 'partner_type_code', 'partnerTypeCode');
      if (types?.length && !types.includes(type)) {
        return [];
      }
      const partner =
        row.partner && typeof row.partner === 'object'
          ? (row.partner as Record<string, unknown>)
          : {};
      const id = pick(partner, 'person_id', 'personId');
      if (!id) {
        return [];
      }
      return [{ id, label: `${type || 'partner'} · ${id.slice(0, 8)}…` }];
    }),
  );
}

export function gateRows(gates: EligibilityGateMap | undefined): Array<{ key: string; ok: boolean }> {
  if (!gates) {
    return [];
  }
  return Object.entries(gates).map(([key, ok]) => ({ key, ok: Boolean(ok) }));
}
