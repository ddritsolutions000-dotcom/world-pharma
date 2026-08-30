-- R10-E (step 2): upload metadata table, payload check, and RLS.

CREATE TABLE "health_artifact_uploads" (
  "id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "checksum_sha256" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "classification" TEXT NOT NULL DEFAULT 'STANDARD_HEALTH',
  "idempotency_key" TEXT,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_artifact_uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "health_artifact_uploads_artifact_id_key" ON "health_artifact_uploads"("artifact_id");
CREATE INDEX "health_artifact_uploads_person_id_uploaded_at_idx" ON "health_artifact_uploads"("person_id", "uploaded_at" DESC);
CREATE UNIQUE INDEX "health_artifact_uploads_person_id_idempotency_key_key"
  ON "health_artifact_uploads"("person_id", "idempotency_key");

ALTER TABLE "health_artifact_uploads" ADD CONSTRAINT "health_artifact_uploads_artifact_id_fkey"
  FOREIGN KEY ("artifact_id") REFERENCES "health_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "health_artifact_uploads" ADD CONSTRAINT "health_artifact_uploads_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_artifact_uploads" ADD CONSTRAINT "health_artifact_uploads_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "health_artifacts" DROP CONSTRAINT IF EXISTS "health_artifacts_type_payload_check";
ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_type_payload_check" CHECK (
  (
    "artifact_type" = 'LAB_REPORT'
    AND "lab_report_version_id" IS NOT NULL
    AND "lab_booking_id" IS NOT NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
  )
  OR (
    "artifact_type" = 'IMAGING_REPORT'
    AND "imaging_report_version_id" IS NOT NULL
    AND "imaging_booking_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
  )
  OR (
    "artifact_type" = 'PRESCRIPTION_STRUCTURED'
    AND "prescription_id" IS NOT NULL
    AND "prescription_version_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
  )
  OR (
    "artifact_type" IN ('DOCUMENT', 'PRESCRIPTION_UPLOAD')
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
  )
);

ALTER TABLE "health_artifact_uploads" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_artifact_uploads_access ON "health_artifact_uploads";
CREATE POLICY health_artifact_uploads_access ON "health_artifact_uploads" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.person_id() = person_id
  );

DROP POLICY IF EXISTS health_artifacts_access ON "health_artifacts";
CREATE POLICY health_artifacts_access ON "health_artifacts" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.can_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.can_org(b.imaging_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = health_artifacts.prescription_id
        AND app.can_person(p.patient_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.person_id() = person_id
      AND artifact_type IN ('DOCUMENT', 'PRESCRIPTION_UPLOAD')
    )
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.write_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.write_org(b.imaging_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = health_artifacts.prescription_id
        AND p.patient_person_id = health_artifacts.person_id
        AND app.person_id() IS NOT NULL
        AND (
          p.created_by_person_id = app.person_id()
          OR EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS health_timeline_events_insert ON "health_timeline_events";
CREATE POLICY health_timeline_events_insert ON "health_timeline_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR (
      app.person_id() = person_id
      AND event_type = 'ARTIFACT_UPLOADED'
    )
    OR EXISTS (
      SELECT 1 FROM health_artifacts ha
      WHERE ha.id = health_timeline_events.artifact_id
      AND (
        EXISTS (
          SELECT 1 FROM lab_bookings b
          WHERE b.id = ha.lab_booking_id AND app.write_org(b.lab_org_id)
        )
        OR EXISTS (
          SELECT 1 FROM imaging_bookings b
          WHERE b.id = ha.imaging_booking_id AND app.write_org(b.imaging_org_id)
        )
        OR EXISTS (
          SELECT 1 FROM prescriptions p
          WHERE p.id = ha.prescription_id
            AND app.person_id() IS NOT NULL
            AND (
              p.created_by_person_id = app.person_id()
              OR EXISTS (
                SELECT 1 FROM doctor_profiles dp
                WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
              )
            )
        )
      )
    )
  );

GRANT SELECT, INSERT ON "health_artifact_uploads" TO worldpharma_app;
