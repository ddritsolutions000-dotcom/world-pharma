-- R14-B CR-289: allow country-scoped admin writes on settlement_import_schedules

DROP POLICY IF EXISTS settlement_import_schedules_access ON settlement_import_schedules;

CREATE POLICY settlement_import_schedules_access ON settlement_import_schedules TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
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
