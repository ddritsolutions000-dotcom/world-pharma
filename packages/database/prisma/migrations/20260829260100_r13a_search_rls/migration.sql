-- R13-A: FORCE RLS on search_index_jobs; tighten catalog_search_documents SELECT (PD-R13-03)

ALTER TABLE "search_index_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "search_index_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY search_index_jobs_select ON "search_index_jobs" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
  );

CREATE POLICY search_index_jobs_insert ON "search_index_jobs" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY search_index_jobs_update ON "search_index_jobs" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY search_index_jobs_no_delete ON "search_index_jobs" FOR DELETE TO worldpharma_app
  USING (false);

-- Tighten catalog search documents: published-only for auth/user; country-scoped for users
DROP POLICY IF EXISTS catalog_search_documents_sel ON "catalog_search_documents";
DROP POLICY IF EXISTS catalog_search_documents_ins ON "catalog_search_documents";
DROP POLICY IF EXISTS catalog_search_documents_upd ON "catalog_search_documents";
DROP POLICY IF EXISTS catalog_search_documents_del ON "catalog_search_documents";

CREATE POLICY catalog_search_documents_select ON "catalog_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.actor_kind() = 'auth' AND app.actor_present())
    OR (published = true AND app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

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

CREATE POLICY catalog_search_documents_no_delete ON "catalog_search_documents" FOR DELETE TO worldpharma_app
  USING (false);
