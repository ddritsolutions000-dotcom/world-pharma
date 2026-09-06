-- Sprint 41 RLS + grants

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "product_duplicate_candidates" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pharmacy_catalog_import_batches" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pharmacy_catalog_import_rows" TO worldpharma_app;

ALTER TABLE "product_duplicate_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_duplicate_candidates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_catalog_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_catalog_import_batches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_catalog_import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pharmacy_catalog_import_rows" FORCE ROW LEVEL SECURITY;

CREATE POLICY "product_duplicate_candidates_platform" ON "product_duplicate_candidates"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY "pharmacy_catalog_import_batches_platform" ON "pharmacy_catalog_import_batches"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY "pharmacy_catalog_import_rows_platform" ON "pharmacy_catalog_import_rows"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

-- Vendor can read/write own import batches
CREATE POLICY "pharmacy_catalog_import_batches_seller" ON "pharmacy_catalog_import_batches"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND "seller_org_id" = ANY(app.org_ids())
  )
  WITH CHECK (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND "seller_org_id" = ANY(app.org_ids())
  );

CREATE POLICY "pharmacy_catalog_import_rows_seller" ON "pharmacy_catalog_import_rows"
  AS PERMISSIVE FOR ALL TO worldpharma_app
  USING (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM pharmacy_catalog_import_batches b
      WHERE b.id = "batch_id"
        AND b.seller_org_id = ANY(app.org_ids())
    )
  )
  WITH CHECK (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM pharmacy_catalog_import_batches b
      WHERE b.id = "batch_id"
        AND b.seller_org_id = ANY(app.org_ids())
    )
  );
