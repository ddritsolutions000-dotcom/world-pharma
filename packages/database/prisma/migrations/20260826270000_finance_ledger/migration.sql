-- Phase 1G sandbox ledger. Additive. No live payout / PSP / DHL.

CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','COGS');
CREATE TYPE "DebitCredit" AS ENUM ('DEBIT','CREDIT');
CREATE TYPE "JournalStatus" AS ENUM ('POSTED');
CREATE TYPE "FinancialFactKind" AS ENUM ('CAPTURE','REFUND','GATEWAY_FEE','VENDOR_PAYABLE','COGS','PROMO_PLATFORM','PROMO_VENDOR','AFFILIATE','TAX','SHIPPING_CHARGE','SHIPPING_SUBSIDY','CARRIER_QUOTED','CARRIER_ACTUAL','ADJUSTMENT');
CREATE TYPE "VendorPayableStatus" AS ENUM ('PENDING','ELIGIBLE','ON_HOLD','APPROVED','SCHEDULED','PAID','REVERSED');
CREATE TYPE "AffiliateLiabilityStatus" AS ENUM ('PENDING','APPROVED','PAYABLE','PAID','REVERSED');
CREATE TYPE "SettlementBatchStatus" AS ENUM ('OPEN','PREVIEW','APPROVED','EXECUTED','CANCELLED');
CREATE TYPE "PayoutStatus" AS ENUM ('CREATED','APPROVED','SUBMITTED','PROCESSING','PAID','FAILED','UNKNOWN','REVERSED');
CREATE TYPE "ContributionStatus" AS ENUM ('PROVISIONAL','COMPLETE','BLOCKED_UNKNOWN');
CREATE TYPE "FinanceReconDomain" AS ENUM ('PSP','CARRIER','VENDOR_SETTLEMENT','AFFILIATE','PAYOUT');
CREATE TYPE "FinanceReconStatus" AS ENUM ('MATCHED','BREAK','INVESTIGATE');
CREATE TYPE "FinanceApprovalKind" AS ENUM ('PAYOUT','SETTLEMENT','JOURNAL_REVERSE');

CREATE TABLE "ledger_accounts" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_accounts_country_id_code_key" ON "ledger_accounts"("country_id","code");

CREATE TABLE "journals" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "source_event_id" TEXT NOT NULL,
  "posting_rule_id" TEXT NOT NULL,
  "reverses_journal_id" UUID,
  "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
  "currency" CHAR(3) NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "journals_source_event_id_posting_rule_id_key" ON "journals"("source_event_id","posting_rule_id");
CREATE INDEX "journals_country_id_created_at_idx" ON "journals"("country_id","created_at");

