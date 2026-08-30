-- R13-D: FORCE RLS on analytics_order_item_pairs (no USING(true))

ALTER TABLE "analytics_order_item_pairs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_order_item_pairs" FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_order_item_pairs_select ON "analytics_order_item_pairs" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.actor_kind() = 'auth' AND app.actor_present())
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY analytics_order_item_pairs_insert ON "analytics_order_item_pairs" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_order_item_pairs_update ON "analytics_order_item_pairs" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY analytics_order_item_pairs_no_delete ON "analytics_order_item_pairs" FOR DELETE TO worldpharma_app
  USING (false);
