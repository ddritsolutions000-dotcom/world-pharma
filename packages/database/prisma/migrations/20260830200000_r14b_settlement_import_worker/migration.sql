-- R14-B CR-288: scheduled settlement import worker schedules + run tracking

CREATE TYPE "SettlementImportSource" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TYPE "SettlementImportWorkerRunStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED_TRANSIENT',
  'FAILED_PERMANENT',
  'SKIPPED'
);

CREATE TABLE "settlement_import_schedules" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "provider_code" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_import_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_import_schedules_country_provider_key"
  ON "settlement_import_schedules"("country_id", "provider_code");

ALTER TABLE "settlement_import_schedules"
  ADD CONSTRAINT "settlement_import_schedules_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "settlement_import_worker_runs" (
  "id" UUID NOT NULL,
  "schedule_id" UUID,
  "country_id" UUID NOT NULL,
  "provider_code" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "external_batch_ref" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" "SettlementImportWorkerRunStatus" NOT NULL DEFAULT 'PENDING',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 3,
  "failure_classification" TEXT,
  "last_error_code" TEXT,
  "error_detail" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "next_retry_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_import_worker_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settlement_import_worker_runs_idempotency_key_key"
  ON "settlement_import_worker_runs"("idempotency_key");

CREATE INDEX "settlement_import_worker_runs_status_next_retry_idx"
  ON "settlement_import_worker_runs"("status", "next_retry_at");

CREATE INDEX "settlement_import_worker_runs_country_created_idx"
  ON "settlement_import_worker_runs"("country_id", "created_at");

ALTER TABLE "settlement_import_worker_runs"
  ADD CONSTRAINT "settlement_import_worker_runs_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "settlement_import_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlement_import_worker_runs"
  ADD CONSTRAINT "settlement_import_worker_runs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_import_batches"
  ADD COLUMN "import_source" "SettlementImportSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "worker_run_id" UUID;

CREATE INDEX "settlement_import_batches_import_source_created_idx"
  ON "settlement_import_batches"("import_source", "created_at");

ALTER TABLE "settlement_import_batches"
  ADD CONSTRAINT "settlement_import_batches_worker_run_id_fkey"
  FOREIGN KEY ("worker_run_id") REFERENCES "settlement_import_worker_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlement_import_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_import_schedules" FORCE ROW LEVEL SECURITY;

ALTER TABLE "settlement_import_worker_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_import_worker_runs" FORCE ROW LEVEL SECURITY;

CREATE POLICY settlement_import_schedules_access ON settlement_import_schedules TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY settlement_import_worker_runs_access ON settlement_import_worker_runs TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

GRANT SELECT, INSERT, UPDATE, DELETE ON settlement_import_schedules TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON settlement_import_worker_runs TO worldpharma_app;
