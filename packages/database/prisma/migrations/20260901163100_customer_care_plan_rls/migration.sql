ALTER TABLE "customer_care_plan_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_care_plan_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_care_plan_memberships_select ON "customer_care_plan_memberships" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY customer_care_plan_memberships_insert ON "customer_care_plan_memberships" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY customer_care_plan_memberships_update ON "customer_care_plan_memberships" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY customer_care_plan_memberships_delete ON "customer_care_plan_memberships" FOR DELETE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("customer_person_id"))
    AND app.can_country("country_id")
  );
