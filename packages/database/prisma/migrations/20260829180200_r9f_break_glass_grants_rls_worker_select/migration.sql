-- R9-F: allow worker context to read break-glass grants for server-side authorization checks.

DROP POLICY IF EXISTS break_glass_grants_select ON "break_glass_grants";

CREATE POLICY break_glass_grants_select ON "break_glass_grants" FOR SELECT TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR app.can_person("granted_by_id")
    OR app.can_person("person_id")
    OR app.can_person("patient_person_id")
  );
