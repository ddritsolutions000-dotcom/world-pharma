-- R12-G: FORCE RLS on crm_automation_runs (append-only, no USING(true))

ALTER TABLE "crm_automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_automation_runs" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_automation_runs_select ON "crm_automation_runs" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY crm_automation_runs_insert ON "crm_automation_runs" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_automation_runs_no_update ON "crm_automation_runs" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY crm_automation_runs_no_delete ON "crm_automation_runs" FOR DELETE TO worldpharma_app
  USING (false);
