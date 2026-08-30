import { createHash } from 'node:crypto';
import { HealthArtifactStatus, HealthArtifactType } from '@prisma/client';

export const CLINICAL_SEARCH_MAX_QUERY_LEN = 120;
export const CLINICAL_SEARCH_MAX_RESULTS = 25;
export const CLINICAL_SEARCH_MIN_QUERY_LEN = 2;

/** Static denylist for symptom-to-drug / clinical advice queries (R13-G). */
export const CLINICAL_SEARCH_STATIC_BLOCKLIST = [
  'symptom',
  'diagnosis',
  'diagnose',
  'treat',
  'treatment',
  'prescribe',
  'patients like you',
  'drug for',
  'medicine for',
  'what should i take',
] as const;

export type ClinicalSearchResultItem = {
  artifact_id: string;
  artifact_type: HealthArtifactType;
  title: string;
  published_at: string | null;
};

export type ClinicalSearchResponse = {
  country_code: string;
  patient_person_id: string;
  query: string;
  result_count: number;
  items: ClinicalSearchResultItem[];
};

export const CLINICAL_SEARCH_RESPONSE_FIELDS = [
  'artifact_id',
  'artifact_type',
  'title',
  'published_at',
] as const;

export function hashClinicalSearchQuery(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function isClinicalQueryBlocked(query: string, extraTerms: string[] = []): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  for (const term of [...CLINICAL_SEARCH_STATIC_BLOCKLIST, ...extraTerms]) {
    const blocked = term.trim().toLowerCase();
    if (blocked && normalized.includes(blocked)) {
      return true;
    }
  }
  return false;
}

export function normalizeClinicalSearchQuery(query: string): string {
  return query.trim().slice(0, CLINICAL_SEARCH_MAX_QUERY_LEN);
}

export function isPublishedArtifactStatus(status: HealthArtifactStatus): boolean {
  return status === HealthArtifactStatus.ACTIVE;
}

export function toClinicalSearchTitle(title: string | null | undefined, artifactType: HealthArtifactType): string {
  const trimmed = title?.trim();
  if (trimmed) {
    return trimmed.slice(0, 200);
  }
  return artifactType.replace(/_/g, ' ');
}
