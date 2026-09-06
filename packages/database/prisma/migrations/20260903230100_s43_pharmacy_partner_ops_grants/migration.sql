-- Sprint 43 RLS + grants for pharmacy partner ops events

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pharmacy_licence_events" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "partner_commercial_approval_events" TO worldpharma_app;

ALTER TABLE "pharmacy_licence_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_licence_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "partner_commercial_approval_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_commercial_approval_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "pharmacy_licence_events_platform" ON "pharmacy_licence_events"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY "partner_commercial_approval_events_platform" ON "partner_commercial_approval_events"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());
