import type { HealthSubject } from './health-subject.service';

/** Prisma where fragment for subject-scoped clinical/health rows owned by the account holder. */
export function subjectScopeWhere(subject: HealthSubject) {
  if (subject.kind === 'self') {
    return { subjectFamilyMemberId: null };
  }
  return { subjectFamilyMemberId: subject.familyMemberId };
}

export function subjectPersonWhere(subject: HealthSubject) {
  return {
    ...subjectScopeWhere(subject),
    ...(subject.kind === 'self'
      ? {}
      : {
          OR: [{ subjectFamilyMemberId: subject.familyMemberId }],
        }),
  };
}
