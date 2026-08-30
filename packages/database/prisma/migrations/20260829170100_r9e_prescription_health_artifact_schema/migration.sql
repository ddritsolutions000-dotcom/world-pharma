-- R9-E: prescription → health_artifact projection (additive only).

ALTER TABLE "health_artifacts" ADD COLUMN IF NOT EXISTS "prescription_id" UUID;
ALTER TABLE "health_artifacts" ADD COLUMN IF NOT EXISTS "prescription_version_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "health_artifacts_prescription_version_id_key"
  ON "health_artifacts"("prescription_version_id")
  WHERE "prescription_version_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "health_artifacts_prescription_id_idx" ON "health_artifacts"("prescription_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_artifacts_prescription_id_fkey'
  ) THEN
    ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_prescription_id_fkey"
      FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_artifacts_prescription_version_id_fkey'
  ) THEN
    ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_prescription_version_id_fkey"
      FOREIGN KEY ("prescription_version_id") REFERENCES "prescription_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

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
