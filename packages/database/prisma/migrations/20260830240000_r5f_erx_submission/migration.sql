-- R5-F: provider-neutral e-Rx submission tracking (fail-closed; no live provider credentials).

CREATE TYPE "PrescriptionErxSubmissionStatus" AS ENUM (
  'PENDING',
  'SUBMITTED',
  'UNSUPPORTED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "prescription_erx_submissions" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_version_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "provider_code" TEXT NOT NULL,
  "provider_ref" TEXT,
  "status" "PrescriptionErxSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "reason_code" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "actor_person_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "prescription_erx_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescription_erx_submissions_prescription_version_id_key"
  ON "prescription_erx_submissions"("prescription_version_id");
CREATE INDEX "prescription_erx_submissions_prescription_id_idx"
  ON "prescription_erx_submissions"("prescription_id");
CREATE INDEX "prescription_erx_submissions_country_id_status_idx"
  ON "prescription_erx_submissions"("country_id", "status");

ALTER TABLE "prescription_erx_submissions"
  ADD CONSTRAINT "prescription_erx_submissions_prescription_id_fkey"
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_erx_submissions"
  ADD CONSTRAINT "prescription_erx_submissions_prescription_version_id_fkey"
  FOREIGN KEY ("prescription_version_id") REFERENCES "prescription_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_erx_submissions"
  ADD CONSTRAINT "prescription_erx_submissions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_erx_submissions"
  ADD CONSTRAINT "prescription_erx_submissions_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescription_erx_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_erx_submissions" FORCE ROW LEVEL SECURITY;

CREATE POLICY prescription_erx_submissions_access ON prescription_erx_submissions TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
        AND (
          (app.person_id() IS NOT NULL AND p.patient_person_id = app.person_id())
          OR (app.person_id() IS NOT NULL AND p.created_by_person_id = app.person_id())
          OR (app.person_id() IS NOT NULL AND EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          ))
          OR (p.organization_id IS NOT NULL AND app.can_org(p.organization_id))
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
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

COMMENT ON TABLE "prescription_erx_submissions" IS 'R5-F e-Rx submission audit trail; one row per sealed prescription version.';

GRANT SELECT, INSERT, UPDATE ON "prescription_erx_submissions" TO worldpharma_app;
