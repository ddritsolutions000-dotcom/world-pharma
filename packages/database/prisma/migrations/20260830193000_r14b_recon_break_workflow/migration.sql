-- R14-B CR-287: finance reconciliation break workflow

CREATE TYPE "FinanceReconWorkflowStatus" AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE "FinanceReconSourceKind" AS ENUM (
  'SETTLEMENT_IMPORT',
  'PAYOUT',
  'PSP',
  'CARRIER',
  'MANUAL'
);

ALTER TABLE "finance_reconciliations"
  ADD COLUMN "workflow_status" "FinanceReconWorkflowStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "classification" TEXT,
  ADD COLUMN "source_kind" "FinanceReconSourceKind",
  ADD COLUMN "source_ref" UUID,
  ADD COLUMN "country_id" UUID,
  ADD COLUMN "investigated_by" UUID,
  ADD COLUMN "investigated_at" TIMESTAMPTZ,
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "resolved_by" UUID,
  ADD COLUMN "resolved_at" TIMESTAMPTZ,
  ADD COLUMN "close_note" TEXT,
  ADD COLUMN "closed_by" UUID,
  ADD COLUMN "closed_at" TIMESTAMPTZ,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "finance_reconciliations_country_workflow_created_idx"
  ON "finance_reconciliations"("country_id", "workflow_status", "created_at");

CREATE INDEX "finance_reconciliations_source_kind_ref_idx"
  ON "finance_reconciliations"("source_kind", "source_ref");

ALTER TABLE "finance_reconciliations"
  ADD CONSTRAINT "finance_reconciliations_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "finance_recon_break_actions" (
  "id" UUID NOT NULL,
  "recon_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actor_person_id" UUID,
  "note" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_recon_break_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_recon_break_actions_idempotency_key_key"
  ON "finance_recon_break_actions"("idempotency_key");

CREATE INDEX "finance_recon_break_actions_recon_action_idx"
  ON "finance_recon_break_actions"("recon_id", "action");

ALTER TABLE "finance_recon_break_actions"
  ADD CONSTRAINT "finance_recon_break_actions_recon_id_fkey"
  FOREIGN KEY ("recon_id") REFERENCES "finance_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
