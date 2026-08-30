-- R13-A fix: restore catalog_search_documents write path for platform/user with country scope

DROP POLICY IF EXISTS catalog_search_documents_insert ON "catalog_search_documents";
DROP POLICY IF EXISTS catalog_search_documents_update ON "catalog_search_documents";

CREATE POLICY catalog_search_documents_insert ON "catalog_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform()
    OR app.is_worker()
    OR (app.actor_kind() IN ('user', 'worker') AND app.can_country("country_id"))
  );

CREATE POLICY catalog_search_documents_update ON "catalog_search_documents" FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  )
  WITH CHECK (
    app.is_platform()
    OR app.is_worker()
    OR (app.actor_kind() = 'user' AND app.can_country("country_id"))
  );
