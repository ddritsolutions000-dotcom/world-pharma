-- R6-F: Break settlement_batches ↔ settlement_periods RLS recursion.
-- Company-scope batch reads use SECURITY DEFINER country lookup (can_country).
-- Seller can_org path unchanged. Writes remain platform/worker only.

CREATE OR REPLACE FUNCTION app.settlement_period_country(p_period_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT country_id FROM settlement_periods WHERE id = p_period_id;
$$;

GRANT EXECUTE ON FUNCTION app.settlement_period_country(uuid) TO worldpharma_app;

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
      AND app.can_country(app.settlement_period_country(period_id))
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());
