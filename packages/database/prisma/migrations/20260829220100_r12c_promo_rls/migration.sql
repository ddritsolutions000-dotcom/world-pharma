-- R12-C: replace permissive promo RLS (TD-R12-PLAN-05)

ALTER TABLE "promo_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_campaigns" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_campaigns_app_all" ON "promo_campaigns";

CREATE POLICY promo_campaigns_select ON "promo_campaigns" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR ("country_id" IS NOT NULL AND app.can_country("country_id"))
  );

CREATE POLICY promo_campaigns_insert ON "promo_campaigns" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND "country_id" IS NOT NULL
    AND app.can_country("country_id")
  );

CREATE POLICY promo_campaigns_update ON "promo_campaigns" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND "country_id" IS NOT NULL
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND "country_id" IS NOT NULL
    AND app.can_country("country_id")
  );

CREATE POLICY promo_campaigns_no_delete ON "promo_campaigns" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "promo_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_applications" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_applications_app_all" ON "promo_applications";

CREATE POLICY promo_applications_select ON "promo_applications" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = promo_applications.session_id
        AND app.can_person(cs.customer_person_id)
    )
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      JOIN promo_campaigns pc ON pc.id = promo_applications.campaign_id
      WHERE cs.id = promo_applications.session_id
        AND pc.country_id IS NOT NULL
        AND app.can_country(pc.country_id)
    )
  );

CREATE POLICY promo_applications_insert ON "promo_applications" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = promo_applications.session_id
        AND app.can_person(cs.customer_person_id)
    )
  );

CREATE POLICY promo_applications_no_update ON "promo_applications" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY promo_applications_no_delete ON "promo_applications" FOR DELETE TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = promo_applications.session_id
        AND app.can_person(cs.customer_person_id)
    )
  );
