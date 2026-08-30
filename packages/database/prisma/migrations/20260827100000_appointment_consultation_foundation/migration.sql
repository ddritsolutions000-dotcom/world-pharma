CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'ONLINE');
CREATE TYPE "AppointmentStatus" AS ENUM (
  'REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED',
  'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'FAILED'
);
CREATE TYPE "EncounterStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "doctor_availability_windows" (
    "id" UUID NOT NULL,
    "doctor_profile_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_local" TEXT NOT NULL,
    "end_local" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "doctor_availability_windows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doctor_availability_exceptions" (
    "id" UUID NOT NULL,
    "doctor_profile_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_availability_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "doctor_profile_id" UUID NOT NULL,
    "doctor_partner_id" UUID NOT NULL,
    "organization_id" UUID,
    "location_id" UUID,
    "timezone" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason_category" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by_person_id" UUID,
    "cancel_reason_code" TEXT,
    "reschedule_of_id" UUID,
    "video_session_ref" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_time_ok" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "appointment_status_history" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "actor_person_id" UUID,
    "reason" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointment_schedule_revisions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "timezone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_person_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointment_schedule_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "doctor_profile_id" UUID NOT NULL,
    "doctor_partner_id" UUID NOT NULL,
    "organization_id" UUID,
    "status" "EncounterStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "video_session_ref" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "encounters_appointment_id_key" ON "encounters"("appointment_id");
CREATE INDEX "doctor_availability_windows_doctor_profile_id_weekday_is_active_idx" ON "doctor_availability_windows"("doctor_profile_id", "weekday", "is_active");
CREATE INDEX "doctor_availability_windows_country_id_idx" ON "doctor_availability_windows"("country_id");
CREATE INDEX "doctor_availability_exceptions_doctor_profile_id_starts_at_ends_at_idx" ON "doctor_availability_exceptions"("doctor_profile_id", "starts_at", "ends_at");
CREATE INDEX "appointments_doctor_profile_id_starts_at_idx" ON "appointments"("doctor_profile_id", "starts_at");
CREATE INDEX "appointments_customer_person_id_starts_at_idx" ON "appointments"("customer_person_id", "starts_at");
CREATE INDEX "appointments_organization_id_starts_at_idx" ON "appointments"("organization_id", "starts_at");
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");
CREATE INDEX "appointments_country_id_status_idx" ON "appointments"("country_id", "status");
CREATE INDEX "appointment_status_history_appointment_id_created_at_idx" ON "appointment_status_history"("appointment_id", "created_at");
CREATE INDEX "appointment_schedule_revisions_appointment_id_created_at_idx" ON "appointment_schedule_revisions"("appointment_id", "created_at");
CREATE INDEX "encounters_doctor_profile_id_started_at_idx" ON "encounters"("doctor_profile_id", "started_at");
CREATE INDEX "encounters_customer_person_id_started_at_idx" ON "encounters"("customer_person_id", "started_at");
CREATE INDEX "encounters_country_id_status_idx" ON "encounters"("country_id", "status");

ALTER TABLE "doctor_availability_windows" ADD CONSTRAINT "doctor_availability_windows_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_availability_windows" ADD CONSTRAINT "doctor_availability_windows_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_availability_exceptions" ADD CONSTRAINT "doctor_availability_exceptions_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_availability_exceptions" ADD CONSTRAINT "doctor_availability_exceptions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_partner_id_fkey" FOREIGN KEY ("doctor_partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_schedule_revisions" ADD CONSTRAINT "appointment_schedule_revisions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_profile_id_fkey" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap"
EXCLUDE USING gist (
  doctor_profile_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status IN ('REQUESTED','CONFIRMED','RESCHEDULE_REQUESTED','RESCHEDULED','CHECKED_IN','IN_CONSULTATION'));

ALTER TABLE "doctor_availability_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_availability_windows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_availability_windows_tenant" ON "doctor_availability_windows" USING (true) WITH CHECK (true);

ALTER TABLE "doctor_availability_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_availability_exceptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_availability_exceptions_tenant" ON "doctor_availability_exceptions" USING (true) WITH CHECK (true);

ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appointments_tenant" ON "appointments" USING (true) WITH CHECK (true);

ALTER TABLE "appointment_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_status_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appointment_status_history_tenant" ON "appointment_status_history" USING (true) WITH CHECK (true);

ALTER TABLE "appointment_schedule_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_schedule_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "appointment_schedule_revisions_tenant" ON "appointment_schedule_revisions" USING (true) WITH CHECK (true);

ALTER TABLE "encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounters" FORCE ROW LEVEL SECURITY;
CREATE POLICY "encounters_tenant" ON "encounters" USING (true) WITH CHECK (true);
