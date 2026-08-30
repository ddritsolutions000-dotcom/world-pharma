import { CareNavSessionStatus } from '@prisma/client';
import type { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { PolicyResolver } from '../policy/resolver';
import { isTerminalCareNavStatus } from './care-nav-status';

export async function resolveCareNavCountry(prisma: PrismaService, countryCode: string) {
  const code = countryCode?.trim().toUpperCase();
  if (!code) {
    throw Errors.validation('country_code is required');
  }
  const country = await prisma.country.findUnique({ where: { isoAlpha2: code } });
  if (!country) {
    throw Errors.notFound('Country not found');
  }
  return country;
}

export async function assertCareNavigationEnabled(policy: PolicyResolver, isoAlpha2: string) {
  const resolved = await policy.resolvePublished(isoAlpha2);
  if (!policy.isCareNavigationEnabled(resolved?.document ?? null)) {
    throw Errors.forbidden('Care navigation is not enabled for this country');
  }
}

export async function assertAppointmentsEnabled(policy: PolicyResolver, isoAlpha2: string) {
  const resolved = await policy.resolvePublished(isoAlpha2);
  if (!policy.areAppointmentsEnabled(resolved?.document ?? null)) {
    throw Errors.forbidden('Appointments are not enabled for this country');
  }
}

export async function loadOwnedCareNavSession(
  prisma: PrismaService,
  sessionId: string,
  personId: string,
  countryId: string,
) {
  const session = await prisma.careNavigationSession.findFirst({
    where: { id: sessionId, personId, countryId },
    include: {
      assessments: { orderBy: { createdAt: 'desc' }, take: 1 },
      matches: { orderBy: { rank: 'asc' } },
    },
  });
  if (!session) {
    throw Errors.notFound('Care navigation session not found');
  }
  return {
    ...session,
    matches: session.matches.filter((row) => row.setVersion === session.matchSetVersion),
  };
}

export function assertCareNavSessionActive(session: { expiresAt: Date; status: CareNavSessionStatus }) {
  if (session.expiresAt.getTime() <= Date.now()) {
    throw Errors.forbidden('Care navigation session has expired');
  }
  if (isTerminalCareNavStatus(session.status)) {
    throw Errors.conflict('Care navigation session is no longer active');
  }
}

export function assertRedFlagHandoffAllowed(session: { redFlag: boolean }) {
  if (session.redFlag) {
    throw Errors.forbidden('Provider matching and booking are blocked for urgent guidance sessions');
  }
}
