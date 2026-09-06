-- Sprint 40: RLS + grants for pharmacy_licences and partner_commercial_approvals.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pharmacy_licences" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "partner_commercial_approvals" TO worldpharma_app;

ALTER TABLE "pharmacy_licences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_licences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "partner_commercial_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_commercial_approvals" FORCE ROW LEVEL SECURITY;

-- pharmacy_licences: platform/worker full access
CREATE POLICY "pharmacy_licences_platform_rw" ON "pharmacy_licences"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

-- partner_commercial_approvals: platform-only (vendors cannot see or modify)
CREATE POLICY "partner_commercial_approvals_platform" ON "partner_commercial_approvals"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());
