import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VendorPayableStatus } from '@prisma/client';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { FinanceService } from './finance.service';
import type { MockPayoutScenario } from './payout.port';
import { SettlementImportService } from './settlement-import.service';
import { SettlementImportScheduleService } from './settlement-import-schedule.service';
import { SettlementImportWorkerService } from './settlement-import-worker.service';
import { ReconBreakService } from './recon-break.service';

@Controller('admin/finance')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class FinanceAdminController {
  constructor(
    private readonly finance: FinanceService,
    private readonly settlementImports: SettlementImportService,
    private readonly settlementImportWorker: SettlementImportWorkerService,
    private readonly settlementImportSchedules: SettlementImportScheduleService,
    private readonly reconBreaks: ReconBreakService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('finance:read')
  dashboard(@CurrentPrincipal() principal: Principal) {
    return this.finance.dashboard(principal);
  }

  @Get('facts')
  @RequirePermissions('finance:read')
  facts(@Query('order_id') orderId?: string) {
    return this.finance.listFacts(orderId);
  }

  @Get('ledger')
  @RequirePermissions('finance:read')
  ledger() {
    return this.finance.listJournals();
  }

  @Get('payables')
  @RequirePermissions('finance:read')
  payables(@Query('seller_org_id') sellerOrgId?: string) {
    return this.finance.listPayables(sellerOrgId);
  }

  @Get('settlement-lines')
  @RequirePermissions('finance:read')
  settlementLines(@Query('seller_org_id') sellerOrgId?: string) {
    return this.finance.listSettlementLines(sellerOrgId);
  }

  @Get('contribution/:orderId')
  @RequirePermissions('finance:read')
  contribution(@Param('orderId') orderId: string) {
    return this.finance.getContribution(orderId);
  }

  @Post('orders/:orderId/sync')
  @RequirePermissions('finance:post')
  sync(@Param('orderId') orderId: string) {
    return this.finance.syncOrder(orderId);
  }

  @Post('fees')
  @RequirePermissions('finance:post')
  fee(
    @Body()
    body: { payment_intent_id: string; amount_minor: string; currency: string; source_key: string },
  ) {
    return this.finance.recordGatewayFee({
      paymentIntentId: body.payment_intent_id,
      amountMinor: BigInt(body.amount_minor),
      currency: body.currency,
      sourceKey: body.source_key,
    });
  }

  @Post('payables/:id/transition')
  @RequirePermissions('finance:approve')
  payable(@Param('id') id: string, @Body() body: { status: VendorPayableStatus }) {
    return this.finance.transitionPayable(id, body.status);
  }

  @Post('affiliate/:orderId/approve')
  @RequirePermissions('finance:approve')
  affiliateApprove(@Param('orderId') orderId: string) {
    return this.finance.approveAffiliate(orderId);
  }

  @Post('affiliate/:orderId/reverse')
  @RequirePermissions('finance:approve')
  affiliateReverse(@Param('orderId') orderId: string) {
    return this.finance.reverseAffiliate(orderId);
  }

  @Post('settlements')
  @RequirePermissions('finance:settle')
  open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_id: string; currency: string },
  ) {
    return this.finance.openSettlement(principal, body.country_id, body.currency);
  }

  @Get('settlements/:id')
  @RequirePermissions('finance:read')
  batch(@Param('id') id: string) {
    return this.finance.getBatch(id);
  }

  @Post('settlements/:id/approve')
  @RequirePermissions('finance:approve')
  approveBatch(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.finance.approveSettlement(principal, id);
  }

  @Post('settlements/:id/payouts')
  @RequirePermissions('finance:settle')
  payout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { idempotency_key: string; scenario?: MockPayoutScenario },
  ) {
    return this.finance.submitPayout(principal, id, body.idempotency_key, body.scenario ?? 'SUCCESS');
  }

  @Post('payouts/:id/approve')
  @RequirePermissions('finance:approve')
  approvePayout(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.finance.approvePayout(principal, id);
  }

  @Post('payouts/:id/execute')
  @RequirePermissions('finance:settle')
  execute(@Param('id') id: string) {
    return this.finance.executePayout(id);
  }

  @Post('reconciliation/import')
  @RequirePermissions('finance:reconcile')
  recon() {
    return this.finance.importExistingRecon();
  }

  @Get('reconciliations')
  @RequirePermissions('finance:read')
  reconciliations(
    @Query('domain') domain?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.finance.listFinanceReconciliations({
      domain: domain as never,
      status: status as never,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('journals/:id/reverse')
  @RequirePermissions('finance:post')
  reverse(@Param('id') id: string) {
    return this.finance.reverseJournal(id);
  }

  @Post('settlement-imports')
  @RequirePermissions('finance:reconcile')
  importSettlement(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_id: string;
      country_iso2: string;
      provider_code: string;
      external_batch_ref: string;
      idempotency_key: string;
      currency: string;
      records?: Array<{
        external_record_ref: string;
        provider_payment_ref: string;
        amount_minor: string;
        fee_minor?: string;
        currency: string;
      }>;
      fetch_from_provider?: boolean;
    },
  ) {
    return this.settlementImports.importBatch(principal, {
      countryId: body.country_id,
      countryIso2: body.country_iso2,
      providerCode: body.provider_code,
      externalBatchRef: body.external_batch_ref,
      idempotencyKey: body.idempotency_key,
      currency: body.currency,
      fetchFromProvider: body.fetch_from_provider,
      records: body.records?.map((row) => ({
        externalRecordRef: row.external_record_ref,
        providerPaymentRef: row.provider_payment_ref,
        amountMinor: BigInt(row.amount_minor),
        feeMinor: row.fee_minor ? BigInt(row.fee_minor) : 0n,
        currency: row.currency,
      })),
    });
  }

  @Get('settlement-imports')
  @RequirePermissions('finance:read')
  listSettlementImports(
    @Query('country_id') countryId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settlementImports.listBatches({
      countryId,
      status: status as never,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('settlement-imports/:id')
  @RequirePermissions('finance:read')
  getSettlementImport(@Param('id') id: string) {
    return this.settlementImports.getBatch(id);
  }

  @Post('settlement-imports/:id/match')
  @RequirePermissions('finance:reconcile')
  matchSettlementImport(@Param('id') id: string) {
    return this.settlementImports.matchBatch(id);
  }

  @Post('settlement-imports/:id/retry')
  @RequirePermissions('finance:reconcile')
  retrySettlementImport(@Param('id') id: string) {
    return this.settlementImports.retryBatch(id);
  }

  @Get('settlement-import-worker/runs')
  @RequirePermissions('finance:read')
  listSettlementImportWorkerRuns(
    @CurrentPrincipal() principal: Principal,
    @Query('country_id') countryId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settlementImportWorker.listWorkerRuns(principal, {
      countryId,
      status: status as never,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('settlement-import-schedules')
  @RequirePermissions('finance:read')
  listSettlementImportSchedules(
    @CurrentPrincipal() principal: Principal,
    @Query('country_id') countryId?: string,
    @Query('enabled') enabled?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settlementImportSchedules.listSchedules(principal, {
      countryId,
      enabled: enabled === undefined ? undefined : enabled === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('settlement-import-schedules/:id')
  @RequirePermissions('finance:read')
  getSettlementImportSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.settlementImportSchedules.getSchedule(principal, id);
  }

  @Post('settlement-import-schedules')
  @RequirePermissions('finance:reconcile')
  createSettlementImportSchedule(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_id: string;
      provider_code: string;
      currency: string;
      enabled?: boolean;
    },
  ) {
    return this.settlementImportSchedules.createSchedule(principal, {
      countryId: body.country_id,
      providerCode: body.provider_code,
      currency: body.currency,
      enabled: body.enabled,
    });
  }

  @Patch('settlement-import-schedules/:id')
  @RequirePermissions('finance:reconcile')
  updateSettlementImportSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { currency?: string; enabled?: boolean },
  ) {
    return this.settlementImportSchedules.updateSchedule(principal, id, {
      currency: body.currency,
      enabled: body.enabled,
    });
  }

  @Get('breaks')
  @RequirePermissions('finance:read')
  listBreaks(
    @CurrentPrincipal() principal: Principal,
    @Query('workflow_status') workflowStatus?: string,
    @Query('domain') domain?: string,
    @Query('classification') classification?: string,
    @Query('country_id') countryId?: string,
    @Query('source_kind') sourceKind?: string,
    @Query('include_closed') includeClosed?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reconBreaks.listBreaks(principal, {
      workflowStatus: workflowStatus as never,
      domain: domain as never,
      classification,
      countryId,
      sourceKind: sourceKind as never,
      includeClosed: includeClosed === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('breaks/:id')
  @RequirePermissions('finance:read')
  getBreak(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.reconBreaks.getBreak(principal, id);
  }

  @Post('breaks/:id/investigate')
  @RequirePermissions('finance:reconcile')
  investigateBreak(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { idempotency_key: string; note?: string },
  ) {
    return this.reconBreaks.investigate(principal, id, body.idempotency_key, body.note);
  }

  @Post('breaks/:id/resolve')
  @RequirePermissions('finance:reconcile')
  resolveBreak(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { idempotency_key: string; note?: string },
  ) {
    return this.reconBreaks.resolve(principal, id, body.idempotency_key, body.note);
  }

  @Post('breaks/:id/close')
  @RequirePermissions('finance:reconcile')
  closeBreak(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { idempotency_key: string; note?: string },
  ) {
    return this.reconBreaks.close(principal, id, body.idempotency_key, body.note);
  }
}
