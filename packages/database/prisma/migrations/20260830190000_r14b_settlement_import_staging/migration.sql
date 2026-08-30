-- R14-B CR-285: PSP settlement import staging (provider-neutral)

CREATE TYPE "SettlementImportBatchStatus" AS ENUM (
  'RECEIVED',
  'NORMALIZED',
  'MATCHING',
  'COMPLETED',
  'PARTIAL',
  'FAILED'
);

CREATE TYPE "SettlementImportRecordStatus" AS ENUM (
  'STAGED',
  'INVALID',
  'MATCHED',
  'PARTIAL',
  'UNMATCHED',
  'DUPLICATE',
  'POSTED',
  'FAILED'
);

CREATE TYPE "SettlementMatchClassification" AS ENUM (
  'MATCH',
  'PARTIAL',
  'UNMATCHED',
  'DUPLICATE',
  'INVALID'
);

CREATE TABLE "settlement_import_batches" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "provider_code" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "external_batch_ref" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" "SettlementImportBatchStatus" NOT NULL DEFAULT 'RECEIVED',
  "currency" CHAR(3) NOT NULL,
  "record_count" INTEGER NOT NULL DEFAULT 0,
  "matched_count" INTEGER NOT NULL DEFAULT 0,
  "error_detail" TEXT,
  "transient_failure" BOOLEAN NOT NULL DEFAULT false,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ,
  CONSTRAINT "settlement_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_import_batches_idempotency_key_key"
  ON "settlement_import_batches"("idempotency_key");
CREATE UNIQUE INDEX "settlement_import_batches_provider_env_batch_key"
  ON "settlement_import_batches"("provider_code", "environment", "external_batch_ref");
CREATE INDEX "settlement_import_batches_country_status_created_idx"
  ON "settlement_import_batches"("country_id", "status", "created_at");

CREATE TABLE "settlement_import_records" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "provider_code" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "external_record_ref" TEXT NOT NULL,
  "provider_payment_ref" TEXT,
  "payment_intent_id" UUID,
  "amount_minor" BIGINT NOT NULL,
  "fee_minor" BIGINT NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL,
  "classification" "SettlementMatchClassification",
  "status" "SettlementImportRecordStatus" NOT NULL DEFAULT 'STAGED',
  "journal_source_key" TEXT,
  "finance_recon_id" UUID,
  "error_detail" TEXT,
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_import_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_import_records_batch_record_key"
  ON "settlement_import_records"("batch_id", "external_record_ref");
CREATE UNIQUE INDEX "settlement_import_records_provider_env_record_key"
  ON "settlement_import_records"("provider_code", "environment", "external_record_ref");
CREATE UNIQUE INDEX "settlement_import_records_journal_source_key_key"
  ON "settlement_import_records"("journal_source_key");
CREATE INDEX "settlement_import_records_country_status_created_idx"
  ON "settlement_import_records"("country_id", "status", "created_at");
CREATE INDEX "settlement_import_records_payment_intent_id_idx"
  ON "settlement_import_records"("payment_intent_id");

ALTER TABLE "settlement_import_batches"
  ADD CONSTRAINT "settlement_import_batches_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_import_records"
  ADD CONSTRAINT "settlement_import_records_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "settlement_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settlement_import_records"
  ADD CONSTRAINT "settlement_import_records_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
