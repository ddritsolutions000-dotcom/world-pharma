-- R7-D: transport CoC extension, accession, processing. Additive only.

ALTER TYPE "LabSampleCocStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "LabSampleCocStatus" ADD VALUE IF NOT EXISTS 'LAB_RECEIVED';
ALTER TYPE "LabSampleCocStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_BY_LAB';
ALTER TYPE "LabSampleCocStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

CREATE TYPE "LabProcessingStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ON_HOLD');

DROP INDEX IF EXISTS "logistics_jobs_lab_sample_id_key";
CREATE UNIQUE INDEX "logistics_jobs_lab_sample_id_job_type_key" ON "logistics_jobs"("lab_sample_id", "job_type")
  WHERE "lab_sample_id" IS NOT NULL;

CREATE TABLE "lab_accessions" (
    "id" UUID NOT NULL,
    "lab_sample_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "accession_number" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lab_accessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_processing" (
    "id" UUID NOT NULL,
    "lab_accession_id" UUID NOT NULL,
    "lab_sample_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "status" "LabProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lab_processing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_accessions_lab_sample_id_key" ON "lab_accessions"("lab_sample_id");
CREATE UNIQUE INDEX "lab_accessions_accession_number_key" ON "lab_accessions"("accession_number");
CREATE INDEX "lab_accessions_lab_org_id_created_at_idx" ON "lab_accessions"("lab_org_id", "created_at");
CREATE UNIQUE INDEX "lab_processing_lab_accession_id_key" ON "lab_processing"("lab_accession_id");
CREATE UNIQUE INDEX "lab_processing_lab_sample_id_key" ON "lab_processing"("lab_sample_id");
CREATE INDEX "lab_processing_lab_org_id_status_idx" ON "lab_processing"("lab_org_id", "status");

ALTER TABLE "lab_accessions" ADD CONSTRAINT "lab_accessions_lab_sample_id_fkey"
  FOREIGN KEY ("lab_sample_id") REFERENCES "lab_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_accessions" ADD CONSTRAINT "lab_accessions_lab_org_id_fkey"
  FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_accessions" ADD CONSTRAINT "lab_accessions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_processing" ADD CONSTRAINT "lab_processing_lab_accession_id_fkey"
  FOREIGN KEY ("lab_accession_id") REFERENCES "lab_accessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_processing" ADD CONSTRAINT "lab_processing_lab_sample_id_fkey"
  FOREIGN KEY ("lab_sample_id") REFERENCES "lab_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_processing" ADD CONSTRAINT "lab_processing_lab_org_id_fkey"
  FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_accessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_accessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_processing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_processing" FORCE ROW LEVEL SECURITY;

CREATE POLICY lab_accessions_access ON "lab_accessions" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("lab_org_id")
    OR EXISTS (
      SELECT 1 FROM lab_samples s
      JOIN lab_bookings b ON b.id = s.lab_booking_id
      WHERE s.id = lab_accessions.lab_sample_id
        AND app.can_person(b.customer_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("lab_org_id")
  );

CREATE POLICY lab_processing_access ON "lab_processing" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("lab_org_id")
    OR EXISTS (
      SELECT 1 FROM lab_samples s
      JOIN lab_bookings b ON b.id = s.lab_booking_id
      WHERE s.id = lab_processing.lab_sample_id
        AND app.can_person(b.customer_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("lab_org_id")
  );

GRANT SELECT, INSERT, UPDATE ON "lab_accessions" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "lab_processing" TO worldpharma_app;

-- SAMPLE_TRANSPORT jobs: riders + lab org staff visibility (extends logistics_jobs_access).
DROP POLICY IF EXISTS logistics_jobs_access ON logistics_jobs;

CREATE POLICY logistics_jobs_access ON logistics_jobs TO worldpharma_app
  USING (
    app.is_worker() OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = logistics_jobs.shipment_id
        AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id))
    )
    OR (
      "job_type" = 'SAMPLE_COLLECTION'
      AND "lab_sample_id" IS NOT NULL
      AND (
        app.is_worker()
        OR (
          app.person_id() IS NOT NULL
          AND ("assignee_id" IS NULL OR "assignee_id" = app.person_id())
          AND EXISTS (
            SELECT 1 FROM lab_samples s
            WHERE s.id = logistics_jobs.lab_sample_id
              AND (
                app.can_org(s.lab_org_id)
                OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
              )
          )
        )
      )
    )
    OR (
      "job_type" = 'SAMPLE_TRANSPORT'
      AND "lab_sample_id" IS NOT NULL
      AND (
        app.is_worker()
        OR (
          app.person_id() IS NOT NULL
          AND ("assignee_id" IS NULL OR "assignee_id" = app.person_id())
        )
        OR EXISTS (
          SELECT 1 FROM lab_samples s
          WHERE s.id = logistics_jobs.lab_sample_id
            AND app.can_org(s.lab_org_id)
        )
      )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = logistics_jobs.shipment_id
        AND app.write_org(s.seller_org_id)
    )
    OR (
      "job_type" = 'SAMPLE_COLLECTION'
      AND "lab_sample_id" IS NOT NULL
      AND app.person_id() IS NOT NULL
      AND "assignee_id" = app.person_id()
    )
    OR (
      "job_type" = 'SAMPLE_TRANSPORT'
      AND "lab_sample_id" IS NOT NULL
      AND app.person_id() IS NOT NULL
      AND "assignee_id" = app.person_id()
    )
  );
