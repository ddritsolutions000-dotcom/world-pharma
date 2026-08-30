-- CR-R5-C-IMPL-116: pharmacy dispensing cases (additive).
-- Clinical dispense workflow only. No Order/Payment/Shipment coupling.
-- OD-R5C-01 full-line-only; OD-R5C-04 enqueue-on-issue.
-- Inventory: hard consume on complete via movements (no checkout reservation).

CREATE TYPE "DispensingCaseStatus" AS ENUM (
  'QUEUED',
  'VALIDATING',
  'REJECTED',
  'AUTHORIZED_TO_DISPENSE',
  'DISPENSING',
  'DISPENSED',
  'FAILED',
  'CANCELLED_CASE',
  'SUPERSEDED'
);

CREATE TYPE "DispenseEventKind" AS ENUM (
  'QUEUED',
  'CLAIMED',
  'VALIDATE_START',
  'REJECT',
  'AUTHORIZE',
  'MAP_LINES',
  'COMPLETE',
  'CANCEL_CASE',
  'FAIL',
  'SUPERSEDE'
);

CREATE TABLE "dispensing_cases" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_version_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "organization_id" UUID,
  "location_id" UUID,
  "status" "DispensingCaseStatus" NOT NULL DEFAULT 'QUEUED',
  "claimed_by_person_id" UUID,
  "rejected_reason_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "dispensing_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispensing_cases_status_country_id_created_at_idx"
  ON "dispensing_cases"("status", "country_id", "created_at");
CREATE INDEX "dispensing_cases_prescription_id_status_idx"
  ON "dispensing_cases"("prescription_id", "status");
CREATE INDEX "dispensing_cases_prescription_version_id_idx"
  ON "dispensing_cases"("prescription_version_id");
CREATE INDEX "dispensing_cases_organization_id_location_id_status_idx"
  ON "dispensing_cases"("organization_id", "location_id", "status");

CREATE TABLE "dispense_events" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "kind" "DispenseEventKind" NOT NULL,
  "actor_person_id" UUID NOT NULL,
  "reason_code" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "meta_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispense_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispense_events_idempotency_key_key" ON "dispense_events"("idempotency_key");
CREATE INDEX "dispense_events_case_id_created_at_idx" ON "dispense_events"("case_id", "created_at");

CREATE TABLE "dispense_line_mappings" (
  "id" UUID NOT NULL,
  "case_id" UUID NOT NULL,
  "prescription_line_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "catalog_variant_id" UUID NOT NULL,
  "inventory_lot_id" UUID,
  "quantity_dispensed" TEXT NOT NULL,
  "confirm_substitution" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "dispense_line_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispense_line_mappings_case_id_prescription_line_id_key"
  ON "dispense_line_mappings"("case_id", "prescription_line_id");
CREATE INDEX "dispense_line_mappings_case_id_idx" ON "dispense_line_mappings"("case_id");

ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_prescription_id_fkey"
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_prescription_version_id_fkey"
  FOREIGN KEY ("prescription_version_id") REFERENCES "prescription_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispensing_cases"
  ADD CONSTRAINT "dispensing_cases_claimed_by_person_id_fkey"
  FOREIGN KEY ("claimed_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispense_events"
  ADD CONSTRAINT "dispense_events_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "dispensing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispense_events"
  ADD CONSTRAINT "dispense_events_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispense_line_mappings"
  ADD CONSTRAINT "dispense_line_mappings_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "dispensing_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: store org/location via app.can_org; patient/doctor via prescription join; platform/worker.
ALTER TABLE "dispensing_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispense_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispense_line_mappings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispensing_cases_access ON "dispensing_cases"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
        AND (
          p.patient_person_id = app.person_id()
          OR EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
  );

CREATE POLICY dispense_events_access ON "dispense_events"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR actor_person_id = app.person_id()
    OR EXISTS (
      SELECT 1 FROM dispensing_cases c
      WHERE c.id = case_id
        AND (
          (c.organization_id IS NOT NULL AND app.can_org(c.organization_id))
          OR EXISTS (
            SELECT 1 FROM prescriptions p
            WHERE p.id = c.prescription_id
              AND (
                p.patient_person_id = app.person_id()
                OR EXISTS (
                  SELECT 1 FROM doctor_profiles dp
                  WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
                )
              )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR actor_person_id = app.person_id()
  );

CREATE POLICY dispense_line_mappings_access ON "dispense_line_mappings"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM dispensing_cases c
      WHERE c.id = case_id
        AND (
          (c.organization_id IS NOT NULL AND app.can_org(c.organization_id))
          OR EXISTS (
            SELECT 1 FROM prescriptions p
            WHERE p.id = c.prescription_id
              AND (
                p.patient_person_id = app.person_id()
                OR EXISTS (
                  SELECT 1 FROM doctor_profiles dp
                  WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
                )
              )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM dispensing_cases c
      WHERE c.id = case_id AND c.organization_id IS NOT NULL AND app.can_org(c.organization_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "dispensing_cases" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "dispense_events" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "dispense_line_mappings" TO worldpharma_app;
