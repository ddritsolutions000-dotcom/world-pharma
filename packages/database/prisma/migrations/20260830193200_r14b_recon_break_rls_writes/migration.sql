-- R14-B CR-287: allow country-scoped finance break workflow writes

DROP POLICY IF EXISTS finance_reconciliations_access ON finance_reconciliations;

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
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (
      country_id IS NOT NULL
      AND app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  );

DROP POLICY IF EXISTS finance_recon_break_actions_access ON finance_recon_break_actions;

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
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1
      FROM finance_reconciliations fr
      WHERE fr.id = finance_recon_break_actions.recon_id
        AND fr.country_id IS NOT NULL
        AND app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
        AND app.can_country(fr.country_id)
    )
  );
