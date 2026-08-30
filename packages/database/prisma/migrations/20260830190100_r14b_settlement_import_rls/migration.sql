-- R14-B CR-285: RLS for settlement import staging

ALTER TABLE "settlement_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_import_batches" FORCE ROW LEVEL SECURITY;

ALTER TABLE "settlement_import_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_import_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY settlement_import_batches_access ON settlement_import_batches TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY settlement_import_records_access ON settlement_import_records TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.company_scope() IN ('country', 'region', 'legal_entity', 'platform')
      AND app.can_country(country_id)
    )
  )
  WITH CHECK (app.is_worker() OR app.is_platform());

GRANT SELECT, INSERT, UPDATE, DELETE ON settlement_import_batches TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON settlement_import_records TO worldpharma_app;
