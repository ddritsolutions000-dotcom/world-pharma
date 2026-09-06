-- Platform catalog-style RLS: company actors may read; writes are platform/worker only.

ALTER TABLE "r14a_human_gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "r14a_human_gates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "r14a_human_gate_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "r14a_human_gate_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY r14a_human_gates_sel ON "r14a_human_gates" FOR SELECT TO worldpharma_app
  USING (app.actor_present());
CREATE POLICY r14a_human_gates_ins ON "r14a_human_gates" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());
CREATE POLICY r14a_human_gates_upd ON "r14a_human_gates" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());
CREATE POLICY r14a_human_gates_del ON "r14a_human_gates" FOR DELETE TO worldpharma_app
  USING (false);

CREATE POLICY r14a_human_gate_revisions_sel ON "r14a_human_gate_revisions" FOR SELECT TO worldpharma_app
  USING (app.actor_present());
CREATE POLICY r14a_human_gate_revisions_ins ON "r14a_human_gate_revisions" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());
CREATE POLICY r14a_human_gate_revisions_upd ON "r14a_human_gate_revisions" FOR UPDATE TO worldpharma_app
  USING (false);
CREATE POLICY r14a_human_gate_revisions_del ON "r14a_human_gate_revisions" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "r14a_human_gates" TO worldpharma_app;
GRANT SELECT, INSERT ON "r14a_human_gate_revisions" TO worldpharma_app;
