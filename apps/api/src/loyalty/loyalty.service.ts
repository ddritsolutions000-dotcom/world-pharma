import { Injectable } from '@nestjs/common';
import {
  LoyaltyLedgerEntryKind,
  LoyaltyProgramStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { isCompanyRole } from '../identity/authority';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyResolver,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async isEnabled(countryCode: string): Promise<boolean> {
    const policy = await this.policies.resolvePublished(countryCode);
    return Boolean(policy?.document.crm?.loyalty?.enabled);
  }

  async getBalance(principal: Principal, countryCode: string) {
    const enabled = await this.isEnabled(countryCode);
    if (!enabled) {
      return {
        enabled: false,
        balance_points: 0,
        live_redemption: false,
      };
    }
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const program = await this.activeProgram(country.id);
        if (!program) {
          return { enabled: true, balance_points: 0, live_redemption: false, program_code: null };
        }
        const account = await this.ensureAccount(program.id, principal.personId, country.id);
        const balance = await this.computeBalance(account.id);
        return {
          enabled: true,
          balance_points: balance,
          live_redemption: false,
          program_code: program.code,
        };
      },
    );
  }

  async listLedger(principal: Principal, countryCode: string) {
    const enabled = await this.isEnabled(countryCode);
    if (!enabled) {
      throw Errors.forbidden('Loyalty is not enabled for this country');
    }
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const program = await this.activeProgram(country.id);
        if (!program) {
          return { data: [] };
        }
        const account = await this.prisma.loyaltyAccount.findUnique({
          where: { programId_personId: { programId: program.id, personId: principal.personId } },
        });
        if (!account) {
          return { data: [] };
        }
        const rows = await this.prisma.loyaltyLedgerEntry.findMany({
          where: { accountId: account.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            points_delta: row.pointsDelta,
            order_id: row.orderId,
            created_at: row.createdAt.toISOString(),
          })),
        };
      },
    );
  }

  async listPrograms(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const rows = await this.prisma.loyaltyProgram.findMany({
        where: { countryId: country.id },
        orderBy: [{ updatedAt: 'desc' }],
      });
      return {
        data: rows.map((row) => this.presentProgram(row, country.isoAlpha2)),
      };
    });
  }

  async createProgram(
    principal: Principal,
    input: { country_code: string; code: string; name: string; points_per_currency_minor?: number },
  ) {
    this.assertAdmin(principal);
    await this.assertLoyaltyPackEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const code = input.code.trim().toUpperCase();
    if (!code) {
      throw Errors.validation('Program code is required');
    }
    try {
      return await runWithTenant(
        workerTenantContext({ countryId: country.id, personId: principal.personId }),
        async () => {
          const row = await this.prisma.loyaltyProgram.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              code,
              name: input.name.trim(),
              status: LoyaltyProgramStatus.DRAFT,
              pointsPerCurrencyMinor: input.points_per_currency_minor ?? 100,
            },
          });
          await this.securityEvents.emit({
            type: 'LOYALTY_PROGRAM_CREATED',
            outcome: 'success',
            personId: principal.personId,
            metadata: { program_id: row.id, country_id: country.id },
          });
          return this.presentProgram(row, country.isoAlpha2);
        },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('Loyalty program code already exists in this country');
      }
      throw err;
    }
  }

  async updateProgram(
    principal: Principal,
    id: string,
    input: { country_code: string; status?: string; name?: string; version: number },
  ) {
    this.assertAdmin(principal);
    await this.assertLoyaltyPackEnabled(input.country_code);
    assertUuid(id, 'program id');
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.loyaltyProgram.findFirst({
          where: { id, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Loyalty program not found');
        }
        if (row.version !== input.version) {
          throw Errors.conflict('Loyalty program version conflict');
        }
        const nextStatus = input.status
          ? this.parseStatus(input.status)
          : row.status;
        const updated = await this.prisma.loyaltyProgram.update({
          where: { id: row.id },
          data: {
            name: input.name?.trim() ?? row.name,
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        await this.securityEvents.emit({
          type: 'LOYALTY_PROGRAM_UPDATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { program_id: updated.id, country_id: country.id, status: updated.status },
        });
        return this.presentProgram(updated, country.isoAlpha2);
      },
    );
  }

  async accrueForPaidOrder(input: {
    orderId: string;
    personId: string;
    countryId: string;
    countryCode: string;
    totalMinor: bigint;
  }) {
    const enabled = await this.isEnabled(input.countryCode);
    if (!enabled) {
      return { accrued: false, reason: 'loyalty_disabled' };
    }
    return runWithTenant(
      workerTenantContext({ countryId: input.countryId, personId: input.personId }),
      async () => {
        const program = await this.activeProgram(input.countryId);
        if (!program || program.pointsPerCurrencyMinor <= 0) {
          return { accrued: false, reason: 'no_active_program' };
        }
        const points = Number(input.totalMinor / BigInt(program.pointsPerCurrencyMinor));
        if (points <= 0) {
          return { accrued: false, reason: 'zero_points' };
        }
        const account = await this.ensureAccount(program.id, input.personId, input.countryId);
        const source = 'order_paid';
        const sourceKey = input.orderId;
        const existing = await this.prisma.loyaltyLedgerEntry.findUnique({
          where: {
            source_sourceKey_kind: {
              source,
              sourceKey,
              kind: LoyaltyLedgerEntryKind.EARN,
            },
          },
        });
        if (existing) {
          return { accrued: false, duplicate: true, entry_id: existing.id };
        }
        try {
          const entry = await this.prisma.loyaltyLedgerEntry.create({
            data: {
              id: uuidv7(),
              accountId: account.id,
              countryId: input.countryId,
              kind: LoyaltyLedgerEntryKind.EARN,
              pointsDelta: points,
              source,
              sourceKey,
              orderId: input.orderId,
              metadata: { total_minor: input.totalMinor.toString() },
            },
          });
          await this.securityEvents.emit({
            type: 'LOYALTY_LEDGER_ENTRY_RECORDED',
            outcome: 'success',
            personId: input.personId,
            metadata: {
              entry_id: entry.id,
              order_id: input.orderId,
              points_delta: points,
              country_id: input.countryId,
            },
          });
          return { accrued: true, entry_id: entry.id, points };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return { accrued: false, duplicate: true };
          }
          throw err;
        }
      },
    );
  }

  private async activeProgram(countryId: string) {
    return this.prisma.loyaltyProgram.findFirst({
      where: { countryId, status: LoyaltyProgramStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async ensureAccount(programId: string, personId: string, countryId: string) {
    const existing = await this.prisma.loyaltyAccount.findUnique({
      where: { programId_personId: { programId, personId } },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.loyaltyAccount.create({
        data: {
          id: uuidv7(),
          programId,
          personId,
          countryId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.loyaltyAccount.findUniqueOrThrow({
          where: { programId_personId: { programId, personId } },
        });
      }
      throw err;
    }
  }

  private async computeBalance(accountId: string) {
    const rows = await this.prisma.loyaltyLedgerEntry.findMany({
      where: { accountId },
      select: { pointsDelta: true },
    });
    return rows.reduce((sum, row) => sum + row.pointsDelta, 0);
  }

  private presentProgram(
    row: {
      id: string;
      code: string;
      name: string;
      status: LoyaltyProgramStatus;
      version: number;
      pointsPerCurrencyMinor: number;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      version: row.version,
      country_code: countryCode,
      points_per_currency_minor: row.pointsPerCurrencyMinor,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private parseStatus(raw: string): LoyaltyProgramStatus {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(LoyaltyProgramStatus).includes(upper as LoyaltyProgramStatus)) {
      throw Errors.validation('Invalid loyalty program status');
    }
    return upper as LoyaltyProgramStatus;
  }

  private assertAdmin(principal: Principal) {
    if (!principal.roles.some((role) => isCompanyRole(role))) {
      throw Errors.forbidden('Admin access required');
    }
  }

  private async assertLoyaltyPackEnabled(countryCode: string) {
    if (!(await this.isEnabled(countryCode))) {
      throw Errors.forbidden('Loyalty is not enabled for this country');
    }
  }
}
