-- R8-C: ImagingStudy + sandbox acquisition metadata. No DICOM/PACS/report tables.
-- Additive only. No USING(true).

CREATE TYPE "ImagingStudyStatus" AS ENUM (
  'SCHEDULED',
  'CHECKED_IN',
  'ACQUISITION_IN_PROGRESS',
  'ACQUIRED',
  'ACQUISITION_FAILED',
  'CANCELLED'
);

CREATE TYPE "ImagingAcquisitionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE "imaging_studies" (
    "id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "imaging_org_id" UUID NOT NULL,
    "imaging_location_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "status" "ImagingStudyStatus" NOT NULL DEFAULT 'SCHEDULED',
    "accession_number" TEXT NOT NULL,
    "modality_code" TEXT,
    "body_region_code" TEXT,
    "assignee_person_id" UUID,
    "idempotency_key" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "imaging_studies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_study_status_history" (
    "id" UUID NOT NULL,
    "imaging_study_id" UUID NOT NULL,
    "from_status" "ImagingStudyStatus",
    "to_status" "ImagingStudyStatus" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "action_code" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_study_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_acquisitions" (
    "id" UUID NOT NULL,
    "imaging_study_id" UUID NOT NULL,
    "status" "ImagingAcquisitionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "technician_person_id" UUID,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "sandbox_object_ref" TEXT,
    "equipment_code" TEXT,
    "failure_code" TEXT,
    "metadata" JSONB,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "imaging_acquisitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imaging_studies_imaging_booking_id_key" ON "imaging_studies"("imaging_booking_id");
CREATE UNIQUE INDEX "imaging_studies_accession_number_key" ON "imaging_studies"("accession_number");
CREATE UNIQUE INDEX "imaging_studies_idempotency_key_key" ON "imaging_studies"("idempotency_key");
CREATE INDEX "imaging_studies_imaging_org_id_status_idx" ON "imaging_studies"("imaging_org_id", "status");
CREATE INDEX "imaging_studies_country_id_status_idx" ON "imaging_studies"("country_id", "status");
CREATE INDEX "imaging_studies_assignee_person_id_status_idx" ON "imaging_studies"("assignee_person_id", "status");

CREATE INDEX "imaging_study_status_history_imaging_study_id_created_at_idx"
  ON "imaging_study_status_history"("imaging_study_id", "created_at");

CREATE UNIQUE INDEX "imaging_acquisitions_imaging_study_id_key" ON "imaging_acquisitions"("imaging_study_id");
CREATE INDEX "imaging_acquisitions_technician_person_id_status_idx" ON "imaging_acquisitions"("technician_person_id", "status");

ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_imaging_booking_id_fkey"
  FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_imaging_org_id_fkey"
  FOREIGN KEY ("imaging_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_imaging_location_id_fkey"
  FOREIGN KEY ("imaging_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_assignee_person_id_fkey"
  FOREIGN KEY ("assignee_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_study_status_history" ADD CONSTRAINT "imaging_study_status_history_imaging_study_id_fkey"
  FOREIGN KEY ("imaging_study_id") REFERENCES "imaging_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_study_status_history" ADD CONSTRAINT "imaging_study_status_history_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imaging_acquisitions" ADD CONSTRAINT "imaging_acquisitions_imaging_study_id_fkey"
  FOREIGN KEY ("imaging_study_id") REFERENCES "imaging_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_acquisitions" ADD CONSTRAINT "imaging_acquisitions_technician_person_id_fkey"
  FOREIGN KEY ("technician_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_studies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_studies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_study_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_study_status_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_acquisitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_acquisitions" FORCE ROW LEVEL SECURITY;

CREATE POLICY imaging_studies_access ON "imaging_studies" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_studies.imaging_booking_id
        AND app.can_person(b.customer_person_id)
    )
    OR app.can_org("imaging_org_id")
    OR (
      assignee_person_id IS NOT NULL
      AND app.can_person(assignee_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("imaging_org_id")
    OR (
      assignee_person_id IS NOT NULL
      AND app.can_person(assignee_person_id)
    )
  );

CREATE POLICY imaging_study_status_history_access ON "imaging_study_status_history" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      JOIN imaging_bookings b ON b.id = s.imaging_booking_id
      WHERE s.id = imaging_study_status_history.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      WHERE s.id = imaging_study_status_history.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.write_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  );

CREATE POLICY imaging_acquisitions_access ON "imaging_acquisitions" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      JOIN imaging_bookings b ON b.id = s.imaging_booking_id
      WHERE s.id = imaging_acquisitions.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
          OR (technician_person_id IS NOT NULL AND app.can_person(technician_person_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      WHERE s.id = imaging_acquisitions.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.write_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
          OR (technician_person_id IS NOT NULL AND app.can_person(technician_person_id))
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_studies" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_study_status_history" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_acquisitions" TO worldpharma_app;
