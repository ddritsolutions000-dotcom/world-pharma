-- R7-C: Lab sample + append-only CoC + SAMPLE_COLLECTION job linkage.
-- Additive only. No accession/pathology. No USING(true).

CREATE TYPE "LabSampleCocStatus" AS ENUM (
  'ASSIGNED',
  'ACCEPTED',
  'ARRIVED',
  'VERIFIED',
  'COLLECTED',
  'SEALED',
  'HANDED_OVER',
  'REJECTED',
  'DAMAGED',
  'LOST',
  'TEMPERATURE_EXCEPTION',
  'INSUFFICIENT_SAMPLE',
  'WRONG_SAMPLE',
  'RECOLLECTION_REQUIRED'
);

CREATE TABLE "lab_samples" (
    "id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "status" "LabSampleCocStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignee_person_id" UUID,
    "container_barcode" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lab_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_sample_coc_events" (
    "id" UUID NOT NULL,
    "lab_sample_id" UUID NOT NULL,
    "from_status" "LabSampleCocStatus",
    "to_status" "LabSampleCocStatus" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "action_code" TEXT NOT NULL,
    "source_kind" TEXT,
    "destination_kind" TEXT,
    "metadata" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_sample_coc_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_samples_lab_booking_id_key" ON "lab_samples"("lab_booking_id");
CREATE UNIQUE INDEX "lab_samples_container_barcode_key" ON "lab_samples"("container_barcode");
CREATE INDEX "lab_samples_lab_org_id_status_idx" ON "lab_samples"("lab_org_id", "status");
CREATE INDEX "lab_samples_country_id_status_idx" ON "lab_samples"("country_id", "status");
CREATE INDEX "lab_samples_assignee_person_id_status_idx" ON "lab_samples"("assignee_person_id", "status");
CREATE UNIQUE INDEX "lab_sample_coc_events_idempotency_key_key" ON "lab_sample_coc_events"("idempotency_key");
CREATE INDEX "lab_sample_coc_events_lab_sample_id_created_at_idx" ON "lab_sample_coc_events"("lab_sample_id", "created_at");

ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_lab_booking_id_fkey"
  FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_lab_org_id_fkey"
  FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_assignee_person_id_fkey"
  FOREIGN KEY ("assignee_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_sample_coc_events" ADD CONSTRAINT "lab_sample_coc_events_lab_sample_id_fkey"
  FOREIGN KEY ("lab_sample_id") REFERENCES "lab_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_sample_coc_events" ADD CONSTRAINT "lab_sample_coc_events_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "logistics_jobs" ADD COLUMN "lab_sample_id" UUID;
CREATE UNIQUE INDEX "logistics_jobs_lab_sample_id_key" ON "logistics_jobs"("lab_sample_id");
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_lab_sample_id_fkey"
  FOREIGN KEY ("lab_sample_id") REFERENCES "lab_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_samples" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_samples" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_sample_coc_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_sample_coc_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY lab_samples_access ON "lab_samples" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person(
      (SELECT b.customer_person_id FROM lab_bookings b WHERE b.id = lab_samples.lab_booking_id)
    )
    OR app.can_org("lab_org_id")
    OR ("assignee_person_id" IS NOT NULL AND app.can_person("assignee_person_id"))
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("lab_org_id")
    OR ("assignee_person_id" IS NOT NULL AND app.can_person("assignee_person_id"))
  );

CREATE POLICY lab_sample_coc_events_select ON "lab_sample_coc_events" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM lab_samples s
      JOIN lab_bookings b ON b.id = s.lab_booking_id
      WHERE s.id = lab_sample_coc_events.lab_sample_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(s.lab_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  );

CREATE POLICY lab_sample_coc_events_insert ON "lab_sample_coc_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_samples s
      WHERE s.id = lab_sample_coc_events.lab_sample_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.write_org(s.lab_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id) AND s.assignee_person_id = app.person_id())
        )
    )
  );

-- CoC events are append-only: no UPDATE/DELETE policies for worldpharma_app.

GRANT SELECT, INSERT, UPDATE, DELETE ON "lab_samples" TO worldpharma_app;
GRANT SELECT, INSERT ON "lab_sample_coc_events" TO worldpharma_app;
