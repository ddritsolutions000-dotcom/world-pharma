-- R13-C: FORCE RLS on provider search documents (no USING(true))

ALTER TABLE "provider_doctor_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_doctor_search_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "provider_lab_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_lab_search_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "provider_test_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_test_search_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "provider_pharmacy_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_pharmacy_search_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_doctor_search_documents_select ON "provider_doctor_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.actor_kind() = 'auth' AND app.actor_present())
    OR (published = true AND app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY provider_doctor_search_documents_insert ON "provider_doctor_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY provider_doctor_search_documents_update ON "provider_doctor_search_documents" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user')
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user');

CREATE POLICY provider_doctor_search_documents_no_delete ON "provider_doctor_search_documents" FOR DELETE TO worldpharma_app
  USING (false);

CREATE POLICY provider_lab_search_documents_select ON "provider_lab_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.actor_kind() = 'auth' AND app.actor_present())
    OR (published = true AND app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY provider_lab_search_documents_insert ON "provider_lab_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY provider_lab_search_documents_update ON "provider_lab_search_documents" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user')
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user');

CREATE POLICY provider_lab_search_documents_no_delete ON "provider_lab_search_documents" FOR DELETE TO worldpharma_app
  USING (false);

CREATE POLICY provider_test_search_documents_select ON "provider_test_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.actor_kind() = 'auth' AND app.actor_present())
    OR (published = true AND app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY provider_test_search_documents_insert ON "provider_test_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY provider_test_search_documents_update ON "provider_test_search_documents" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user')
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user');

CREATE POLICY provider_test_search_documents_no_delete ON "provider_test_search_documents" FOR DELETE TO worldpharma_app
  USING (false);

CREATE POLICY provider_pharmacy_search_documents_select ON "provider_pharmacy_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.actor_kind() = 'auth' AND app.actor_present())
    OR (published = true AND app.actor_kind() = 'user' AND app.can_country("country_id"))
  );

CREATE POLICY provider_pharmacy_search_documents_insert ON "provider_pharmacy_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY provider_pharmacy_search_documents_update ON "provider_pharmacy_search_documents" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user')
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.actor_kind() = 'user');

CREATE POLICY provider_pharmacy_search_documents_no_delete ON "provider_pharmacy_search_documents" FOR DELETE TO worldpharma_app
  USING (false);
