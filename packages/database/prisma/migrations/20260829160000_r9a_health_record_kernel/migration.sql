-- R9-A: health timeline + artifact access audit kernel

CREATE TYPE "HealthArtifactStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');
CREATE TYPE "HealthTimelineEventType" AS ENUM ('ARTIFACT_PUBLISHED', 'ARTIFACT_SUPERSEDED', 'CONSENT_GRANTED', 'CONSENT_REVOKED');
CREATE TYPE "HealthTimelineEventStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

ALTER TABLE "health_artifacts"
  ADD COLUMN IF NOT EXISTS "country_id" UUID,
  ADD COLUMN IF NOT EXISTS "status" "HealthArtifactStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "title" TEXT;

CREATE INDEX IF NOT EXISTS "health_artifacts_country_id_idx" ON "health_artifacts"("country_id");

ALTER TABLE "health_artifacts"
  ADD CONSTRAINT "health_artifacts_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "health_timeline_events" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "event_type" "HealthTimelineEventType" NOT NULL,
  "artifact_id" UUID,
  "artifact_type" "HealthArtifactType",
  "source_module" TEXT NOT NULL,
  "source_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "status" "HealthTimelineEventStatus" NOT NULL DEFAULT 'ACTIVE',
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "health_artifact_access_audits" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "actor_person_id" UUID NOT NULL,
  "patient_person_id" UUID NOT NULL,
  "doctor_partner_id" UUID,
  "organization_id" UUID,
  "purpose" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "request_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_artifact_access_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "health_timeline_events_person_id_occurred_at_idx"
  ON "health_timeline_events"("person_id", "occurred_at" DESC);
CREATE INDEX "health_timeline_events_artifact_id_idx" ON "health_timeline_events"("artifact_id");

CREATE UNIQUE INDEX "health_timeline_events_source_active_uidx"
  ON "health_timeline_events"("source_module", "source_id", "event_type")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "health_artifact_access_audits_patient_person_id_created_at_idx"
  ON "health_artifact_access_audits"("patient_person_id", "created_at");
CREATE INDEX "health_artifact_access_audits_doctor_partner_id_created_at_idx"
  ON "health_artifact_access_audits"("doctor_partner_id", "created_at");
CREATE INDEX "health_artifact_access_audits_artifact_id_created_at_idx"
  ON "health_artifact_access_audits"("artifact_id", "created_at");

ALTER TABLE "health_timeline_events"
  ADD CONSTRAINT "health_timeline_events_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_timeline_events"
  ADD CONSTRAINT "health_timeline_events_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_timeline_events"
  ADD CONSTRAINT "health_timeline_events_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "health_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "health_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_patient_person_id_fkey"
  FOREIGN KEY ("patient_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_doctor_partner_id_fkey"
  FOREIGN KEY ("doctor_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "health_artifact_access_audits"
  ADD CONSTRAINT "health_artifact_access_audits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "health_timeline_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_timeline_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY health_timeline_events_select ON "health_timeline_events" FOR SELECT TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR app.is_platform()
  );

CREATE POLICY health_timeline_events_insert ON "health_timeline_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
  );

CREATE POLICY health_timeline_events_update ON "health_timeline_events" FOR UPDATE TO worldpharma_app
  USING (app.is_worker() OR app.is_platform())
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY health_timeline_events_no_delete ON "health_timeline_events" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "health_artifact_access_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_artifact_access_audits" FORCE ROW LEVEL SECURITY;

CREATE POLICY health_artifact_access_audits_select ON "health_artifact_access_audits" FOR SELECT TO worldpharma_app
  USING (
    app.can_person("patient_person_id")
    OR app.can_person("actor_person_id")
    OR app.is_platform()
  );

CREATE POLICY health_artifact_access_audits_insert ON "health_artifact_access_audits" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.actor_present()
    AND (
      app.can_person("actor_person_id")
      OR app.is_worker()
      OR app.is_platform()
    )
  );

CREATE POLICY health_artifact_access_audits_no_update ON "health_artifact_access_audits" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY health_artifact_access_audits_no_delete ON "health_artifact_access_audits" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "health_timeline_events" TO worldpharma_app;
GRANT SELECT, INSERT ON "health_artifact_access_audits" TO worldpharma_app;
