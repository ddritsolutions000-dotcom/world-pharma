-- R12-A: FORCE RLS on marketing_preferences and conversion_events (no USING(true))

ALTER TABLE "marketing_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_preferences" FORCE ROW LEVEL SECURITY;

CREATE POLICY marketing_preferences_select ON "marketing_preferences" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY marketing_preferences_insert ON "marketing_preferences" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY marketing_preferences_update ON "marketing_preferences" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY marketing_preferences_no_delete ON "marketing_preferences" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "conversion_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversion_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY conversion_events_select ON "conversion_events" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR ("person_id" IS NOT NULL AND app.can_person("person_id"))
    OR app.can_country("country_id")
  );

CREATE POLICY conversion_events_insert ON "conversion_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY conversion_events_no_update ON "conversion_events" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY conversion_events_no_delete ON "conversion_events" FOR DELETE TO worldpharma_app
  USING (false);
