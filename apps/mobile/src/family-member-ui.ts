export type FamilyMember = {
  id: string;
  country_code: string;
  display_name: string;
  relationship_code: string;
  age_years: number | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FamilyMemberInput = {
  display_name: string;
  relationship_code?: string;
  age_years?: number | null;
  phone?: string | null;
  notes?: string | null;
};

export const FAMILY_RELATIONSHIPS = [
  { code: 'SPOUSE', label: 'Spouse' },
  { code: 'PARENT', label: 'Parent' },
  { code: 'CHILD', label: 'Child' },
  { code: 'GRANDPARENT', label: 'Grandparent' },
  { code: 'SIBLING', label: 'Sibling' },
  { code: 'OTHER', label: 'Other' },
] as const;

export function relationshipLabel(code: string): string {
  return FAMILY_RELATIONSHIPS.find((row) => row.code === code)?.label ?? code.replace(/_/g, ' ');
}

export function memberSummary(member: FamilyMember): string {
  const parts = [relationshipLabel(member.relationship_code)];
  if (member.age_years != null) {
    parts.push(`${member.age_years} yrs`);
  }
  return parts.join(' · ');
}