CREATE TABLE "journal_lines" (
  "id" UUID NOT NULL,
  "journal_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "dc" "DebitCredit" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "fx_snapshot_id" UUID,
  "amount_accounting_minor" BIGINT,
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines"("journal_id");

CREATE TABLE "financial_facts" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "order_id" UUID,
  "payment_intent_id" UUID,
  "shipment_id" UUID,
  "kind" "FinancialFactKind" NOT NULL,
  "amount_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  "fx_snapshot_id" UUID,
  "source_key" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_facts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_facts_source_key_key" ON "financial_facts"("source_key");
CREATE INDEX "financial_facts_order_id_kind_idx" ON "financial_facts"("order_id","kind");
CREATE INDEX "financial_facts_country_id_created_at_idx" ON "financial_facts"("country_id","created_at");

CREATE TABLE "vendor_payables" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "seller_org_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "VendorPayableStatus" NOT NULL DEFAULT 'PENDING',
  "take_bps_frozen" INTEGER NOT NULL DEFAULT 0,
  "take_flat_frozen" BIGINT NOT NULL DEFAULT 0,
  "commercial_rule_id" UUID,
  "hold_until" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_payables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_payables_order_id_key" ON "vendor_payables"("order_id");
CREATE INDEX "vendor_payables_seller_org_id_status_idx" ON "vendor_payables"("seller_org_id","status");
CREATE INDEX "vendor_payables_country_id_status_idx" ON "vendor_payables"("country_id","status");

CREATE TABLE "affiliate_liabilities" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "AffiliateLiabilityStatus" NOT NULL DEFAULT 'PENDING',
  "clinical_blocked" BOOLEAN NOT NULL DEFAULT true,
  "affiliate_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_liabilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "affiliate_liabilities_order_id_key" ON "affiliate_liabilities"("order_id");

CREATE TABLE "settlement_policies" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "hold_days" INTEGER NOT NULL DEFAULT 0,
  "dual_control" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "settlement_policies_country_id_key" ON "settlement_policies"("country_id");

CREATE TABLE "settlement_periods" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "settlement_periods_country_id_starts_at_idx" ON "settlement_periods"("country_id","starts_at");

CREATE TABLE "settlement_batches" (
  "id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "status" "SettlementBatchStatus" NOT NULL DEFAULT 'OPEN',
  "currency" CHAR(3) NOT NULL,
  "created_by" UUID,
  "approved_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlement_lines" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "seller_org_id" UUID NOT NULL,
  "vendor_payable_id" UUID NOT NULL,
  "gross_minor" BIGINT NOT NULL,
  "refund_minor" BIGINT NOT NULL DEFAULT 0,
  "fee_minor" BIGINT NOT NULL DEFAULT 0,
  "net_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "settlement_lines_batch_id_vendor_payable_id_key" ON "settlement_lines"("batch_id","vendor_payable_id");

CREATE TABLE "payouts" (
  "id" UUID NOT NULL,
  "batch_id" UUID,
  "kind" TEXT NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'CREATED',
  "idempotency_key" TEXT NOT NULL,
  "provider_ref" TEXT,
  "scenario" TEXT NOT NULL DEFAULT 'SUCCESS',
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "approved_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payouts_idempotency_key_key" ON "payouts"("idempotency_key");
CREATE UNIQUE INDEX "payouts_provider_ref_key" ON "payouts"("provider_ref");
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status","created_at");

CREATE TABLE "contribution_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "gmv_minor" BIGINT NOT NULL,
  "gross_revenue_minor" BIGINT NOT NULL,
  "net_revenue_minor" BIGINT NOT NULL,
  "cogs_minor" BIGINT,
  "vendor_cost_minor" BIGINT,
  "gateway_fee_minor" BIGINT,
  "promo_cost_minor" BIGINT NOT NULL DEFAULT 0,
  "affiliate_cost_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "shipping_revenue_minor" BIGINT NOT NULL DEFAULT 0,
  "shipping_subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "actual_carrier_cost_minor" BIGINT,
  "refunds_minor" BIGINT NOT NULL DEFAULT 0,
  "adjustments_minor" BIGINT NOT NULL DEFAULT 0,
  "contribution_minor" BIGINT,
  "contribution_bps" INTEGER,
  "status" "ContributionStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contribution_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contribution_snapshots_order_id_key" ON "contribution_snapshots"("order_id");

CREATE TABLE "finance_reconciliations" (
  "id" UUID NOT NULL,
  "domain" "FinanceReconDomain" NOT NULL,
  "status" "FinanceReconStatus" NOT NULL DEFAULT 'INVESTIGATE',
  "break_type" TEXT NOT NULL,
  "internal_ref" TEXT,
  "external_ref" TEXT,
  "amount_minor" BIGINT,
  "currency" CHAR(3),
  "detail" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_reconciliations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "finance_reconciliations_domain_status_created_at_idx" ON "finance_reconciliations"("domain","status","created_at");

CREATE TABLE "finance_approvals" (
  "id" UUID NOT NULL,
  "kind" "FinanceApprovalKind" NOT NULL,
  "target_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "approved_by" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ,
  CONSTRAINT "finance_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "finance_approvals_kind_target_id_idx" ON "finance_approvals"("kind","target_id");

ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journals" ADD CONSTRAINT "journals_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journals" ADD CONSTRAINT "journals_reverses_journal_id_fkey" FOREIGN KEY ("reverses_journal_id") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_liabilities" ADD CONSTRAINT "affiliate_liabilities_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_policies" ADD CONSTRAINT "settlement_policies_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_periods" ADD CONSTRAINT "settlement_periods_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "settlement_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settlement_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_vendor_payable_id_fkey" FOREIGN KEY ("vendor_payable_id") REFERENCES "vendor_payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contribution_snapshots" ADD CONSTRAINT "contribution_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_accounts_app_all" ON "ledger_accounts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "journals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journals_app_all" ON "journals" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_lines_app_all" ON "journal_lines" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "financial_facts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial_facts_app_all" ON "financial_facts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "vendor_payables" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_payables_app_all" ON "vendor_payables" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "affiliate_liabilities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_liabilities_app_all" ON "affiliate_liabilities" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "settlement_policies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_policies_app_all" ON "settlement_policies" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "settlement_periods" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_periods_app_all" ON "settlement_periods" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "settlement_batches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_batches_app_all" ON "settlement_batches" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "settlement_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_lines_app_all" ON "settlement_lines" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_app_all" ON "payouts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "contribution_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contribution_snapshots_app_all" ON "contribution_snapshots" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "finance_reconciliations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_reconciliations_app_all" ON "finance_reconciliations" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "finance_approvals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_approvals_app_all" ON "finance_approvals" FOR ALL USING (true) WITH CHECK (true);
