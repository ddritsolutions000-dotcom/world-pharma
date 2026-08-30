-- Additive MNC operating scope: regions, legal entities, optional dimensions.
-- No backfill of invented legal/country values. Historical money rows are unchanged.

ALTER TYPE "MembershipScope" ADD VALUE IF NOT EXISTS 'region';
ALTER TYPE "MembershipScope" ADD VALUE IF NOT EXISTS 'legal_entity';

CREATE TYPE "OperatingRegionStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LegalEntityStatus" AS ENUM ('CONFIGURED', 'INACTIVE');

CREATE TABLE "operating_regions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "status" "OperatingRegionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "operating_regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operating_regions_code_key" ON "operating_regions"("code");

CREATE TABLE "legal_entities" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "incorporation_country_id" UUID,
    "region_id" UUID,
    "operating_currency" CHAR(3),
    "timezone" TEXT,
    "status" "LegalEntityStatus" NOT NULL DEFAULT 'CONFIGURED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_entities_code_key" ON "legal_entities"("code");
CREATE INDEX "legal_entities_region_id_status_idx" ON "legal_entities"("region_id", "status");

CREATE TABLE "business_units" (
    "id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "business_units_code_key" ON "business_units"("code");

ALTER TABLE "countries" ADD COLUMN "region_id" UUID;
ALTER TABLE "organizations" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "organizations" ADD COLUMN "region_id" UUID;
ALTER TABLE "organizations" ADD COLUMN "timezone" TEXT;
ALTER TABLE "organizations" ADD COLUMN "locale" TEXT;
ALTER TABLE "organizations" ADD COLUMN "operating_currency" CHAR(3);
ALTER TABLE "locations" ADD COLUMN "region_id" UUID;
ALTER TABLE "memberships" ADD COLUMN "region_id" UUID;
ALTER TABLE "memberships" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "payment_gateway_accounts" ADD COLUMN "country_id" UUID;
ALTER TABLE "payment_gateway_accounts" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "carrier_accounts" ADD COLUMN "country_id" UUID;
ALTER TABLE "carrier_accounts" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "carrier_accounts" ADD COLUMN "region_id" UUID;
ALTER TABLE "ledger_accounts" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "journals" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "outbox_events" ADD COLUMN "region_id" UUID;
ALTER TABLE "outbox_events" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "outbox_events" ADD COLUMN "organization_id" UUID;
ALTER TABLE "carts" ADD COLUMN "currency" CHAR(3);
ALTER TABLE "payment_intents" ADD COLUMN "legal_entity_id" UUID;
ALTER TABLE "orders" ADD COLUMN "legal_entity_id" UUID;

ALTER TABLE "legal_entities"
  ADD CONSTRAINT "legal_entities_incorporation_country_id_fkey"
  FOREIGN KEY ("incorporation_country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_entities"
  ADD CONSTRAINT "legal_entities_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "countries"
  ADD CONSTRAINT "countries_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locations"
  ADD CONSTRAINT "locations_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_gateway_accounts"
  ADD CONSTRAINT "payment_gateway_accounts_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_gateway_accounts"
  ADD CONSTRAINT "payment_gateway_accounts_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "carrier_accounts"
  ADD CONSTRAINT "carrier_accounts_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "carrier_accounts"
  ADD CONSTRAINT "carrier_accounts_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "carrier_accounts"
  ADD CONSTRAINT "carrier_accounts_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journals"
  ADD CONSTRAINT "journals_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "operating_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payment_gateway_accounts_country_id_active_idx" ON "payment_gateway_accounts"("country_id", "active");
CREATE INDEX "payment_gateway_accounts_legal_entity_id_active_idx" ON "payment_gateway_accounts"("legal_entity_id", "active");
CREATE INDEX "carrier_accounts_country_id_active_idx" ON "carrier_accounts"("country_id", "active");
CREATE INDEX "carrier_accounts_legal_entity_id_active_idx" ON "carrier_accounts"("legal_entity_id", "active");
CREATE INDEX "ledger_accounts_legal_entity_id_code_idx" ON "ledger_accounts"("legal_entity_id", "code");
CREATE INDEX "outbox_events_region_id_created_at_idx" ON "outbox_events"("region_id", "created_at");
CREATE INDEX "outbox_events_legal_entity_id_created_at_idx" ON "outbox_events"("legal_entity_id", "created_at");
