-- R9-F: health break-glass clinical bridge + admin governance schema + RLS

ALTER TABLE "break_glass_grants"
  ADD COLUMN "kind" "BreakGlassGrantKind" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "country_id" UUID,
  ADD COLUMN "patient_person_id" UUID,
  ADD COLUMN "doctor_partner_id" UUID,
  ADD COLUMN "ticket_id" TEXT,
  ADD COLUMN "review_status" "BreakGlassReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "review_notes" TEXT;

ALTER TABLE "consent_grants"
  ADD COLUMN "break_glass_grant_id" UUID;

CREATE UNIQUE INDEX "consent_grants_break_glass_grant_id_key"
  ON "consent_grants"("break_glass_grant_id");

CREATE INDEX "break_glass_grants_kind_review_status_created_at_idx"
  ON "break_glass_grants"("kind", "review_status", "created_at");

CREATE INDEX "break_glass_grants_patient_person_id_doctor_partner_id_idx"
  ON "break_glass_grants"("patient_person_id", "doctor_partner_id");

ALTER TABLE "break_glass_grants"
  ADD CONSTRAINT "break_glass_grants_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "break_glass_grants"
  ADD CONSTRAINT "break_glass_grants_patient_person_id_fkey"
  FOREIGN KEY ("patient_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "break_glass_grants"
  ADD CONSTRAINT "break_glass_grants_doctor_partner_id_fkey"
  FOREIGN KEY ("doctor_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "break_glass_grants"
  ADD CONSTRAINT "break_glass_grants_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consent_grants"
  ADD CONSTRAINT "consent_grants_break_glass_grant_id_fkey"
  FOREIGN KEY ("break_glass_grant_id") REFERENCES "break_glass_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "break_glass_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "break_glass_grants" FORCE ROW LEVEL SECURITY;

CREATE POLICY break_glass_grants_select ON "break_glass_grants" FOR SELECT TO worldpharma_app
  USING (
    app.is_platform()
    OR app.can_person("granted_by_id")
    OR app.can_person("person_id")
    OR app.can_person("patient_person_id")
  );

CREATE POLICY break_glass_grants_insert ON "break_glass_grants" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.actor_present()
    AND (app.is_platform() OR app.is_worker())
  );

CREATE POLICY break_glass_grants_update ON "break_glass_grants" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY break_glass_grants_no_delete ON "break_glass_grants" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "break_glass_grants" TO worldpharma_app;
