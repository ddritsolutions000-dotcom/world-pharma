import { Injectable } from '@nestjs/common';
import { CareNavSessionStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { AppointmentService } from '../clinical/appointment.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { CareNavAuditService } from './care-nav-audit.service';
import { assertCareNavTransition, isTerminalCareNavStatus } from './care-nav-status';
import {
  assertAppointmentsEnabled,
  assertCareNavSessionActive,
  assertCareNavigationEnabled,
  assertRedFlagHandoffAllowed,
  loadOwnedCareNavSession,
  resolveCareNavCountry,
} from './care-nav-session.access';

const GENERAL_PRACTICE = 'general_practice';

type DoctorCandidate = {
  id: string;
  displayName: string | null;
  professionalName: string | null;
  specialties: Prisma.JsonValue;
  onlineCapable: boolean;
  specialtyScore: number;
  explanationKey: string;
};

function parseSpecialties(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function scoreDoctor(specialtyCodes: string[], doctorSpecialties: string[]): {
  score: number;
  explanationKey: string;
} {
  const normalized = new Set(doctorSpecialties.map((code) => code.toLowerCase()));
  const wanted = specialtyCodes.map((code) => code.toLowerCase());
  const directMatches = wanted.filter((code) => normalized.has(code)).length;
  if (directMatches > 0) {
    return { score: directMatches * 10, explanationKey: 'care_nav.match.specialty_match' };
  }
  if (wanted.includes(GENERAL_PRACTICE) && normalized.has(GENERAL_PRACTICE)) {
    return { score: 5, explanationKey: 'care_nav.match.general_practice_fallback' };
  }
  return { score: 0, explanationKey: 'care_nav.match.country_eligible' };
}

@Injectable()
export class CareMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly appointments: AppointmentService,
    private readonly audits: CareNavAuditService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async getRecommendations(principal: Principal, sessionId: string, countryCode: string, requestId?: string) {
    const country = await resolveCareNavCountry(this.prisma, countryCode);
    await assertCareNavigationEnabled(this.policy, country.isoAlpha2);
    await assertAppointmentsEnabled(this.policy, country.isoAlpha2);

    const session = await loadOwnedCareNavSession(this.prisma, sessionId, principal.personId, country.id);
    assertCareNavSessionActive(session);
    assertRedFlagHandoffAllowed(session);

    if (session.status === CareNavSessionStatus.COMPLETED || session.status === CareNavSessionStatus.TERMINATED) {
      throw Errors.conflict('Care navigation session is no longer active');
    }

    if (session.status === CareNavSessionStatus.MATCHED && session.matches.length > 0) {
      const profiles = await this.loadDoctorProfiles(session.matches);
      return this.present(session.id, session.status, session.matches, profiles, country.isoAlpha2);
    }

    if (session.status !== CareNavSessionStatus.TRIAGED && session.status !== CareNavSessionStatus.MATCHED) {
      throw Errors.conflict('Care navigation session is not ready for matching');
    }

    const assessment = session.assessments[0];
    if (!assessment) {
      throw Errors.conflict('Triage assessment is required before matching');
    }

    const specialtyCodes = assessment.specialtyCodes.length > 0 ? assessment.specialtyCodes : [GENERAL_PRACTICE];
    const directory = await this.appointments.directory(country.isoAlpha2);
    const ranked: DoctorCandidate[] = [];
    for (const row of directory.doctors) {
      const doctorSpecialties = parseSpecialties(row.specialties as Prisma.JsonValue);
      const { score, explanationKey } = scoreDoctor(specialtyCodes, doctorSpecialties);
      if (score <= 0) {
        continue;
      }
      let key = explanationKey;
      if (row.online_capable) {
        key = `${explanationKey};care_nav.match.tele_capable`;
      }
      ranked.push({
        id: row.profile_id,
        displayName: row.display_name,
        professionalName: row.display_name,
        specialties: row.specialties as Prisma.JsonValue,
        onlineCapable: row.online_capable,
        specialtyScore: score,
        explanationKey: key,
      });
    }
    ranked.sort((a, b) => {
      if (b.specialtyScore !== a.specialtyScore) {
        return b.specialtyScore - a.specialtyScore;
      }
      const nameA = (a.displayName || a.professionalName || '').toLowerCase();
      const nameB = (b.displayName || b.professionalName || '').toLowerCase();
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB);
      }
      return a.id.localeCompare(b.id);
    });
    const topRanked = ranked.slice(0, 10);

    const now = new Date();
    const setVersion = session.matchSetVersion;
    const matchRows = topRanked.map((row, index) => ({
      id: uuidv7(),
      sessionId: session.id,
      doctorProfileId: row.id,
      rank: index + 1,
      explanationKey: row.explanationKey,
      setVersion,
    }));

    await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      await this.prisma.$transaction(async (tx) => {
        if (matchRows.length > 0) {
          await tx.careMatchRecommendation.createMany({ data: matchRows });
        }
        if (session.status === CareNavSessionStatus.TRIAGED) {
          assertCareNavTransition(session.status, CareNavSessionStatus.MATCHED);
          await tx.careNavigationSession.update({
            where: { id: session.id },
            data: { status: CareNavSessionStatus.MATCHED, matchedAt: now },
          });
        }
      });

      await this.audits.record({
        sessionId: session.id,
        actorPersonId: principal.personId,
        action: 'MATCH_COMPLETED',
        metadata: {
          recommendation_count: matchRows.length,
          no_match: matchRows.length === 0,
        },
      });
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_MATCH_COMPLETED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, recommendation_count: matchRows.length },
    });

    const profiles = new Map(topRanked.map((row) => [row.id, row]));
    const persisted = matchRows.map((row) => ({
      ...row,
      doctorProfile: profiles.get(row.doctorProfileId!),
    }));

    return this.present(
      session.id,
      CareNavSessionStatus.MATCHED,
      persisted.map((row) => ({
        id: row.id,
        rank: row.rank,
        explanationKey: row.explanationKey,
        doctorProfileId: row.doctorProfileId,
      })),
      profiles,
      country.isoAlpha2,
    );
  }

  private async loadDoctorProfiles(
    matches: Array<{ doctorProfileId: string | null }>,
  ): Promise<Map<string, DoctorCandidate>> {
    const ids = matches.map((row) => row.doctorProfileId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.doctorProfile.findMany({ where: { id: { in: ids } } });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          displayName: row.displayName,
          professionalName: row.professionalName,
          specialties: row.specialties,
          onlineCapable: row.onlineCapable,
          specialtyScore: 0,
          explanationKey: '',
        },
      ]),
    );
  }

  private async present(
    sessionId: string,
    status: CareNavSessionStatus,
    matches: Array<{
      id: string;
      rank: number;
      explanationKey: string;
      doctorProfileId: string | null;
    }>,
    profiles: Map<string, DoctorCandidate>,
    countryCode: string,
  ) {
    const resolved = await this.policy.resolvePublished(countryCode);
    const telePack = this.policy.isTelemedicineEligible(resolved?.document ?? null);

    return {
      session_id: sessionId,
      status,
      no_match: matches.length === 0,
      explanation_key: matches.length === 0 ? 'care_nav.match.no_providers' : 'care_nav.match.completed',
      tele_available: telePack && matches.some((row) => profiles.get(row.doctorProfileId ?? '')?.onlineCapable),
      recommendations: matches.map((row) => {
        const profile = row.doctorProfileId ? profiles.get(row.doctorProfileId) : undefined;
        return {
          id: row.id,
          rank: row.rank,
          doctor_profile_id: row.doctorProfileId,
          display_name: profile?.displayName || profile?.professionalName || 'Doctor',
          specialties: parseSpecialties(profile?.specialties ?? []),
          online_capable: profile?.onlineCapable ?? false,
          explanation_key: row.explanationKey,
        };
      }),
    };
  }

  async rematchForGovernance(input: {
    sessionId: string;
    countryIso: string;
    actorPersonId: string;
  }) {
    const country = await resolveCareNavCountry(this.prisma, input.countryIso);
    await assertCareNavigationEnabled(this.policy, country.isoAlpha2);
    await assertAppointmentsEnabled(this.policy, country.isoAlpha2);

    const session = await this.prisma.careNavigationSession.findFirst({
      where: { id: input.sessionId, countryId: country.id },
      include: { assessments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!session) {
      throw Errors.notFound('Care navigation session not found');
    }
    if (isTerminalCareNavStatus(session.status)) {
      throw Errors.conflict('Care navigation session is no longer active');
    }
    if (session.appointmentId) {
      throw Errors.conflict('Cannot rematch after appointment handoff');
    }
    if (
      session.status !== CareNavSessionStatus.TRIAGED &&
      session.status !== CareNavSessionStatus.MATCHED
    ) {
      throw Errors.conflict('Care navigation session is not ready for rematching');
    }

    const assessment = session.assessments[0];
    if (!assessment) {
      throw Errors.conflict('Triage assessment is required before rematching');
    }

    const priorState = {
      status: session.status,
      match_set_version: session.matchSetVersion,
      red_flag: session.redFlag,
    };

    const specialtyCodes = assessment.specialtyCodes.length > 0 ? assessment.specialtyCodes : [GENERAL_PRACTICE];
    const directory = await this.appointments.directory(country.isoAlpha2);
    const ranked: DoctorCandidate[] = [];
    for (const row of directory.doctors) {
      const doctorSpecialties = parseSpecialties(row.specialties as Prisma.JsonValue);
      const { score, explanationKey } = scoreDoctor(specialtyCodes, doctorSpecialties);
      if (score <= 0) {
        continue;
      }
      let key = explanationKey;
      if (row.online_capable) {
        key = `${explanationKey};care_nav.match.tele_capable`;
      }
      ranked.push({
        id: row.profile_id,
        displayName: row.display_name,
        professionalName: row.display_name,
        specialties: row.specialties as Prisma.JsonValue,
        onlineCapable: row.online_capable,
        specialtyScore: score,
        explanationKey: key,
      });
    }
    ranked.sort((a, b) => {
      if (b.specialtyScore !== a.specialtyScore) {
        return b.specialtyScore - a.specialtyScore;
      }
      const nameA = (a.displayName || a.professionalName || '').toLowerCase();
      const nameB = (b.displayName || b.professionalName || '').toLowerCase();
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB);
      }
      return a.id.localeCompare(b.id);
    });
    const topRanked = ranked.slice(0, 10);
    const newSetVersion = session.matchSetVersion + 1;
    const now = new Date();
    const matchRows = topRanked.map((row, index) => ({
      id: uuidv7(),
      sessionId: session.id,
      doctorProfileId: row.id,
      rank: index + 1,
      explanationKey: row.explanationKey,
      setVersion: newSetVersion,
    }));

    await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      await this.prisma.$transaction(async (tx) => {
        if (matchRows.length > 0) {
          await tx.careMatchRecommendation.createMany({ data: matchRows });
        }
        const nextStatus =
          session.status === CareNavSessionStatus.TRIAGED ? CareNavSessionStatus.MATCHED : session.status;
        if (session.status === CareNavSessionStatus.TRIAGED) {
          assertCareNavTransition(session.status, CareNavSessionStatus.MATCHED);
        }
        await tx.careNavigationSession.update({
          where: { id: session.id },
          data: {
            matchSetVersion: newSetVersion,
            status: nextStatus,
            matchedAt: session.matchedAt ?? now,
          },
        });
      });

      await this.audits.record({
        sessionId: session.id,
        actorPersonId: input.actorPersonId,
        action: 'GOVERNANCE_REMATCH',
        metadata: {
          recommendation_count: matchRows.length,
          match_set_version: newSetVersion,
          prior_match_set_version: session.matchSetVersion,
        },
      });
    });

    const newState = {
      status: session.status === CareNavSessionStatus.TRIAGED ? CareNavSessionStatus.MATCHED : session.status,
      match_set_version: newSetVersion,
      recommendation_count: matchRows.length,
      recommendation_ids: matchRows.map((row) => row.id),
      red_flag: session.redFlag,
    };

    return { priorState, newState };
  }
}
