-- Phase 4B-5: FORCE RLS on sensitive identity/clinical tables; tighten platform bypass.

ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "totp_secrets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "encounter_consult_notes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "health_artifact_uploads" FORCE ROW LEVEL SECURITY;

ALTER TABLE "privilege_grant_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "privilege_grant_requests" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS totp_secrets_app_all ON "totp_secrets";

DROP POLICY IF EXISTS encounter_consult_notes_access ON "encounter_consult_notes";
CREATE POLICY encounter_consult_notes_access ON "encounter_consult_notes" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.can_person("patient_person_id")
    OR EXISTS (
      SELECT 1 FROM doctor_profiles dp
      WHERE dp.id = encounter_consult_notes.doctor_profile_id
        AND dp.person_id = app.person_id()
    )
    OR EXISTS (
      SELECT 1 FROM break_glass_grants bg
      WHERE bg.revoked_at IS NULL
        AND bg.expires_at > now()
        AND bg.kind = 'HEALTH_CLINICAL'
        AND bg.person_id = app.person_id()
        AND (
          bg.patient_person_id IS NULL
          OR bg.patient_person_id = encounter_consult_notes.patient_person_id
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR EXISTS (
      SELECT 1 FROM encounters e
      JOIN doctor_profiles dp ON dp.id = e.doctor_profile_id
      WHERE e.id = encounter_consult_notes.encounter_id
        AND dp.person_id = app.person_id()
        AND e.customer_person_id = encounter_consult_notes.patient_person_id
    )
  );

DROP POLICY IF EXISTS health_artifact_uploads_access ON "health_artifact_uploads";
CREATE POLICY health_artifact_uploads_access ON "health_artifact_uploads" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.can_person("person_id")
    OR EXISTS (
      SELECT 1 FROM break_glass_grants bg
      WHERE bg.revoked_at IS NULL
        AND bg.expires_at > now()
        AND bg.kind = 'HEALTH_CLINICAL'
        AND bg.person_id = app.person_id()
        AND (
          bg.patient_person_id IS NULL
          OR bg.patient_person_id = health_artifact_uploads.person_id
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.person_id() = person_id
  );

CREATE POLICY privilege_grant_requests_select ON "privilege_grant_requests"
  FOR SELECT TO worldpharma_app
  USING (
    app.is_platform()
    OR app.can_person("target_person_id")
    OR app.can_person("requested_by_id")
  );

CREATE POLICY privilege_grant_requests_insert ON "privilege_grant_requests"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.can_person("requested_by_id"));

CREATE POLICY privilege_grant_requests_update ON "privilege_grant_requests"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform())
  WITH CHECK (app.is_platform());

GRANT SELECT, INSERT, UPDATE ON "privilege_grant_requests" TO worldpharma_app;

-- Replace phase 4B-2 open SELECT policies (USING true) with scoped policies.
DROP POLICY IF EXISTS health_packages_worker_select ON "health_packages";
DROP POLICY IF EXISTS care_plan_definitions_worker_select ON "care_plan_definitions";
DROP POLICY IF EXISTS serviceability_zones_worker_select ON "serviceability_zones";
DROP POLICY IF EXISTS medicine_substitute_edges_worker_select ON "medicine_substitute_edges";

CREATE POLICY health_packages_select ON "health_packages"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_country(country_id));

CREATE POLICY care_plan_definitions_select ON "care_plan_definitions"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_country(country_id));

CREATE POLICY serviceability_zones_select ON "serviceability_zones"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_country(country_id));

CREATE POLICY medicine_substitute_edges_select ON "medicine_substitute_edges"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_country(country_id));

ALTER TABLE "health_packages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "care_plan_definitions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "serviceability_zones" FORCE ROW LEVEL SECURITY;
ALTER TABLE "medicine_substitute_edges" FORCE ROW LEVEL SECURITY;
