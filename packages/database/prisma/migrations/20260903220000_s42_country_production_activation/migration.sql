-- Sprint 42: country production lifecycle + evidence audit + PARTNER readiness dimension

CREATE TYPE "CountryProductionLifecycle" AS ENUM (
  'CONFIGURED',
  'UNDER_REVIEW',
  'READY_FOR_ACTIVATION',
  'ACTIVE',
  'SUSPENDED'
);

ALTER TABLE "countries"
  ADD COLUMN "production_lifecycle" "CountryProductionLifecycle" NOT NULL DEFAULT 'CONFIGURED',
  ADD COLUMN "production_activated_at" TIMESTAMPTZ,
  ADD COLUMN "production_activated_by_id" UUID,
  ADD COLUMN "production_suspended_at" TIMESTAMPTZ,
  ADD COLUMN "production_suspended_by_id" UUID,
  ADD COLUMN "production_suspend_reason" TEXT;

CREATE INDEX "countries_production_lifecycle_idx" ON "countries"("production_lifecycle");

ALTER TYPE "CountryReadinessDimension" ADD VALUE 'PARTNER';

CREATE TABLE "regulatory_evidence_events" (
    "id"          UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "country_id"  UUID NOT NULL,
    "action"      TEXT NOT NULL,
    "from_status" TEXT,
    "to_status"   TEXT,
    "actor_id"    UUID,
    "reason"      TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "regulatory_evidence_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "regulatory_evidence_events_evidence_id_created_at_idx"
  ON "regulatory_evidence_events"("evidence_id", "created_at");
CREATE INDEX "regulatory_evidence_events_country_id_created_at_idx"
  ON "regulatory_evidence_events"("country_id", "created_at");
ALTER TABLE "regulatory_evidence_events"
  ADD CONSTRAINT "regulatory_evidence_events_evidence_id_fkey"
  FOREIGN KEY ("evidence_id") REFERENCES "regulatory_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_evidence_events"
  ADD CONSTRAINT "regulatory_evidence_events_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
