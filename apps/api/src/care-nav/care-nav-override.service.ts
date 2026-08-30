import { Injectable } from '@nestjs/common';
import { CareNavSessionStatus, ClinicalRelationshipStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { CareMatchService } from './care-match.service';
import { CareNavAuditService } from './care-nav-audit.service';
import { assertCareNavTransition, isTerminalCareNavStatus } from './care-nav-status';
import { assertCareNavigationEnabled, resolveCareNavCountry } from './care-nav-session.access';

const OVERRIDE_ACTIONS = ['REMATCH', 'TERMINATE'] as const;
type OverrideAction = (typeof OVERRIDE_ACTIONS)[number];

@Injectable()
export class CareNavOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly match: CareMatchService,
    private readonly audits: CareNavAuditService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async applyOverride(
    principal: Principal,
    sessionId: string,
    body: {
      action: string;
      reason?: string;
      country_code?: string;
      idempotency_key?: string;
    },
    requestId?: string,
  ) {
    if (!this.isUuid(sessionId)) {
      throw Errors.validation('Invalid session id');
    }
    const action = this.parseAction(body.action);
    const reason = body.reason?.trim();
    if (!reason) {
      throw Errors.validation('reason is required');
    }
    if (reason.length < 8) {
      throw Errors.validation('reason must be at least 8 characters');
    }

    const countryCode = body.country_code?.trim().toUpperCase();
    if (!countryCode) {
      throw Errors.validation('country_code is required');
    }
    const country = await resolveCareNavCountry(this.prisma, countryCode);
    await assertCareNavigationEnabled(this.policy, country.isoAlpha2);

    if (body.idempotency_key?.trim()) {
      const existing = await this.prisma.careNavOverride.findUnique({
        where: {
          sessionId_idempotencyKey: {
            sessionId,
            idempotencyKey: body.idempotency_key.trim(),
          },
        },
      });
      if (existing) {
        return this.presentOverride(existing);
      }
    }

    const session = await this.prisma.careNavigationSession.findFirst({
      where: { id: sessionId, countryId: country.id },
    });
    if (!session) {
      throw Errors.notFound('Care navigation session not found');
    }

    await this.assertOverrideActor(principal, session.personId, session.countryId);

    if (isTerminalCareNavStatus(session.status)) {
      throw Errors.conflict('Care navigation session is no longer active');
    }

    let priorState: Record<string, unknown>;
    let newState: Record<string, unknown>;
    let overrideId = uuidv7();

    if (action === 'REMATCH') {
      const result = await this.match.rematchForGovernance({
        sessionId,
        countryIso: country.isoAlpha2,
        actorPersonId: principal.personId,
      });
      priorState = result.priorState;
      newState = result.newState;
    } else {
      priorState = {
        status: session.status,
        match_set_version: session.matchSetVersion,
        red_flag: session.redFlag,
      };
      assertCareNavTransition(session.status, CareNavSessionStatus.TERMINATED);
      const now = new Date();
      await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
        await this.prisma.careNavigationSession.update({
          where: { id: session.id },
          data: { status: CareNavSessionStatus.TERMINATED, terminatedAt: now },
        });
        await this.audits.record({
          sessionId: session.id,
          actorPersonId: principal.personId,
          action: 'GOVERNANCE_TERMINATE',
          metadata: { reason_code: 'GOVERNANCE_OVERRIDE' },
        });
      });
      newState = {
        status: CareNavSessionStatus.TERMINATED,
        match_set_version: session.matchSetVersion,
        red_flag: session.redFlag,
        terminated_at: now.toISOString(),
      };
    }

    const override = await runWithTenant(workerTenantContext({ countryId: country.id }), async () =>
      this.prisma.careNavOverride.create({
        data: {
          id: overrideId,
          sessionId: session.id,
          actorPersonId: principal.personId,
          action,
          reason,
          priorState: priorState as Prisma.InputJsonValue,
          newState: newState as Prisma.InputJsonValue,
          idempotencyKey: body.idempotency_key?.trim() || null,
        },
      }),
    );

    await this.securityEvents.emit({
      type: 'CARE_NAV_OVERRIDE_APPLIED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: {
        session_id: session.id,
        override_id: override.id,
        action,
        country_id: country.id,
      },
    });

    return this.presentOverride(override);
  }

  private async assertOverrideActor(principal: Principal, patientPersonId: string, countryId: string) {
    if (principal.audience === 'admin') {
      return;
    }
    if (principal.audience !== 'doctor') {
      throw Errors.forbidden('Override requires admin or doctor session');
    }

    const partner = await this.prisma.partner.findFirst({
      where: {
        personId: principal.personId,
        partnerTypeCode: 'DOCTOR',
        status: 'ACTIVE',
        countryId,
      },
    });
    if (!partner) {
      throw Errors.forbidden('Active doctor partner required for care navigation override');
    }

    const relationship = await this.prisma.clinicalRelationship.findFirst({
      where: {
        patientPersonId,
        doctorPartnerId: partner.id,
        countryId,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    if (!relationship) {
      throw Errors.forbidden('Clinical relationship required for care navigation override');
    }
  }

  private parseAction(raw: string): OverrideAction {
    const action = raw?.trim().toUpperCase();
    if (!OVERRIDE_ACTIONS.includes(action as OverrideAction)) {
      throw Errors.validation(`action must be one of: ${OVERRIDE_ACTIONS.join(', ')}`);
    }
    return action as OverrideAction;
  }

  private presentOverride(override: {
    id: string;
    sessionId: string;
    actorPersonId: string;
    action: string;
    reason: string;
    priorState: unknown;
    newState: unknown;
    idempotencyKey: string | null;
    createdAt: Date;
  }) {
    return {
      id: override.id,
      session_id: override.sessionId,
      actor_person_id: override.actorPersonId,
      action: override.action,
      reason: override.reason,
      prior_state: override.priorState,
      new_state: override.newState,
      idempotency_key: override.idempotencyKey,
      created_at: override.createdAt.toISOString(),
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
