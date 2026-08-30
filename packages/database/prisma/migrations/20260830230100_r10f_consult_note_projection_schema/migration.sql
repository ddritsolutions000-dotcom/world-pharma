-- R10-F (step 2): encounter consult note source + health artifact encounter FK + RLS.

CREATE TABLE "encounter_consult_notes" (
  "id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "patient_person_id" UUID NOT NULL,
  "doctor_profile_id" UUID NOT NULL,
  "patient_summary" TEXT NOT NULL,
  "completed_at" TIMESTAMPTZ NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "encounter_consult_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "encounter_consult_notes_encounter_id_key" ON "encounter_consult_notes"("encounter_id");
CREATE INDEX "encounter_consult_notes_patient_person_id_completed_at_idx"
  ON "encounter_consult_notes"("patient_person_id", "completed_at" DESC);
CREATE INDEX "encounter_consult_notes_country_id_idx" ON "encounter_consult_notes"("country_id");

ALTER TABLE "encounter_consult_notes" ADD CONSTRAINT "encounter_consult_notes_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encounter_consult_notes" ADD CONSTRAINT "encounter_consult_notes_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounter_consult_notes" ADD CONSTRAINT "encounter_consult_notes_patient_person_id_fkey"
  FOREIGN KEY ("patient_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounter_consult_notes" ADD CONSTRAINT "encounter_consult_notes_doctor_profile_id_fkey"
  FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "health_artifacts" ADD COLUMN IF NOT EXISTS "encounter_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "health_artifacts_encounter_id_key"
  ON "health_artifacts"("encounter_id")
  WHERE "encounter_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "health_artifacts_encounter_id_idx" ON "health_artifacts"("encounter_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_artifacts_encounter_id_fkey'
  ) THEN
    ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_encounter_id_fkey"
      FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
    AND "encounter_id" IS NULL
  )
  OR (
    "artifact_type" = 'IMAGING_REPORT'
    AND "imaging_report_version_id" IS NOT NULL
    AND "imaging_booking_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
    AND "encounter_id" IS NULL
  )
  OR (
    "artifact_type" = 'PRESCRIPTION_STRUCTURED'
    AND "prescription_id" IS NOT NULL
    AND "prescription_version_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
    AND "encounter_id" IS NULL
  )
  OR (
    "artifact_type" IN ('DOCUMENT', 'PRESCRIPTION_UPLOAD')
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
    AND "encounter_id" IS NULL
  )
  OR (
    "artifact_type" = 'CONSULT_NOTE'
    AND "encounter_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
    AND "prescription_id" IS NULL
    AND "prescription_version_id" IS NULL
  )
);

ALTER TABLE "encounter_consult_notes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS encounter_consult_notes_access ON "encounter_consult_notes";
CREATE POLICY encounter_consult_notes_access ON "encounter_consult_notes" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("patient_person_id")
    OR EXISTS (
      SELECT 1 FROM doctor_profiles dp
      WHERE dp.id = encounter_consult_notes.doctor_profile_id
        AND dp.person_id = app.person_id()
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM encounters e
      JOIN doctor_profiles dp ON dp.id = e.doctor_profile_id
      WHERE e.id = encounter_consult_notes.encounter_id
        AND dp.person_id = app.person_id()
        AND e.customer_person_id = encounter_consult_notes.patient_person_id
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
    OR EXISTS (
      SELECT 1 FROM encounters e
      WHERE e.id = health_artifacts.encounter_id
        AND app.can_person(e.customer_person_id)
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
    OR EXISTS (
      SELECT 1 FROM encounters e
      WHERE e.id = health_artifacts.encounter_id
        AND e.customer_person_id = health_artifacts.person_id
        AND app.person_id() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM doctor_profiles dp
          WHERE dp.id = e.doctor_profile_id AND dp.person_id = app.person_id()
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
        OR EXISTS (
          SELECT 1 FROM encounters e
          WHERE e.id = ha.encounter_id
            AND app.person_id() IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM doctor_profiles dp
              WHERE dp.id = e.doctor_profile_id AND dp.person_id = app.person_id()
            )
        )
      )
    )
  );

GRANT SELECT, INSERT ON "encounter_consult_notes" TO worldpharma_app;
