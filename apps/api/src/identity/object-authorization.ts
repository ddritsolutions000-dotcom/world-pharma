/**
 * Sprint 110 — Shared object-level authorization helpers.
 * Reuses Errors + existing deny semantics. Not a parallel auth framework.
 * Prefer domain-specific ownership checks; use these helpers for consistent messages.
 */
import { Errors } from '../common/problem';

/** Authenticated caller must own the person-scoped object. */
export function assertSamePerson(
  actorPersonId: string,
  ownerPersonId: string,
  message = 'You cannot access another person’s resource.',
): void {
  if (actorPersonId !== ownerPersonId) {
    throw Errors.forbidden(message);
  }
}

/**
 * When an object id is known to exist but belongs to another principal,
 * prefer 403 (BOLA) over leaking via 404 when policy requires explicit denial.
 * When existence must be hidden, callers should use notFound instead.
 */
export function forbidCrossObjectAccess(
  message = 'You are not authorized to access this resource.',
): never {
  throw Errors.forbidden(message);
}

/** Client-supplied organization/tenant ids are never authority alone. */
export function rejectClientTenantSpoof(
  claimedOrgId: string | null | undefined,
  allowedOrgIds: string[],
  message = 'Organization scope is not authorized for this principal.',
): void {
  if (!claimedOrgId?.trim()) {
    return;
  }
  if (!allowedOrgIds.includes(claimedOrgId)) {
    throw Errors.forbidden(message);
  }
}
