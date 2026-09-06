-- Sprint 39: RLS enable + grants for new S39 tables.

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "healthcare_policies" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "regulatory_requirements" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "regulatory_evidence" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "production_dependencies" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "country_readiness_gates" TO worldpharma_app;

-- Enable RLS (fail-closed by default — no policy = deny)
ALTER TABLE "healthcare_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "healthcare_policies" FORCE ROW LEVEL SECURITY;

ALTER TABLE "regulatory_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_requirements" FORCE ROW LEVEL SECURITY;

ALTER TABLE "regulatory_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_evidence" FORCE ROW LEVEL SECURITY;

ALTER TABLE "production_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_dependencies" FORCE ROW LEVEL SECURITY;

ALTER TABLE "country_readiness_gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "country_readiness_gates" FORCE ROW LEVEL SECURITY;

-- RLS policies: platform actors (admin, worker, system) have full access.
-- Customer/vendor/doctor actors cannot see regulatory/production data at all.

CREATE POLICY "healthcare_policies_platform" ON "healthcare_policies"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY "regulatory_requirements_platform" ON "regulatory_requirements"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY "regulatory_evidence_platform" ON "regulatory_evidence"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY "production_dependencies_platform" ON "production_dependencies"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY "country_readiness_gates_platform" ON "country_readiness_gates"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());
