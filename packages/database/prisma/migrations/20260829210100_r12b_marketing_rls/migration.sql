-- R12-B: FORCE RLS on marketing tables (no USING(true))

ALTER TABLE "crm_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_segments" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_segments_select ON "crm_segments" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
  );

CREATE POLICY crm_segments_insert ON "crm_segments" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_segments_update ON "crm_segments" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_segments_no_delete ON "crm_segments" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "crm_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaigns" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_campaigns_select ON "crm_campaigns" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
  );

CREATE POLICY crm_campaigns_insert ON "crm_campaigns" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_campaigns_update ON "crm_campaigns" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_campaigns_no_delete ON "crm_campaigns" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "crm_campaign_sends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaign_sends" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_campaign_sends_select ON "crm_campaign_sends" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY crm_campaign_sends_insert ON "crm_campaign_sends" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY crm_campaign_sends_no_update ON "crm_campaign_sends" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY crm_campaign_sends_no_delete ON "crm_campaign_sends" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "crm_suppressions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_suppressions" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_suppressions_select ON "crm_suppressions" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY crm_suppressions_insert ON "crm_suppressions" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY crm_suppressions_update ON "crm_suppressions" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY crm_suppressions_no_delete ON "crm_suppressions" FOR DELETE TO worldpharma_app
  USING (false);
