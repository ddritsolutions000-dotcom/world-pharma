-- R11-A: CMS FORCE RLS (no USING(true) on clinical/support data)

ALTER TABLE "cms_content_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_items_select ON "cms_content_items" FOR SELECT TO worldpharma_app
  USING (app.is_worker() OR app.is_platform());

CREATE POLICY cms_content_items_insert ON "cms_content_items" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_items_update ON "cms_content_items" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_items_no_delete ON "cms_content_items" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "cms_content_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_revisions_select ON "cms_content_revisions" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "cms_content_items" i
      WHERE i.id = content_item_id
        AND (app.is_worker() OR app.is_platform())
        AND app.can_country(i.country_id)
    )
  );

CREATE POLICY cms_content_revisions_insert ON "cms_content_revisions" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "cms_content_items" i
      WHERE i.id = content_item_id
        AND (app.is_worker() OR app.is_platform())
        AND app.can_country(i.country_id)
    )
  );

CREATE POLICY cms_content_revisions_no_update ON "cms_content_revisions" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY cms_content_revisions_no_delete ON "cms_content_revisions" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "cms_content_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_publications" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_publications_select ON "cms_content_publications" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "cms_content_items" i
      WHERE i.id = content_item_id
        AND (
          (app.is_worker() OR app.is_platform())
          OR i.status = 'PUBLISHED'
        )
        AND (
          app.is_platform()
          OR app.is_worker()
          OR app.can_country(i.country_id)
        )
    )
  );

CREATE POLICY cms_content_publications_insert ON "cms_content_publications" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "cms_content_items" i
      WHERE i.id = content_item_id
        AND (app.is_worker() OR app.is_platform())
        AND app.can_country(i.country_id)
    )
  );

CREATE POLICY cms_content_publications_no_update ON "cms_content_publications" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY cms_content_publications_no_delete ON "cms_content_publications" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "cms_content_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_assets_select ON "cms_content_assets" FOR SELECT TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_assets_insert ON "cms_content_assets" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_assets_no_update ON "cms_content_assets" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY cms_content_assets_no_delete ON "cms_content_assets" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "cms_content_search_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_search_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_search_documents_select ON "cms_content_search_documents" FOR SELECT TO worldpharma_app
  USING (
    (published = true AND app.can_country("country_id"))
    OR app.is_worker()
    OR app.is_platform()
  );

CREATE POLICY cms_content_search_documents_insert ON "cms_content_search_documents" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_search_documents_update ON "cms_content_search_documents" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY cms_content_search_documents_no_delete ON "cms_content_search_documents" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "cms_content_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms_content_audits" FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_content_audits_select ON "cms_content_audits" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "cms_content_items" i
      WHERE i.id = content_item_id
        AND (app.is_worker() OR app.is_platform())
        AND app.can_country(i.country_id)
    )
  );

CREATE POLICY cms_content_audits_insert ON "cms_content_audits" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.actor_present()
  );

CREATE POLICY cms_content_audits_no_update ON "cms_content_audits" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY cms_content_audits_no_delete ON "cms_content_audits" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "cms_content_items" TO worldpharma_app;
GRANT SELECT, INSERT ON "cms_content_revisions" TO worldpharma_app;
GRANT SELECT, INSERT ON "cms_content_publications" TO worldpharma_app;
GRANT SELECT, INSERT ON "cms_content_assets" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "cms_content_search_documents" TO worldpharma_app;
GRANT SELECT, INSERT ON "cms_content_audits" TO worldpharma_app;
