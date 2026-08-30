-- CR-R5-IMPL-112 R5-A: prescription foundation (additive only).
-- Clinical artifacts only. No Order/Payment/Inventory/Shipment coupling.

CREATE TYPE "PrescriptionStatus" AS ENUM (
  'DRAFT',
  'ISSUED',
  'SUPERSEDED',
  'CANCELLED',
  'EXPIRED',
  'FULLY_DISPENSED'
);

CREATE TYPE "PrescriptionOrigin" AS ENUM (
  'ENCOUNTER',
  'UPLOAD',
  'EXTERNAL_ERX'
);

CREATE TABLE "prescriptions" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "patient_person_id" UUID NOT NULL,
  "doctor_profile_id" UUID NOT NULL,
  "doctor_partner_id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "organization_id" UUID,
  "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "origin" "PrescriptionOrigin" NOT NULL DEFAULT 'ENCOUNTER',
  "current_version_id" UUID,
  "created_by_person_id" UUID NOT NULL,
  "cancelled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescriptions_current_version_id_key" ON "prescriptions"("current_version_id");
CREATE INDEX "prescriptions_patient_person_id_created_at_idx" ON "prescriptions"("patient_person_id", "created_at");
CREATE INDEX "prescriptions_doctor_profile_id_created_at_idx" ON "prescriptions"("doctor_profile_id", "created_at");
CREATE INDEX "prescriptions_country_id_status_idx" ON "prescriptions"("country_id", "status");
CREATE INDEX "prescriptions_encounter_id_idx" ON "prescriptions"("encounter_id");

CREATE TABLE "prescription_versions" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "supersedes_version_id" UUID,
  "sealed_at" TIMESTAMPTZ,
  "valid_from" TIMESTAMPTZ,
  "valid_until" TIMESTAMPTZ,
  "integrity_seal" TEXT,
  "created_by_person_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prescription_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescription_versions_prescription_id_version_number_key"
  ON "prescription_versions"("prescription_id", "version_number");
CREATE INDEX "prescription_versions_prescription_id_created_at_idx"
  ON "prescription_versions"("prescription_id", "created_at");

CREATE TABLE "prescription_lines" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "clinical_concept_code" TEXT NOT NULL,
  "clinical_concept_label" TEXT NOT NULL,
  "strength_text" TEXT,
  "form_text" TEXT,
  "route_text" TEXT,
  "dosage_instructions" TEXT NOT NULL,
  "quantity_authorized" TEXT NOT NULL,
  "quantity_unit" TEXT,
  "days_supply" INTEGER,
  "substitution_allowed" BOOLEAN NOT NULL DEFAULT false,
  "restriction_category_code" TEXT,
  "suggested_catalog_item_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prescription_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescription_lines_version_id_line_number_key"
  ON "prescription_lines"("version_id", "line_number");
CREATE INDEX "prescription_lines_version_id_idx" ON "prescription_lines"("version_id");

CREATE TABLE "prescription_status_history" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "from_status" "PrescriptionStatus",
  "to_status" "PrescriptionStatus" NOT NULL,
  "actor_person_id" UUID,
  "reason_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prescription_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prescription_status_history_prescription_id_created_at_idx"
  ON "prescription_status_history"("prescription_id", "created_at");

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_patient_person_id_fkey"
  FOREIGN KEY ("patient_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_doctor_profile_id_fkey"
  FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_created_by_person_id_fkey"
  FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_versions"
  ADD CONSTRAINT "prescription_versions_prescription_id_fkey"
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_versions"
  ADD CONSTRAINT "prescription_versions_supersedes_version_id_fkey"
  FOREIGN KEY ("supersedes_version_id") REFERENCES "prescription_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescription_versions"
  ADD CONSTRAINT "prescription_versions_created_by_person_id_fkey"
  FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "prescription_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescription_lines"
  ADD CONSTRAINT "prescription_lines_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "prescription_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prescription_status_history"
  ADD CONSTRAINT "prescription_status_history_prescription_id_fkey"
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prescription_status_history"
  ADD CONSTRAINT "prescription_status_history_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_status_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY prescriptions_access ON prescriptions TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND patient_person_id = app.person_id())
    OR (app.person_id() IS NOT NULL AND created_by_person_id = app.person_id())
    OR (app.person_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM doctor_profiles dp
      WHERE dp.id = doctor_profile_id AND dp.person_id = app.person_id()
    ))
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND created_by_person_id = app.person_id())
  );

CREATE POLICY prescription_versions_access ON prescription_versions TO worldpharma_app
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

CREATE POLICY prescription_lines_access ON prescription_lines TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM prescription_versions v
      JOIN prescriptions p ON p.id = v.prescription_id
      WHERE v.id = version_id
        AND (
          (app.person_id() IS NOT NULL AND p.patient_person_id = app.person_id())
          OR (app.person_id() IS NOT NULL AND EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          ))
          OR app.is_platform()
          OR (p.organization_id IS NOT NULL AND app.can_org(p.organization_id))
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM prescription_versions v
      JOIN prescriptions p ON p.id = v.prescription_id
      WHERE v.id = version_id
        AND app.person_id() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM doctor_profiles dp
          WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
        )
    )
  );

CREATE POLICY prescription_status_history_access ON prescription_status_history TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
        AND (
          (app.person_id() IS NOT NULL AND p.patient_person_id = app.person_id())
          OR (app.person_id() IS NOT NULL AND EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          ))
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND actor_person_id = app.person_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE prescriptions TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE prescription_versions TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE prescription_lines TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE prescription_status_history TO worldpharma_app;
