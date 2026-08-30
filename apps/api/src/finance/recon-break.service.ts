import { Injectable } from '@nestjs/common';
import {
  FinanceReconDomain,
  FinanceReconSourceKind,
  FinanceReconStatus,
  FinanceReconWorkflowStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { assertCountryAccess, countryFilter, loadAccessScope } from '../identity/scope';

export type BreakAction = 'INVESTIGATE' | 'RESOLVE' | 'CLOSE';

const WORKFLOW_NEXT: Record<BreakAction, FinanceReconWorkflowStatus> = {
  INVESTIGATE: FinanceReconWorkflowStatus.INVESTIGATING,
  RESOLVE: FinanceReconWorkflowStatus.RESOLVED,
  CLOSE: FinanceReconWorkflowStatus.CLOSED,
};

const WORKFLOW_ALLOWED_FROM: Record<BreakAction, FinanceReconWorkflowStatus[]> = {
  INVESTIGATE: [FinanceReconWorkflowStatus.OPEN],
  RESOLVE: [FinanceReconWorkflowStatus.INVESTIGATING],
  CLOSE: [FinanceReconWorkflowStatus.RESOLVED],
};

export type CreateFinanceBreakInput = {
  domain: FinanceReconDomain;
  status: FinanceReconStatus;
  breakType: string;
  countryId: string;
  detail: string;
  classification?: string;
  sourceKind: FinanceReconSourceKind;
  sourceRef?: string;
  internalRef?: string;
  externalRef?: string;
  amountMinor?: bigint;
  currency?: string;
};

@Injectable()
export class ReconBreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createBreak(input: CreateFinanceBreakInput): Promise<string> {
    const existing = await this.prisma.financeReconciliation.findFirst({
      where: {
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef ?? undefined,
        breakType: input.breakType,
        workflowStatus: { not: FinanceReconWorkflowStatus.CLOSED },
      },
    });
    if (existing) {
      return existing.id;
    }
    const row = await this.prisma.financeReconciliation.create({
      data: {
        id: uuidv7(),
        domain: input.domain,
        status: input.status,
        workflowStatus: FinanceReconWorkflowStatus.OPEN,
        breakType: input.breakType,
        classification: input.classification,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
        countryId: input.countryId,
        internalRef: input.internalRef,
        externalRef: input.externalRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        detail: input.detail,
      },
    });
    return row.id;
  }

  async ensurePayoutUnknownBreak(input: {
    payoutId: string;
    countryId: string;
    amountMinor: bigint;
    currency: string;
    providerRef?: string | null;
  }): Promise<string> {
    return this.createBreak({
      domain: FinanceReconDomain.PAYOUT,
      status: FinanceReconStatus.INVESTIGATE,
      breakType: 'payout_unknown',
      countryId: input.countryId,
      detail: `Payout ${input.payoutId} returned UNKNOWN from sandbox rail`,
      classification: 'UNKNOWN',
      sourceKind: FinanceReconSourceKind.PAYOUT,
      sourceRef: input.payoutId,
      internalRef: input.payoutId,
      externalRef: input.providerRef ?? undefined,
      amountMinor: input.amountMinor,
      currency: input.currency,
    });
  }

  async listBreaks(
    principal: Principal,
    query: {
      workflowStatus?: FinanceReconWorkflowStatus;
      domain?: FinanceReconDomain;
      classification?: string;
      countryId?: string;
      sourceKind?: FinanceReconSourceKind;
      includeClosed?: boolean;
      limit?: number;
    } = {},
  ) {
    const scope = await loadAccessScope(this.prisma, principal);
    const scopedCountry = countryFilter(scope);
    if (query.countryId) {
      assertCountryAccess(scope, query.countryId);
    }
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.financeReconciliation.findMany({
      where: {
        countryId: query.countryId ?? scopedCountry,
        domain: query.domain,
        classification: query.classification,
        sourceKind: query.sourceKind,
        workflowStatus: query.workflowStatus
          ?? (query.includeClosed ? undefined : { not: FinanceReconWorkflowStatus.CLOSED }),
        status: { not: FinanceReconStatus.MATCHED },
      },
      orderBy: { updatedAt: 'desc' },
      take,
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      data: rows.map((row) => this.presentBreak(row)),
      sandbox: true,
      live_psp: false,
    };
  }

  async getBreak(principal: Principal, breakId: string) {
    const scope = await loadAccessScope(this.prisma, principal);
    const scopedCountry = countryFilter(scope);
    const row = await this.prisma.financeReconciliation.findUnique({
      where: { id: breakId },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) {
      if (scopedCountry) {
        throw Errors.forbidden('This country is outside the current membership scope.');
      }
      throw Errors.notFound('Finance break not found.');
    }
    if (row.countryId) {
      assertCountryAccess(scope, row.countryId);
    }
    return this.presentBreak(row);
  }

  async investigate(principal: Principal, breakId: string, idempotencyKey: string, note?: string) {
    return this.transition(principal, breakId, 'INVESTIGATE', idempotencyKey, note);
  }

  async resolve(principal: Principal, breakId: string, idempotencyKey: string, note?: string) {
    return this.transition(principal, breakId, 'RESOLVE', idempotencyKey, note);
  }

  async close(principal: Principal, breakId: string, idempotencyKey: string, note?: string) {
    return this.transition(principal, breakId, 'CLOSE', idempotencyKey, note);
  }

  private async transition(
    principal: Principal,
    breakId: string,
    action: BreakAction,
    idempotencyKey: string,
    note?: string,
  ) {
    const existingAction = await this.prisma.financeReconBreakAction.findUnique({
      where: { idempotencyKey },
      include: { recon: { include: { actions: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (existingAction) {
      if (existingAction.reconId !== breakId || existingAction.action !== action) {
        throw Errors.problem(
          409,
          'BREAK_ACTION_IDEMPOTENCY_CONFLICT',
          'Break action idempotency conflict',
          'Idempotency key was already used for a different break action.',
        );
      }
      return this.presentBreak(existingAction.recon);
    }

    const row = await this.prisma.financeReconciliation.findUnique({
      where: { id: breakId },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) {
      throw Errors.notFound('Finance break not found.');
    }
    if (row.countryId) {
      const scope = await loadAccessScope(this.prisma, principal);
      assertCountryAccess(scope, row.countryId);
    }
    if (row.workflowStatus === WORKFLOW_NEXT[action]) {
      return this.presentBreak(row);
    }
    if (!WORKFLOW_ALLOWED_FROM[action].includes(row.workflowStatus)) {
      throw Errors.problem(
        409,
        'ILLEGAL_BREAK_TRANSITION',
        'Illegal break transition',
        `Cannot ${action.toLowerCase()} break in workflow status ${row.workflowStatus}.`,
      );
    }
    if (row.workflowStatus === FinanceReconWorkflowStatus.CLOSED) {
      throw Errors.problem(409, 'BREAK_ALREADY_CLOSED', 'Break already closed', 'Closed breaks are terminal.');
    }

    const nextStatus = WORKFLOW_NEXT[action];
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const actionRow = await tx.financeReconBreakAction.create({
        data: {
          id: uuidv7(),
          reconId: breakId,
          action,
          actorPersonId: principal.personId,
          note: note ?? null,
          idempotencyKey,
        },
      });
      const data: Prisma.FinanceReconciliationUpdateInput = {
        workflowStatus: nextStatus,
      };
      if (action === 'INVESTIGATE') {
        data.investigatedBy = principal.personId;
        data.investigatedAt = now;
      }
      if (action === 'RESOLVE') {
        data.resolvedBy = principal.personId;
        data.resolvedAt = now;
        data.resolutionNote = note ?? null;
      }
      if (action === 'CLOSE') {
        data.closedBy = principal.personId;
        data.closedAt = now;
        data.closeNote = note ?? null;
      }
      const recon = await tx.financeReconciliation.update({
        where: { id: breakId },
        data,
        include: { actions: { orderBy: { createdAt: 'asc' } } },
      });
      await this.outbox.enqueue(tx, {
        type: `FINANCE_BREAK_${action}`,
        aggregateType: 'FinanceReconciliation',
        aggregateId: breakId,
        producer: 'finance',
        payload: {
          action,
          workflow_status: nextStatus,
          actor_person_id: principal.personId,
          action_id: actionRow.id,
          note: note ?? null,
          sandbox: true,
        },
        occurrenceKey: `finance_break:${breakId}:${action}:${actionRow.id}`,
      });
      return recon;
    });
    return this.presentBreak(updated);
  }

  private presentBreak(row: {
    id: string;
    domain: FinanceReconDomain;
    status: FinanceReconStatus;
    workflowStatus: FinanceReconWorkflowStatus;
    breakType: string;
    classification: string | null;
    sourceKind: FinanceReconSourceKind | null;
    sourceRef: string | null;
    countryId: string | null;
    internalRef: string | null;
    externalRef: string | null;
    amountMinor: bigint | null;
    currency: string | null;
    detail: string;
    investigatedBy: string | null;
    investigatedAt: Date | null;
    resolutionNote: string | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    closeNote: string | null;
    closedBy: string | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    actions?: Array<{
      id: string;
      action: string;
      actorPersonId: string | null;
      note: string | null;
      idempotencyKey: string;
      createdAt: Date;
    }>;
  }) {
    return {
      id: row.id,
      domain: row.domain,
      status: row.status,
      workflow_status: row.workflowStatus,
      break_type: row.breakType,
      classification: row.classification,
      source_kind: row.sourceKind,
      source_ref: row.sourceRef,
      country_id: row.countryId,
      internal_ref: row.internalRef,
      external_ref: row.externalRef,
      amount_minor: row.amountMinor === null ? null : row.amountMinor.toString(),
      currency: row.currency,
      detail: row.detail,
      investigated_by: row.investigatedBy,
      investigated_at: row.investigatedAt?.toISOString() ?? null,
      resolution_note: row.resolutionNote,
      resolved_by: row.resolvedBy,
      resolved_at: row.resolvedAt?.toISOString() ?? null,
      close_note: row.closeNote,
      closed_by: row.closedBy,
      closed_at: row.closedAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      sandbox: true,
      live_psp: false,
      actions: (row.actions ?? []).map((action) => ({
        id: action.id,
        action: action.action,
        actor_person_id: action.actorPersonId,
        note: action.note,
        idempotency_key: action.idempotencyKey,
        created_at: action.createdAt.toISOString(),
      })),
    };
  }
}
