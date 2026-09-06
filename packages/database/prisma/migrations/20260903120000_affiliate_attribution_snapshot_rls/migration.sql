-- Sprint 8: restore checkout affiliate attribution RLS (legacy cart_checkout debt after multi_tenant purge)

ALTER TABLE "affiliate_attribution_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_attribution_snapshots" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_attribution_snapshots_app_all" ON "affiliate_attribution_snapshots";

CREATE POLICY affiliate_attribution_snapshots_select ON "affiliate_attribution_snapshots" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = affiliate_attribution_snapshots.session_id
        AND app.can_person(cs.customer_person_id)
    )
    OR EXISTS (
      SELECT 1 FROM affiliate_referral_codes arc
      WHERE arc.code = affiliate_attribution_snapshots.affiliate_code
        AND app.can_org(arc.organization_id)
    )
  );

CREATE POLICY affiliate_attribution_snapshots_insert ON "affiliate_attribution_snapshots" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = affiliate_attribution_snapshots.session_id
        AND app.can_person(cs.customer_person_id)
    )
  );

CREATE POLICY affiliate_attribution_snapshots_no_update ON "affiliate_attribution_snapshots" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY affiliate_attribution_snapshots_delete ON "affiliate_attribution_snapshots" FOR DELETE TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM checkout_sessions cs
      WHERE cs.id = affiliate_attribution_snapshots.session_id
        AND app.can_person(cs.customer_person_id)
    )
  );

-- Allow affiliate org operators to read their commission liabilities (read-only portal)

DROP POLICY IF EXISTS affiliate_liabilities_access ON "affiliate_liabilities";

CREATE POLICY affiliate_liabilities_select ON "affiliate_liabilities" FOR SELECT TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR app.can_person((SELECT o.customer_person_id FROM orders o WHERE o.id = affiliate_liabilities.order_id))
    OR EXISTS (
      SELECT 1 FROM affiliate_referral_codes arc
      WHERE arc.code = affiliate_liabilities.affiliate_code
        AND app.can_org(arc.organization_id)
    )
  );

CREATE POLICY affiliate_liabilities_insert ON "affiliate_liabilities" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY affiliate_liabilities_update ON "affiliate_liabilities" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY affiliate_liabilities_no_delete ON "affiliate_liabilities" FOR DELETE TO worldpharma_app
  USING (false);
