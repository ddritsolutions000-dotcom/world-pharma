-- R12-G: crm_automation_runs append-only idempotent marketing automation log

CREATE TYPE "CrmAutomationKind" AS ENUM ('REORDER_REMINDER', 'REFILL_STATUS_NUDGE', 'SUBSCRIPTION_REMINDER');
CREATE TYPE "CrmAutomationRunStatus" AS ENUM ('SENT', 'SKIPPED');

CREATE TABLE "crm_automation_runs" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "automation_kind" "CrmAutomationKind" NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "CrmAutomationRunStatus" NOT NULL,
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_automation_runs_automation_kind_source_id_person_id_key" ON "crm_automation_runs"("automation_kind", "source_id", "person_id");
CREATE INDEX "crm_automation_runs_country_id_created_at_idx" ON "crm_automation_runs"("country_id", "created_at");
CREATE INDEX "crm_automation_runs_person_id_created_at_idx" ON "crm_automation_runs"("person_id", "created_at");

ALTER TABLE "crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
