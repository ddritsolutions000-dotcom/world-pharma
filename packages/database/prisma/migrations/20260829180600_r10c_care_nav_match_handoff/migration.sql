-- R10-C: provider matching + appointment handoff

ALTER TYPE "CareNavSessionStatus" ADD VALUE IF NOT EXISTS 'MATCHED' AFTER 'TRIAGED';

ALTER TABLE "care_navigation_sessions"
  ADD COLUMN IF NOT EXISTS "matched_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "appointment_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "care_navigation_sessions_appointment_id_key"
  ON "care_navigation_sessions"("appointment_id")
  WHERE "appointment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "care_navigation_sessions_appointment_id_idx"
  ON "care_navigation_sessions"("appointment_id");

ALTER TABLE "care_navigation_sessions"
  ADD CONSTRAINT "care_navigation_sessions_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
