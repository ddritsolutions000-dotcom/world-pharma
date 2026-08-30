-- R12-D: FORCE RLS on affiliate tables

ALTER TABLE "affiliate_referral_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_referral_codes" FORCE ROW LEVEL SECURITY;

CREATE POLICY affiliate_referral_codes_select ON "affiliate_referral_codes" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("organization_id")
    OR app.can_country("country_id")
  );

CREATE POLICY affiliate_referral_codes_insert ON "affiliate_referral_codes" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY affiliate_referral_codes_update ON "affiliate_referral_codes" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY affiliate_referral_codes_no_delete ON "affiliate_referral_codes" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "affiliate_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY affiliate_links_select ON "affiliate_links" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("organization_id")
    OR app.can_country("country_id")
  );

CREATE POLICY affiliate_links_insert ON "affiliate_links" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY affiliate_links_update ON "affiliate_links" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_org("organization_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY affiliate_links_no_delete ON "affiliate_links" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "affiliate_clicks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_clicks" FORCE ROW LEVEL SECURITY;

CREATE POLICY affiliate_clicks_select ON "affiliate_clicks" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("organization_id")
    OR app.can_country("country_id")
  );

CREATE POLICY affiliate_clicks_insert ON "affiliate_clicks" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
  );

CREATE POLICY affiliate_clicks_no_update ON "affiliate_clicks" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY affiliate_clicks_no_delete ON "affiliate_clicks" FOR DELETE TO worldpharma_app
  USING (false);
