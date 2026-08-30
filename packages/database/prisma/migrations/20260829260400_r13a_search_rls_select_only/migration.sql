-- R13-A fix: PD-R13-03 tightens SELECT only; preserve user/worker catalog index writes

DROP POLICY IF EXISTS catalog_search_documents_insert ON "catalog_search_documents";
DROP POLICY IF EXISTS catalog_search_documents_update ON "catalog_search_documents";

CREATE POLICY catalog_search_documents_insert ON "catalog_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() IN ('user', 'worker')
  );

CREATE POLICY catalog_search_documents_update ON "catalog_search_documents" FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() = 'user'
  )
  WITH CHECK (
    app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() = 'user'
  );
