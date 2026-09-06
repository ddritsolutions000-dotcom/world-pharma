-- Customer medication dose reminders (wellness UX — not clinical instructions)

CREATE TABLE "medication_reminders" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "medicine_label" TEXT NOT NULL,
  "prescription_id" UUID,
  "schedule_times" TEXT[] NOT NULL,
  "days_of_week" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "medication_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "medication_reminders_person_id_country_id_enabled_idx"
  ON "medication_reminders"("person_id", "country_id", "enabled");
CREATE INDEX "medication_reminders_person_id_country_id_deleted_at_idx"
  ON "medication_reminders"("person_id", "country_id", "deleted_at");

ALTER TABLE "medication_reminders"
  ADD CONSTRAINT "medication_reminders_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "medication_reminders"
  ADD CONSTRAINT "medication_reminders_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "medication_reminders"
  ADD CONSTRAINT "medication_reminders_prescription_id_fkey"
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
