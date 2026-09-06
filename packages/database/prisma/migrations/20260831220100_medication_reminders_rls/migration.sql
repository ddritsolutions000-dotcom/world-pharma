-- RLS for customer-owned medication reminders

ALTER TABLE "medication_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medication_reminders" FORCE ROW LEVEL SECURITY;

CREATE POLICY medication_reminders_select ON "medication_reminders" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY medication_reminders_insert ON "medication_reminders" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY medication_reminders_update ON "medication_reminders" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY medication_reminders_delete ON "medication_reminders" FOR DELETE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );
