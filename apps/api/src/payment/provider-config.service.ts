import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PaymentGatewayRegistry } from './gateway.registry';
import { isLivePaymentEnabled, isMockGatewayCode } from './payment.config';
import { assertObservabilityResponseSafe } from './payment-observability';
import {
  assertSafeVaultPath,
  assertSandboxProviderEnvironment,
  normalizeCountriesCsv,
  normalizeCurrenciesCsv,
  normalizeMethodsCsv,
  normalizePriority,
  normalizeProviderName,
  type ProviderConfigPatch,
} from './provider-config';
import { evaluateR14AGates, type R14AGateSnapshot } from './r14a-gate';

type GatewayRow = Prisma.PaymentGatewayGetPayload<{
  include: { accounts: true; capabilities: true };
}>;

@Injectable()
export class ProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly security: SecurityEventsService,
  ) {}

  async list() {
    await this.ensureCatalog();
    const [rows, snapshots] = await Promise.all([
      this.prisma.paymentGateway.findMany({
        include: { accounts: true, capabilities: true },
        orderBy: [{ priority: 'asc' }, { code: 'asc' }],
      }),
      this.loadGateSnapshots(),
    ]);
    const evaluation = evaluateR14AGates(snapshots, { livePaymentEnabled: isLivePaymentEnabled() });
    const body = {
      kernel: 'provider_agnostic' as const,
      selection: 'configuration_driven' as const,
      live_payment_enabled: isLivePaymentEnabled(),
      live_production_status: evaluation.live_production_status,
      owner_evidenced_count: evaluation.owner_evidenced_count,
      live_unlock_blocked_reason: evaluation.live_unlock_blocked_reason,
      registered_adapter_codes: this.gateways.registeredCodes(),
      note: 'Active PSP/gateway is selected from this catalog at runtime. Changing priority/active does not require application-code changes. Admin configuration cannot bypass Book-263 human gates or PAYMENT_LIVE_ENABLED. No live PSP is configured.',
      providers: rows.map((row) => this.toProvider(row)),
    };
    assertObservabilityResponseSafe(body);
    return body;
  }

  async get(codeRaw: string) {
    const row = await this.requireGateway(codeRaw);
    const body = { provider: this.toProvider(row) };
    assertObservabilityResponseSafe(body);
    return body;
  }

  async audit(codeRaw: string) {
    const code = codeRaw.trim().toUpperCase();
    await this.requireGateway(code);
    const events = await this.prisma.securityEvent.findMany({
      where: { type: 'PAYMENT_GATEWAY_CONFIG_UPDATED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const data = events
      .filter((event) => {
        const metadata = event.metadata;
        return Boolean(
          metadata &&
            typeof metadata === 'object' &&
            !Array.isArray(metadata) &&
            (metadata as Record<string, unknown>).gateway_code === code,
        );
      })
      .slice(0, 50)
      .map((event) => ({
        id: event.id,
        outcome: event.outcome,
        actor_person_id: event.personId,
        created_at: event.createdAt.toISOString(),
        metadata: event.metadata,
      }));
    const body = { gateway_code: code, data };
    assertObservabilityResponseSafe(body);
    return body;
  }

  async update(principal: Principal, codeRaw: string, patch: ProviderConfigPatch) {
    const existing = await this.requireGateway(codeRaw);
    const code = existing.code;
    if (patch.environment !== undefined) {
      assertSandboxProviderEnvironment(patch.environment, code);
    }
    if (patch.account?.environment !== undefined) {
      assertSandboxProviderEnvironment(patch.account.environment, code);
    }

    const nextActive = patch.active ?? existing.active;
    if (nextActive && !this.gateways.isRegistered(code)) {
      throw Errors.problem(
        409,
        'UNKNOWN_PAYMENT_GATEWAY',
        'Unknown gateway',
        `Gateway "${code}" has no registered adapter. Enabling it would fail closed at submit. Register an adapter in a later live-PSP CR — do not invent a provider here.`,
      );
    }
    if (patch.active === true && existing.environment !== 'sandbox') {
      assertSandboxProviderEnvironment(existing.environment, code);
    }
    if (isMockGatewayCode(code) && (patch.environment ?? existing.environment) !== 'sandbox') {
      throw Errors.problem(
        409,
        'MOCK_GATEWAY_PRODUCTION_FORBIDDEN',
        'Mock gateway forbidden',
        `Gateway "${code}" is sandbox-only.`,
      );
    }

    const nextName = patch.name !== undefined ? normalizeProviderName(patch.name) : existing.name;
    const nextPriority = patch.priority !== undefined ? normalizePriority(patch.priority) : existing.priority;
    const nextVaultPath =
      patch.vault_path !== undefined ? (assertSafeVaultPath(patch.vault_path), patch.vault_path.trim()) : existing.secretRef;

    let account = this.pickAccount(existing, patch.account?.code);
    if (patch.account && !account) {
      throw Errors.problem(
        400,
        'PROVIDER_CONFIG_INCOMPLETE',
        'Provider configuration incomplete',
        'account.code must match an existing gateway account. Creating new accounts/PSP codes is out of scope.',
      );
    }

    const previous = this.toProvider(existing);
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentGateway.update({
        where: { id: existing.id },
        data: {
          active: nextActive,
          name: nextName,
          priority: nextPriority,
          secretRef: nextVaultPath,
          environment: 'sandbox',
        },
      });
      if (patch.account && account) {
        if (patch.account.vault_path !== undefined) {
          assertSafeVaultPath(patch.account.vault_path);
        }
        await tx.paymentGatewayAccount.update({
          where: { id: account.id },
          data: {
            active: patch.account.active ?? account.active,
            countriesCsv:
              patch.account.countries_csv !== undefined
                ? normalizeCountriesCsv(patch.account.countries_csv)
                : account.countriesCsv,
            currenciesCsv:
              patch.account.currencies_csv !== undefined
                ? normalizeCurrenciesCsv(patch.account.currencies_csv)
                : account.currenciesCsv,
            methodsCsv:
              patch.account.methods_csv !== undefined
                ? normalizeMethodsCsv(patch.account.methods_csv)
                : account.methodsCsv,
            secretRef:
              patch.account.vault_path !== undefined ? patch.account.vault_path.trim() : account.secretRef,
            environment: 'sandbox',
          },
        });
      }
    });

    const updated = await this.requireGateway(code);
    const next = this.toProvider(updated);
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    if (changed) {
      await this.security.emit({
        type: 'PAYMENT_GATEWAY_CONFIG_UPDATED',
        outcome: 'success',
        personId: principal.personId,
        sessionId: principal.sessionId,
        metadata: {
          gateway_code: code,
          previous: { active: previous.active, priority: previous.priority, name: previous.name },
          next: { active: next.active, priority: next.priority, name: next.name },
        },
      });
    }
    return this.list();
  }

  private async ensureCatalog(): Promise<void> {
    const count = await this.prisma.paymentGateway.count();
    if (count === 0) {
      throw Errors.problem(
        503,
        'PROVIDER_CONFIG_INCOMPLETE',
        'Provider configuration incomplete',
        'No payment_gateways rows exist. Sandbox seed must create MOCK_* catalog rows before admin configuration.',
      );
    }
  }

  private async requireGateway(codeRaw: string): Promise<GatewayRow> {
    const code = codeRaw.trim().toUpperCase();
    if (!code) {
      throw Errors.validation('gateway code is required');
    }
    const row = await this.prisma.paymentGateway.findUnique({
      where: { code },
      include: { accounts: true, capabilities: true },
    });
    if (!row) {
      throw Errors.notFound(`Payment gateway "${code}" is not in the catalog. New PSP codes cannot be created here.`);
    }
    return row;
  }

  private pickAccount(row: GatewayRow, accountCode?: string) {
    if (accountCode?.trim()) {
      return row.accounts.find((account) => account.code === accountCode.trim()) ?? null;
    }
    return row.accounts[0] ?? null;
  }

  private toProvider(row: GatewayRow) {
    return {
      code: row.code,
      name: row.name,
      environment: row.environment,
      active: row.active,
      priority: row.priority,
      health_score: row.healthScore,
      vault_path: row.secretRef,
      registry_registered: this.gateways.isRegistered(row.code),
      capabilities: row.capabilities.filter((cap) => cap.enabled).map((cap) => cap.name).sort(),
      accounts: row.accounts.map((account) => ({
        code: account.code,
        active: account.active,
        environment: account.environment,
        countries_csv: account.countriesCsv,
        currencies_csv: account.currenciesCsv,
        methods_csv: account.methodsCsv,
        vault_path: account.secretRef,
      })),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private async loadGateSnapshots(): Promise<R14AGateSnapshot[]> {
    const rows = await this.prisma.r14AHumanGate.findMany();
    return rows.map((row) => ({
      gateCode: row.gateCode,
      valueText: row.valueText,
      evidenceClass: row.evidenceClass,
      evidenceRef: row.evidenceRef,
      updatedByPersonId: row.updatedByPersonId,
      verifiedByPersonId: row.verifiedByPersonId,
      verifiedAt: row.verifiedAt,
      updatedAt: row.updatedAt,
    }));
  }
}
