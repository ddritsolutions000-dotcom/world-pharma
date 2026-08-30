-- R10-D: care navigation governance (match set versioning + append-only overrides)

ALTER TABLE "care_navigation_sessions"
  ADD COLUMN IF NOT EXISTS "match_set_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "care_match_recommendations"
  ADD COLUMN IF NOT EXISTS "set_version" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "care_match_recommendations_session_id_idx";
CREATE INDEX "care_match_recommendations_session_id_set_version_idx"
  ON "care_match_recommendations" ("session_id", "set_version");

CREATE TABLE "care_nav_overrides" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "actor_person_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "prior_state" JSONB NOT NULL,
  "new_state" JSONB NOT NULL,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_nav_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "care_nav_overrides_session_id_idempotency_key_key"
  ON "care_nav_overrides" ("session_id", "idempotency_key");

CREATE INDEX "care_nav_overrides_session_id_created_at_idx"
  ON "care_nav_overrides" ("session_id", "created_at" DESC);

ALTER TABLE "care_nav_overrides"
  ADD CONSTRAINT "care_nav_overrides_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "care_navigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "care_nav_overrides"
  ADD CONSTRAINT "care_nav_overrides_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_nav_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_nav_overrides" FORCE ROW LEVEL SECURITY;

CREATE POLICY care_nav_overrides_select ON "care_nav_overrides" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "care_navigation_sessions" s
      WHERE s.id = session_id
        AND (app.can_person(s.person_id) OR app.is_worker() OR app.is_platform())
    )
  );

CREATE POLICY care_nav_overrides_insert ON "care_nav_overrides" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform() OR app.actor_present());

CREATE POLICY care_nav_overrides_no_update ON "care_nav_overrides" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY care_nav_overrides_no_delete ON "care_nav_overrides" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT ON "care_nav_overrides" TO worldpharma_app;
