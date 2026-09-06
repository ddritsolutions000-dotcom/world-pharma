-- Saved family / ordering-for profiles (not separate clinical identities)

CREATE TABLE "customer_family_members" (
  "id" UUID NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "display_name" TEXT NOT NULL,
  "relationship_code" TEXT NOT NULL DEFAULT 'OTHER',
  "age_years" INTEGER,
  "phone" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "customer_family_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_family_members_customer_person_id_country_id_deleted_at_idx"
  ON "customer_family_members"("customer_person_id", "country_id", "deleted_at");

ALTER TABLE "customer_family_members"
  ADD CONSTRAINT "customer_family_members_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_family_members"
  ADD CONSTRAINT "customer_family_members_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
