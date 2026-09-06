CREATE TABLE "customer_care_plan_memberships" (
  "id" UUID NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "plan_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sandbox" BOOLEAN NOT NULL DEFAULT TRUE,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "cancelled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_care_plan_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_care_plan_memberships_customer_person_id_country_id_key"
  ON "customer_care_plan_memberships"("customer_person_id", "country_id");

CREATE INDEX "customer_care_plan_memberships_country_id_status_idx"
  ON "customer_care_plan_memberships"("country_id", "status");

ALTER TABLE "customer_care_plan_memberships"
  ADD CONSTRAINT "customer_care_plan_memberships_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_care_plan_memberships"
  ADD CONSTRAINT "customer_care_plan_memberships_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
