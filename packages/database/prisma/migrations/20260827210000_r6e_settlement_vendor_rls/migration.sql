-- R6-E: Seller-scoped SELECT on settlement lines + linked batch/period reads.
-- Writes remain platform/worker (company finance settlement ops).
-- Application layer keeps live_payout / real bank transfer OFF.
-- Additive only — no table/column changes.

DROP POLICY IF EXISTS settlement_lines_access ON settlement_lines;
CREATE POLICY settlement_lines_access ON settlement_lines TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org(seller_org_id)
    OR EXISTS (
      SELECT 1 FROM vendor_payables vp
      WHERE vp.id = settlement_lines.vendor_payable_id
        AND app.can_country(vp.country_id)
        AND app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

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
    OR app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

DROP POLICY IF EXISTS settlement_periods_access ON settlement_periods;
CREATE POLICY settlement_periods_access ON settlement_periods TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1
      FROM settlement_batches sb
      JOIN settlement_lines sl ON sl.batch_id = sb.id
      WHERE sb.period_id = settlement_periods.id
        AND app.can_org(sl.seller_org_id)
    )
    OR (
      app.can_country(country_id)
      AND app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

DROP POLICY IF EXISTS settlement_policies_access ON settlement_policies;
CREATE POLICY settlement_policies_access ON settlement_policies TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.can_country(country_id)
      AND app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());
