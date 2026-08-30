-- Align inventory_lots SELECT with inventory_balances: workers and platform admins
-- must read lots for checkout reservation and admin inventory operations.
DROP POLICY IF EXISTS inventory_lots_access ON inventory_lots;
CREATE POLICY inventory_lots_access ON inventory_lots TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("owner_org_id")
    OR app.can_location("location_id")
    OR (
      app.can_country("country_id")
      AND app.company_scope() IN ('platform', 'country', 'region', 'legal_entity')
    )
  )
  WITH CHECK (app.write_org("owner_org_id"));
