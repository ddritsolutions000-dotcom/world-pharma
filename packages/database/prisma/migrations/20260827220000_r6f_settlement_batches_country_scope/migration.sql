-- R6-F: Tighten settlement_batches company-scope reads with can_country via period.
-- Seller can_org path unchanged. Writes remain platform/worker only.
-- Additive policy replace only — no table/column changes.

DROP POLICY IF EXISTS settlement_batches_access ON settlement_batches;
CREATE POLICY settlement_batches_access ON settlement_batches TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM settlement_lines sl
      WHERE sl.batch_id = settlement_batches.id
        AND app.can_org(sl.seller_org_id)
    )
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND EXISTS (
        SELECT 1 FROM settlement_periods sp
        WHERE sp.id = settlement_batches.period_id
          AND app.can_country(sp.country_id)
      )
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());
