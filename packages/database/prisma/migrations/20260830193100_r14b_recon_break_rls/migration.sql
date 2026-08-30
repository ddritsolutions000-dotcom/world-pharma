-- R14-B CR-287: replace permissive finance reconciliation RLS with country scope

ALTER TABLE "finance_reconciliations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_reconciliations_app_all" ON "finance_reconciliations";
DROP POLICY IF EXISTS finance_reconciliations_access ON "finance_reconciliations";

CREATE POLICY finance_reconciliations_access ON finance_reconciliations TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR country_id IS NULL
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

ALTER TABLE "finance_recon_break_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance_recon_break_actions" FORCE ROW LEVEL SECURITY;

CREATE POLICY finance_recon_break_actions_access ON finance_recon_break_actions TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1
      FROM finance_reconciliations fr
      WHERE fr.id = finance_recon_break_actions.recon_id
        AND (
          fr.country_id IS NULL
          OR (
            app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
            AND app.can_country(fr.country_id)
          )
        )
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

GRANT SELECT, INSERT, UPDATE, DELETE ON finance_recon_break_actions TO worldpharma_app;
