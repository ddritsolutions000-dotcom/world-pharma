-- R10-A: care navigation FORCE RLS (no USING(true))

ALTER TABLE "care_navigation_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_navigation_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_navigation_sessions_select ON "care_navigation_sessions" FOR SELECT TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR app.is_worker()
    OR app.is_platform()
  );

CREATE POLICY care_navigation_sessions_insert ON "care_navigation_sessions" FOR INSERT TO worldpharma_app
  WITH CHECK (app.can_person("person_id"));

CREATE POLICY care_navigation_sessions_update ON "care_navigation_sessions" FOR UPDATE TO worldpharma_app
  USING (app.is_worker() OR app.is_platform())
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY care_navigation_sessions_no_delete ON "care_navigation_sessions" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "care_navigation_session_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_navigation_session_answers" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_navigation_session_answers_select ON "care_navigation_session_answers" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "care_navigation_sessions" s
      WHERE s.id = session_id
        AND (app.can_person(s.person_id) OR app.is_worker() OR app.is_platform())
    )
  );

CREATE POLICY care_navigation_session_answers_insert ON "care_navigation_session_answers" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY care_navigation_session_answers_no_update ON "care_navigation_session_answers" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY care_navigation_session_answers_no_delete ON "care_navigation_session_answers" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "care_triage_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_triage_assessments" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_triage_assessments_select ON "care_triage_assessments" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "care_navigation_sessions" s
      WHERE s.id = session_id
        AND (app.can_person(s.person_id) OR app.is_worker() OR app.is_platform())
    )
  );

CREATE POLICY care_triage_assessments_insert ON "care_triage_assessments" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY care_triage_assessments_no_update ON "care_triage_assessments" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY care_triage_assessments_no_delete ON "care_triage_assessments" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "care_match_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_match_recommendations" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_match_recommendations_select ON "care_match_recommendations" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "care_navigation_sessions" s
      WHERE s.id = session_id
        AND (app.can_person(s.person_id) OR app.is_worker() OR app.is_platform())
    )
  );

CREATE POLICY care_match_recommendations_insert ON "care_match_recommendations" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY care_match_recommendations_no_update ON "care_match_recommendations" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY care_match_recommendations_no_delete ON "care_match_recommendations" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "care_nav_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_nav_audits" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_nav_audits_select ON "care_nav_audits" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "care_navigation_sessions" s
      WHERE s.id = session_id
        AND (app.can_person(s.person_id) OR app.is_worker() OR app.is_platform())
    )
  );

CREATE POLICY care_nav_audits_insert ON "care_nav_audits" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform() OR app.actor_present());

CREATE POLICY care_nav_audits_no_update ON "care_nav_audits" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY care_nav_audits_no_delete ON "care_nav_audits" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "care_navigation_sessions" TO worldpharma_app;
GRANT SELECT, INSERT ON "care_navigation_session_answers" TO worldpharma_app;
GRANT SELECT, INSERT ON "care_triage_assessments" TO worldpharma_app;
GRANT SELECT, INSERT ON "care_match_recommendations" TO worldpharma_app;
GRANT SELECT, INSERT ON "care_nav_audits" TO worldpharma_app;
