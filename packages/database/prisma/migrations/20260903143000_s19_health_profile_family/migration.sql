-- Sprint 19: customer health profile + family health subject tagging

CREATE TYPE "HealthAllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN');
CREATE TYPE "HealthConditionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESOLVED');

ALTER TABLE "customer_family_members"
  ADD COLUMN "health_access_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "appointments"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "prescriptions"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "lab_bookings"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "imaging_bookings"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "health_artifacts"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "health_timeline_events"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "medication_reminders"
  ADD COLUMN "subject_family_member_id" UUID;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_bookings"
  ADD CONSTRAINT "lab_bookings_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_bookings"
  ADD CONSTRAINT "imaging_bookings_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "health_artifacts"
  ADD CONSTRAINT "health_artifacts_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "health_timeline_events"
  ADD CONSTRAINT "health_timeline_events_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "medication_reminders"
  ADD CONSTRAINT "medication_reminders_subject_family_member_id_fkey"
  FOREIGN KEY ("subject_family_member_id") REFERENCES "customer_family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "appointments_subject_family_member_id_idx" ON "appointments"("subject_family_member_id");
CREATE INDEX "prescriptions_subject_family_member_id_idx" ON "prescriptions"("subject_family_member_id");
CREATE INDEX "lab_bookings_subject_family_member_id_idx" ON "lab_bookings"("subject_family_member_id");
CREATE INDEX "imaging_bookings_subject_family_member_id_idx" ON "imaging_bookings"("subject_family_member_id");
CREATE INDEX "health_artifacts_subject_family_member_id_idx" ON "health_artifacts"("subject_family_member_id");
CREATE INDEX "health_timeline_events_subject_family_member_id_idx" ON "health_timeline_events"("subject_family_member_id");
CREATE INDEX "medication_reminders_subject_family_member_id_idx" ON "medication_reminders"("subject_family_member_id");

CREATE TABLE "customer_health_profiles" (
  "id" UUID NOT NULL,
  "owner_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "family_member_id" UUID,
  "blood_type" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "customer_health_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_health_profiles_family_member_id_key"
  ON "customer_health_profiles"("family_member_id");

CREATE UNIQUE INDEX "customer_health_profiles_owner_country_self_key"
  ON "customer_health_profiles"("owner_person_id", "country_id")
  WHERE "family_member_id" IS NULL;

CREATE INDEX "customer_health_profiles_owner_person_id_country_id_idx"
  ON "customer_health_profiles"("owner_person_id", "country_id");

ALTER TABLE "customer_health_profiles"
  ADD CONSTRAINT "customer_health_profiles_owner_person_id_fkey"
  FOREIGN KEY ("owner_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_health_profiles"
  ADD CONSTRAINT "customer_health_profiles_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_health_profiles"
  ADD CONSTRAINT "customer_health_profiles_family_member_id_fkey"
  FOREIGN KEY ("family_member_id") REFERENCES "customer_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_health_allergies" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "allergen" TEXT NOT NULL,
  "reaction" TEXT,
  "severity" "HealthAllergySeverity" NOT NULL DEFAULT 'UNKNOWN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "customer_health_allergies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_health_allergies_profile_id_active_idx"
  ON "customer_health_allergies"("profile_id", "active");

ALTER TABLE "customer_health_allergies"
  ADD CONSTRAINT "customer_health_allergies_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "customer_health_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_health_conditions" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "condition" TEXT NOT NULL,
  "status" "HealthConditionStatus" NOT NULL DEFAULT 'ACTIVE',
  "diagnosed_at" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "customer_health_conditions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_health_conditions_profile_id_status_idx"
  ON "customer_health_conditions"("profile_id", "status");

ALTER TABLE "customer_health_conditions"
  ADD CONSTRAINT "customer_health_conditions_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "customer_health_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_health_vitals" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "height_cm" DOUBLE PRECISION,
  "weight_kg" DOUBLE PRECISION,
  "blood_pressure_systolic" INTEGER,
  "blood_pressure_diastolic" INTEGER,
  "pulse_bpm" INTEGER,
  "temperature_celsius" DOUBLE PRECISION,
  "recorded_at" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_health_vitals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_health_vitals_profile_id_recorded_at_idx"
  ON "customer_health_vitals"("profile_id", "recorded_at" DESC);

ALTER TABLE "customer_health_vitals"
  ADD CONSTRAINT "customer_health_vitals_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "customer_health_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_health_emergency_contacts" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "customer_health_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_health_emergency_contacts_profile_id_key"
  ON "customer_health_emergency_contacts"("profile_id");

ALTER TABLE "customer_health_emergency_contacts"
  ADD CONSTRAINT "customer_health_emergency_contacts_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "customer_health_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "customer_health_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_allergies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_conditions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_vitals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_emergency_contacts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_health_profiles_select ON "customer_health_profiles"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_person("owner_person_id"));

CREATE POLICY customer_health_profiles_insert ON "customer_health_profiles"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.can_person("owner_person_id"));

CREATE POLICY customer_health_profiles_update ON "customer_health_profiles"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_person("owner_person_id"))
  WITH CHECK (app.is_platform() OR app.is_worker() OR app.can_person("owner_person_id"));

CREATE POLICY customer_health_profiles_delete ON "customer_health_profiles"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_person("owner_person_id"));

CREATE POLICY customer_health_allergies_select ON "customer_health_allergies"
  FOR SELECT TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_allergies_insert ON "customer_health_allergies"
  FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_allergies_update ON "customer_health_allergies"
  FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  )
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_allergies_delete ON "customer_health_allergies"
  FOR DELETE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_conditions_select ON "customer_health_conditions"
  FOR SELECT TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_conditions_insert ON "customer_health_conditions"
  FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_conditions_update ON "customer_health_conditions"
  FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  )
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_conditions_delete ON "customer_health_conditions"
  FOR DELETE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_vitals_select ON "customer_health_vitals"
  FOR SELECT TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_vitals_insert ON "customer_health_vitals"
  FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_vitals_update ON "customer_health_vitals"
  FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  )
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_vitals_delete ON "customer_health_vitals"
  FOR DELETE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_emergency_contacts_select ON "customer_health_emergency_contacts"
  FOR SELECT TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_emergency_contacts_insert ON "customer_health_emergency_contacts"
  FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_emergency_contacts_update ON "customer_health_emergency_contacts"
  FOR UPDATE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  )
  WITH CHECK (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

CREATE POLICY customer_health_emergency_contacts_delete ON "customer_health_emergency_contacts"
  FOR DELETE TO worldpharma_app
  USING (
    app.is_platform() OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM "customer_health_profiles" p
      WHERE p.id = profile_id AND app.can_person(p.owner_person_id)
    )
  );

ALTER TABLE "customer_health_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_allergies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_conditions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_vitals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_health_emergency_contacts" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "customer_health_profiles" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "customer_health_allergies" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "customer_health_conditions" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "customer_health_vitals" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "customer_health_emergency_contacts" TO worldpharma_app;
