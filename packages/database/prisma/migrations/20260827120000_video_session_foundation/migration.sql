CREATE TYPE "VideoSessionStatus" AS ENUM (
  'CREATED', 'READY', 'DOCTOR_JOINED', 'CUSTOMER_JOINED', 'IN_PROGRESS', 'ENDED', 'FAILED', 'EXPIRED'
);
CREATE TYPE "VideoParticipantRole" AS ENUM ('DOCTOR', 'CUSTOMER');

CREATE TABLE "video_sessions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "encounter_id" UUID,
    "country_id" UUID NOT NULL,
    "doctor_profile_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_room_id" TEXT NOT NULL,
    "status" "VideoSessionStatus" NOT NULL DEFAULT 'CREATED',
    "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
    "doctor_joined_at" TIMESTAMPTZ,
    "customer_joined_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "failure_category" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "video_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "video_sessions_recording_off" CHECK ("recording_enabled" = false)
);

CREATE TABLE "video_join_audits" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "role" "VideoParticipantRole" NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason_category" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_join_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_webhook_receipts" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "session_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_webhook_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_sessions_appointment_id_key" ON "video_sessions"("appointment_id");
CREATE UNIQUE INDEX "video_webhook_receipts_event_id_key" ON "video_webhook_receipts"("event_id");
CREATE INDEX "video_sessions_doctor_profile_id_status_idx" ON "video_sessions"("doctor_profile_id", "status");
CREATE INDEX "video_sessions_customer_person_id_status_idx" ON "video_sessions"("customer_person_id", "status");
CREATE INDEX "video_sessions_country_id_status_idx" ON "video_sessions"("country_id", "status");
CREATE INDEX "video_sessions_status_expires_at_idx" ON "video_sessions"("status", "expires_at");
CREATE INDEX "video_join_audits_session_id_created_at_idx" ON "video_join_audits"("session_id", "created_at");
CREATE INDEX "video_join_audits_actor_person_id_created_at_idx" ON "video_join_audits"("actor_person_id", "created_at");
CREATE INDEX "video_webhook_receipts_provider_created_at_idx" ON "video_webhook_receipts"("provider", "created_at");

ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_join_audits" ADD CONSTRAINT "video_join_audits_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "video_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_join_audits" ADD CONSTRAINT "video_join_audits_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_webhook_receipts" ADD CONSTRAINT "video_webhook_receipts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "video_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "video_sessions_tenant" ON "video_sessions" USING (true) WITH CHECK (true);

ALTER TABLE "video_join_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_join_audits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "video_join_audits_tenant" ON "video_join_audits" USING (true) WITH CHECK (true);

ALTER TABLE "video_webhook_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_webhook_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "video_webhook_receipts_tenant" ON "video_webhook_receipts" USING (true) WITH CHECK (true);
