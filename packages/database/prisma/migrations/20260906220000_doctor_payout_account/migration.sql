CREATE TYPE "DoctorPayoutMethod" AS ENUM ('BANK', 'UPI');

CREATE TABLE "doctor_payout_accounts" (
  "id" UUID NOT NULL,
  "doctor_profile_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "method" "DoctorPayoutMethod" NOT NULL DEFAULT 'BANK',
  "account_holder_name" TEXT NOT NULL,
  "bank_name" TEXT,
  "account_number_masked" TEXT,
  "ifsc_or_routing" TEXT,
  "upi_id_masked" TEXT,
  "verified_sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "doctor_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_payout_accounts_doctor_profile_id_key" ON "doctor_payout_accounts"("doctor_profile_id");
CREATE INDEX "doctor_payout_accounts_person_id_idx" ON "doctor_payout_accounts"("person_id");

ALTER TABLE "doctor_payout_accounts"
  ADD CONSTRAINT "doctor_payout_accounts_doctor_profile_id_fkey"
  FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "doctor_payout_accounts" TO worldpharma_app;
