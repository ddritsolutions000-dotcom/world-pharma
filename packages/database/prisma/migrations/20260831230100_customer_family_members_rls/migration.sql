ALTER TABLE "customer_family_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_family_members" FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_family_members_select ON "customer_family_members" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY customer_family_members_insert ON "customer_family_members" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY customer_family_members_update ON "customer_family_members" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY customer_family_members_delete ON "customer_family_members" FOR DELETE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );
