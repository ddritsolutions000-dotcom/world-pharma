-- R13-E: FORCE RLS on analytics rollup tables (no USING(true))

ALTER TABLE "analytics_daily_country_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_country_metrics" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_product_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_product_metrics" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_marketing_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_marketing_metrics" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics_ingest_cursors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_ingest_cursors" FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_daily_country_metrics_select ON "analytics_daily_country_metrics" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY analytics_daily_country_metrics_insert ON "analytics_daily_country_metrics" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_country_metrics_update ON "analytics_daily_country_metrics" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_country_metrics_no_delete ON "analytics_daily_country_metrics" FOR DELETE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_product_metrics_select ON "analytics_daily_product_metrics" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY analytics_daily_product_metrics_insert ON "analytics_daily_product_metrics" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_product_metrics_update ON "analytics_daily_product_metrics" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_product_metrics_no_delete ON "analytics_daily_product_metrics" FOR DELETE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_marketing_metrics_select ON "analytics_daily_marketing_metrics" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY analytics_daily_marketing_metrics_insert ON "analytics_daily_marketing_metrics" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_marketing_metrics_update ON "analytics_daily_marketing_metrics" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_daily_marketing_metrics_no_delete ON "analytics_daily_marketing_metrics" FOR DELETE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_ingest_cursors_select ON "analytics_ingest_cursors" FOR SELECT TO worldpharma_app
  USING (app.is_worker() OR app.is_platform());

CREATE POLICY analytics_ingest_cursors_insert ON "analytics_ingest_cursors" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_ingest_cursors_update ON "analytics_ingest_cursors" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_ingest_cursors_no_delete ON "analytics_ingest_cursors" FOR DELETE TO worldpharma_app
  USING (false);
