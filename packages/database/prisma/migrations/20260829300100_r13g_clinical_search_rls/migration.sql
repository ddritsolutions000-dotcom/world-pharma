-- R13-G: FORCE RLS on clinical search documents (deny-by-default; no USING(true))

ALTER TABLE "clinical_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_search_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY clinical_search_documents_select ON "clinical_search_documents" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (published = true AND app.can_person("person_id"))
  );

CREATE POLICY clinical_search_documents_insert ON "clinical_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY clinical_search_documents_update ON "clinical_search_documents" FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY clinical_search_documents_no_delete ON "clinical_search_documents" FOR DELETE TO worldpharma_app
  USING (false);
