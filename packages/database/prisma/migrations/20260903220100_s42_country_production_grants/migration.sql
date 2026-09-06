-- Sprint 42 RLS + grants for evidence events

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "regulatory_evidence_events" TO worldpharma_app;

ALTER TABLE "regulatory_evidence_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regulatory_evidence_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_evidence_events_platform" ON "regulatory_evidence_events"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());
