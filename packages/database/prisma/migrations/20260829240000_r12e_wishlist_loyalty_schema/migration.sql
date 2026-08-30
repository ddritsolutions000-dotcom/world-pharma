-- R12-E: wishlist + loyalty stub tables

CREATE TYPE "LoyaltyProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "LoyaltyLedgerEntryKind" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

CREATE TABLE "wishlist_items" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "catalog_offer_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_programs" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "LoyaltyProgramStatus" NOT NULL DEFAULT 'DRAFT',
  "points_per_currency_minor" INTEGER NOT NULL DEFAULT 100,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_accounts" (
  "id" UUID NOT NULL,
  "program_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_ledger_entries" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "kind" "LoyaltyLedgerEntryKind" NOT NULL,
  "points_delta" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "order_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wishlist_items_person_id_country_id_catalog_offer_id_key"
  ON "wishlist_items"("person_id", "country_id", "catalog_offer_id");
CREATE INDEX "wishlist_items_person_id_country_id_created_at_idx"
  ON "wishlist_items"("person_id", "country_id", "created_at");

CREATE UNIQUE INDEX "loyalty_programs_country_id_code_key" ON "loyalty_programs"("country_id", "code");
CREATE INDEX "loyalty_programs_country_id_status_idx" ON "loyalty_programs"("country_id", "status");

CREATE UNIQUE INDEX "loyalty_accounts_program_id_person_id_key" ON "loyalty_accounts"("program_id", "person_id");
CREATE INDEX "loyalty_accounts_person_id_country_id_idx" ON "loyalty_accounts"("person_id", "country_id");

CREATE UNIQUE INDEX "loyalty_ledger_entries_source_source_key_kind_key"
  ON "loyalty_ledger_entries"("source", "source_key", "kind");
CREATE INDEX "loyalty_ledger_entries_account_id_created_at_idx"
  ON "loyalty_ledger_entries"("account_id", "created_at");

ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_catalog_offer_id_fkey"
  FOREIGN KEY ("catalog_offer_id") REFERENCES "catalog_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
