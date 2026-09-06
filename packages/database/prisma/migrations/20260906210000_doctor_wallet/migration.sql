-- Doctor wallet: consult earnings credit + doctor-initiated sandbox withdraw

CREATE TYPE "DoctorWalletLedgerKind" AS ENUM (
  'CONSULT_CREDIT',
  'WITHDRAW_HOLD',
  'WITHDRAW_PAID',
  'WITHDRAW_RELEASE',
  'ADJUSTMENT'
);

CREATE TYPE "DoctorWithdrawStatus" AS ENUM (
  'REQUESTED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "doctor_wallets" (
  "id" UUID NOT NULL,
  "doctor_profile_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "available_minor" BIGINT NOT NULL DEFAULT 0,
  "held_minor" BIGINT NOT NULL DEFAULT 0,
  "lifetime_earned_minor" BIGINT NOT NULL DEFAULT 0,
  "lifetime_withdrawn_minor" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "doctor_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_wallets_doctor_profile_id_key" ON "doctor_wallets"("doctor_profile_id");
CREATE INDEX "doctor_wallets_person_id_idx" ON "doctor_wallets"("person_id");

ALTER TABLE "doctor_wallets"
  ADD CONSTRAINT "doctor_wallets_doctor_profile_id_fkey"
  FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_wallets"
  ADD CONSTRAINT "doctor_wallets_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_wallets"
  ADD CONSTRAINT "doctor_wallets_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "doctor_wallet_ledger_entries" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "kind" "DoctorWalletLedgerKind" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "balance_after_minor" BIGINT NOT NULL,
  "source" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "appointment_id" UUID,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doctor_wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_wallet_ledger_entries_source_source_key_kind_key"
  ON "doctor_wallet_ledger_entries"("source", "source_key", "kind");
CREATE INDEX "doctor_wallet_ledger_entries_wallet_id_created_at_idx"
  ON "doctor_wallet_ledger_entries"("wallet_id", "created_at");

ALTER TABLE "doctor_wallet_ledger_entries"
  ADD CONSTRAINT "doctor_wallet_ledger_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "doctor_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "doctor_withdraw_requests" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "DoctorWithdrawStatus" NOT NULL DEFAULT 'REQUESTED',
  "destination_hint" TEXT,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "live_payout" BOOLEAN NOT NULL DEFAULT false,
  "provider_ref" TEXT,
  "failure_code" TEXT,
  "requested_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "paid_at" TIMESTAMPTZ,
  CONSTRAINT "doctor_withdraw_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "doctor_withdraw_requests_wallet_id_created_at_idx"
  ON "doctor_withdraw_requests"("wallet_id", "created_at");

ALTER TABLE "doctor_withdraw_requests"
  ADD CONSTRAINT "doctor_withdraw_requests_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "doctor_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
