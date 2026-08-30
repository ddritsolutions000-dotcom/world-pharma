-- R12-F: FORCE RLS on reviews, Q&A, personalization

ALTER TABLE "product_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_reviews" FORCE ROW LEVEL SECURITY;

CREATE POLICY product_reviews_select ON "product_reviews" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR (
      app.can_person("author_person_id")
      AND status IN ('SUBMITTED', 'APPROVED', 'REJECTED')
    )
    OR status = 'APPROVED'
  );

CREATE POLICY product_reviews_insert ON "product_reviews" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("author_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY product_reviews_update ON "product_reviews" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY product_reviews_no_delete ON "product_reviews" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "product_review_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_review_responses" FORCE ROW LEVEL SECURITY;

CREATE POLICY product_review_responses_select ON "product_review_responses" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM product_reviews pr
      WHERE pr.id = product_review_responses.review_id
        AND (app.can_country(pr.country_id) OR pr.status = 'APPROVED')
    )
  );

CREATE POLICY product_review_responses_insert ON "product_review_responses" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker() OR app.is_platform()
  );

CREATE POLICY product_review_responses_no_update ON "product_review_responses" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY product_review_responses_no_delete ON "product_review_responses" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "product_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_questions" FORCE ROW LEVEL SECURITY;

CREATE POLICY product_questions_select ON "product_questions" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR (
      app.can_person("author_person_id")
      AND status IN ('SUBMITTED', 'APPROVED', 'REJECTED')
    )
    OR status = 'APPROVED'
  );

CREATE POLICY product_questions_insert ON "product_questions" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("author_person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY product_questions_update ON "product_questions" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY product_questions_no_delete ON "product_questions" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "personalization_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "personalization_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY personalization_events_select ON "personalization_events" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR (person_id IS NOT NULL AND app.can_person("person_id"))
  );

CREATE POLICY personalization_events_insert ON "personalization_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR (person_id IS NOT NULL AND app.can_person("person_id")))
    AND app.can_country("country_id")
  );

CREATE POLICY personalization_events_no_update ON "personalization_events" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY personalization_events_no_delete ON "personalization_events" FOR DELETE TO worldpharma_app
  USING (false);
