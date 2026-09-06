-- Shared partner wallet (lab / affiliate / delivery / …)

CREATE TYPE "PartnerWalletLedgerKind" AS ENUM (
  'EARNING_CREDIT',
  'WITHDRAW_HOLD',
  'WITHDRAW_PAID',
  'WITHDRAW_RELEASE',
  'ADJUSTMENT'
);

CREATE TYPE "PartnerWithdrawStatus" AS ENUM (
  'REQUESTED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "PartnerPayoutMethod" AS ENUM ('BANK', 'UPI');

CREATE TABLE "partner_wallets" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "organization_id" UUID,
  "country_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "available_minor" BIGINT NOT NULL DEFAULT 0,
  "held_minor" BIGINT NOT NULL DEFAULT 0,
  "lifetime_earned_minor" BIGINT NOT NULL DEFAULT 0,
  "lifetime_withdrawn_minor" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "partner_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_wallets_partner_id_key" ON "partner_wallets"("partner_id");
CREATE INDEX "partner_wallets_person_id_idx" ON "partner_wallets"("person_id");
CREATE INDEX "partner_wallets_organization_id_idx" ON "partner_wallets"("organization_id");

ALTER TABLE "partner_wallets"
  ADD CONSTRAINT "partner_wallets_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_wallet_ledger_entries" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "kind" "PartnerWalletLedgerKind" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "balance_after_minor" BIGINT NOT NULL,
  "source" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_wallet_ledger_entries_source_source_key_kind_key"
  ON "partner_wallet_ledger_entries"("source", "source_key", "kind");
CREATE INDEX "partner_wallet_ledger_entries_wallet_id_created_at_idx"
  ON "partner_wallet_ledger_entries"("wallet_id", "created_at");

ALTER TABLE "partner_wallet_ledger_entries"
  ADD CONSTRAINT "partner_wallet_ledger_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "partner_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_payout_accounts" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "method" "PartnerPayoutMethod" NOT NULL DEFAULT 'BANK',
  "account_holder_name" TEXT NOT NULL,
  "bank_name" TEXT,
  "account_number_masked" TEXT,
  "ifsc_or_routing" TEXT,
  "upi_id_masked" TEXT,
  "verified_sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "partner_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_payout_accounts_wallet_id_key" ON "partner_payout_accounts"("wallet_id");

ALTER TABLE "partner_payout_accounts"
  ADD CONSTRAINT "partner_payout_accounts_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "partner_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_withdraw_requests" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PartnerWithdrawStatus" NOT NULL DEFAULT 'REQUESTED',
  "destination_hint" TEXT,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "live_payout" BOOLEAN NOT NULL DEFAULT false,
  "provider_ref" TEXT,
  "failure_code" TEXT,
  "requested_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "paid_at" TIMESTAMPTZ,
  CONSTRAINT "partner_withdraw_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_withdraw_requests_wallet_id_created_at_idx"
  ON "partner_withdraw_requests"("wallet_id", "created_at");

ALTER TABLE "partner_withdraw_requests"
  ADD CONSTRAINT "partner_withdraw_requests_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "partner_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "partner_wallets" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "partner_wallet_ledger_entries" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "partner_payout_accounts" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "partner_withdraw_requests" TO worldpharma_app;
