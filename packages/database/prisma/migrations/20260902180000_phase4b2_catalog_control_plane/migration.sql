CREATE TYPE "HealthPackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "CarePlanCatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

CREATE TABLE "health_packages" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "original_price_minor" INTEGER,
  "currency" CHAR(3) NOT NULL,
  "tests_count" INTEGER NOT NULL DEFAULT 0,
  "requires_fasting" BOOLEAN NOT NULL DEFAULT true,
  "report_turnaround" TEXT,
  "is_popular" BOOLEAN NOT NULL DEFAULT false,
  "suitable_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "age_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "included_services" JSONB NOT NULL DEFAULT '[]',
  "eligibility_notes" TEXT,
  "validity_days" INTEGER,
  "status" "HealthPackageStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "health_packages_country_id_code_key" ON "health_packages"("country_id", "code");
CREATE INDEX "health_packages_country_id_status_category_idx" ON "health_packages"("country_id", "status", "category");

ALTER TABLE "health_packages"
  ADD CONSTRAINT "health_packages_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "care_plan_definitions" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "plan_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "price_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "period" TEXT NOT NULL DEFAULT 'year',
  "discount_bps" INTEGER NOT NULL DEFAULT 0,
  "free_delivery" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "perks" JSONB NOT NULL DEFAULT '[]',
  "eligibility_notes" TEXT,
  "effective_from" TIMESTAMPTZ,
  "effective_to" TIMESTAMPTZ,
  "status" "CarePlanCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_plan_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "care_plan_definitions_country_id_plan_code_key"
  ON "care_plan_definitions"("country_id", "plan_code");
CREATE INDEX "care_plan_definitions_country_id_status_idx"
  ON "care_plan_definitions"("country_id", "status");

ALTER TABLE "care_plan_definitions"
  ADD CONSTRAINT "care_plan_definitions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "serviceability_zones" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "postal_prefix" TEXT,
  "postal_from" TEXT,
  "postal_to" TEXT,
  "city" TEXT,
  "region" TEXT,
  "medicine_delivery" BOOLEAN NOT NULL DEFAULT true,
  "lab_home_collection" BOOLEAN NOT NULL DEFAULT false,
  "express_delivery" BOOLEAN NOT NULL DEFAULT false,
  "cod_available" BOOLEAN NOT NULL DEFAULT false,
  "carrier_code" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "serviceability_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "serviceability_zones_country_id_active_priority_idx"
  ON "serviceability_zones"("country_id", "active", "priority");

ALTER TABLE "serviceability_zones"
  ADD CONSTRAINT "serviceability_zones_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "medicine_substitute_edges" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "from_item_id" UUID NOT NULL,
  "to_item_id" UUID NOT NULL,
  "relationship_type" TEXT NOT NULL,
  "strength" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "effective_from" TIMESTAMPTZ,
  "effective_to" TIMESTAMPTZ,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "medicine_substitute_edges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "medicine_substitute_edges_country_id_from_item_id_to_item_id_relationship_type_key"
  ON "medicine_substitute_edges"("country_id", "from_item_id", "to_item_id", "relationship_type");
CREATE INDEX "medicine_substitute_edges_country_id_from_item_id_active_idx"
  ON "medicine_substitute_edges"("country_id", "from_item_id", "active");

ALTER TABLE "medicine_substitute_edges"
  ADD CONSTRAINT "medicine_substitute_edges_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medicine_substitute_edges"
  ADD CONSTRAINT "medicine_substitute_edges_from_item_id_fkey"
  FOREIGN KEY ("from_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medicine_substitute_edges"
  ADD CONSTRAINT "medicine_substitute_edges_to_item_id_fkey"
  FOREIGN KEY ("to_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "health_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_plan_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "serviceability_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medicine_substitute_edges" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_packages_worker_select" ON "health_packages"
  FOR SELECT USING (true);
CREATE POLICY "care_plan_definitions_worker_select" ON "care_plan_definitions"
  FOR SELECT USING (true);
CREATE POLICY "serviceability_zones_worker_select" ON "serviceability_zones"
  FOR SELECT USING (true);
CREATE POLICY "medicine_substitute_edges_worker_select" ON "medicine_substitute_edges"
  FOR SELECT USING (true);
