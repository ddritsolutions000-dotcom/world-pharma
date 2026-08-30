-- R10-A: care navigation kernel schema

CREATE TABLE "care_navigation_sessions" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "status" "CareNavSessionStatus" NOT NULL DEFAULT 'DRAFT',
  "chief_complaint_summary" TEXT,
  "urgency" "CareUrgencyLevel",
  "specialty_code" TEXT,
  "red_flag" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "terminated_at" TIMESTAMPTZ,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_navigation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_navigation_session_answers" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "question_key" TEXT NOT NULL,
  "answer_text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_navigation_session_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_triage_assessments" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "rules_version" TEXT NOT NULL,
  "urgency" "CareUrgencyLevel" NOT NULL,
  "red_flag" BOOLEAN NOT NULL,
  "specialty_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "explanation_key" TEXT NOT NULL,
  "emergency_guidance_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_triage_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_match_recommendations" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "doctor_profile_id" UUID,
  "rank" INTEGER NOT NULL,
  "explanation_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_match_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_nav_audits" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "actor_person_id" UUID,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_nav_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "care_navigation_sessions_person_id_created_at_idx"
  ON "care_navigation_sessions"("person_id", "created_at" DESC);
CREATE INDEX "care_navigation_sessions_country_id_status_idx"
  ON "care_navigation_sessions"("country_id", "status");
CREATE INDEX "care_navigation_session_answers_session_id_idx"
  ON "care_navigation_session_answers"("session_id");
CREATE UNIQUE INDEX "care_navigation_session_answers_session_question_uidx"
  ON "care_navigation_session_answers"("session_id", "question_key");
CREATE INDEX "care_triage_assessments_session_id_idx"
  ON "care_triage_assessments"("session_id");
CREATE INDEX "care_match_recommendations_session_id_idx"
  ON "care_match_recommendations"("session_id");
CREATE INDEX "care_nav_audits_session_id_created_at_idx"
  ON "care_nav_audits"("session_id", "created_at");

ALTER TABLE "care_navigation_sessions"
  ADD CONSTRAINT "care_navigation_sessions_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_navigation_sessions"
  ADD CONSTRAINT "care_navigation_sessions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_navigation_session_answers"
  ADD CONSTRAINT "care_navigation_session_answers_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "care_navigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "care_triage_assessments"
  ADD CONSTRAINT "care_triage_assessments_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "care_navigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "care_match_recommendations"
  ADD CONSTRAINT "care_match_recommendations_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "care_navigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "care_nav_audits"
  ADD CONSTRAINT "care_nav_audits_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "care_navigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_nav_audits"
  ADD CONSTRAINT "care_nav_audits_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
