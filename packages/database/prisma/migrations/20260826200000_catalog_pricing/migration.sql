-- Phase 1A catalog + pricing. Additive. Does not alter Phase 0 tables.

CREATE TYPE "CatalogItemKind" AS ENUM ('MEDICINE', 'OTC', 'DEVICE', 'CONSUMABLE', 'BUNDLE');
CREATE TYPE "CatalogLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED', 'ARCHIVED');
CREATE TYPE "RegulatedClass" AS ENUM ('UNCLASSIFIED', 'OTC', 'RX', 'CONTROLLED', 'DEVICE');
CREATE TYPE "OfferOwnership" AS ENUM ('PLATFORM_OWNED', 'VENDOR_OWNED', 'MARKETPLACE');
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "CatalogAssetKind" AS ENUM ('IMAGE', 'DOCUMENT');
CREATE TYPE "CommercialChannel" AS ENUM ('OWNED_PHARMACY', 'MARKETPLACE');

CREATE TABLE "catalog_brands" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "catalog_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_brands_slug_key" ON "catalog_brands"("slug");

CREATE TABLE "catalog_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_categories_parent_id_slug_key" ON "catalog_categories"("parent_id", "slug");
CREATE INDEX "catalog_categories_parent_id_sort_order_idx" ON "catalog_categories"("parent_id", "sort_order");

CREATE TABLE "catalog_category_i18n" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "catalog_category_i18n_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_category_i18n_category_id_locale_key" ON "catalog_category_i18n"("category_id", "locale");

CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CatalogItemKind" NOT NULL,
    "status" "CatalogLifecycle" NOT NULL DEFAULT 'DRAFT',
    "brand_id" UUID,
    "category_id" UUID,
    "created_by_org_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "published_at" TIMESTAMPTZ,
    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_items_slug_key" ON "catalog_items"("slug");
CREATE INDEX "catalog_items_status_category_id_idx" ON "catalog_items"("status", "category_id");
CREATE INDEX "catalog_items_brand_id_idx" ON "catalog_items"("brand_id");

CREATE TABLE "catalog_item_i18n" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "catalog_item_i18n_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_item_i18n_item_id_locale_key" ON "catalog_item_i18n"("item_id", "locale");

CREATE TABLE "catalog_assets" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" "CatalogAssetKind" NOT NULL DEFAULT 'IMAGE',
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "locale" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "catalog_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalog_assets_item_id_sort_order_idx" ON "catalog_assets"("item_id", "sort_order");

CREATE TABLE "catalog_item_countries" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "regulated_class" "RegulatedClass" NOT NULL DEFAULT 'UNCLASSIFIED',
    "rx_required" BOOLEAN NOT NULL DEFAULT false,
    "max_qty_per_order" INTEGER,
    "legal_name" TEXT,
    "compliance_note" TEXT,
    CONSTRAINT "catalog_item_countries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_item_countries_item_id_country_id_key" ON "catalog_item_countries"("item_id", "country_id");
CREATE INDEX "catalog_item_countries_country_id_available_idx" ON "catalog_item_countries"("country_id", "available");

CREATE TABLE "catalog_variants" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "sku_code" TEXT NOT NULL,
    "pack_size" TEXT NOT NULL,
    "strength" TEXT,
    "uom" TEXT NOT NULL DEFAULT 'each',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "catalog_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_variants_sku_code_key" ON "catalog_variants"("sku_code");
CREATE INDEX "catalog_variants_item_id_idx" ON "catalog_variants"("item_id");

CREATE TABLE "catalog_offers" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "seller_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "location_id" UUID,
    "ownership" "OfferOwnership" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "published_at" TIMESTAMPTZ,
    CONSTRAINT "catalog_offers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_offers_variant_id_seller_org_id_country_id_key" ON "catalog_offers"("variant_id", "seller_org_id", "country_id");
CREATE INDEX "catalog_offers_country_id_status_seller_org_id_idx" ON "catalog_offers"("country_id", "status", "seller_org_id");
CREATE INDEX "catalog_offers_seller_org_id_status_idx" ON "catalog_offers"("seller_org_id", "status");

CREATE TABLE "price_versions" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cost_minor" BIGINT NOT NULL,
    "list_minor" BIGINT,
    "sell_minor" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "price_versions_offer_id_version_key" ON "price_versions"("offer_id", "version");
CREATE INDEX "price_versions_offer_id_is_current_valid_from_idx" ON "price_versions"("offer_id", "is_current", "valid_from");

CREATE TABLE "commercial_rules" (
    "id" UUID NOT NULL,
    "country_id" UUID,
    "seller_org_id" UUID,
    "category_id" UUID,
    "item_id" UUID,
    "variant_id" UUID,
    "channel" "CommercialChannel",
    "take_bps" INTEGER NOT NULL DEFAULT 0,
    "take_flat_minor" BIGINT NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commercial_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "commercial_rules_country_id_seller_org_id_valid_from_idx" ON "commercial_rules"("country_id", "seller_org_id", "valid_from");

CREATE TABLE "catalog_search_documents" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sku_codes" TEXT NOT NULL DEFAULT '',
    "brand_name" TEXT NOT NULL DEFAULT '',
    "category_name" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "catalog_search_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_search_documents_item_id_country_id_locale_key" ON "catalog_search_documents"("item_id", "country_id", "locale");
CREATE INDEX "catalog_search_documents_country_id_published_idx" ON "catalog_search_documents"("country_id", "published");

ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_category_i18n" ADD CONSTRAINT "catalog_category_i18n_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "catalog_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_org_id_fkey" FOREIGN KEY ("created_by_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_item_i18n" ADD CONSTRAINT "catalog_item_i18n_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_assets" ADD CONSTRAINT "catalog_assets_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_item_countries" ADD CONSTRAINT "catalog_item_countries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_item_countries" ADD CONSTRAINT "catalog_item_countries_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_offers" ADD CONSTRAINT "catalog_offers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_offers" ADD CONSTRAINT "catalog_offers_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_offers" ADD CONSTRAINT "catalog_offers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_offers" ADD CONSTRAINT "catalog_offers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "catalog_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_search_documents" ADD CONSTRAINT "catalog_search_documents_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_non_negative" CHECK ("cost_minor" >= 0 AND "sell_minor" >= 0 AND ("list_minor" IS NULL OR "list_minor" >= 0));
ALTER TABLE "commercial_rules" ADD CONSTRAINT "commercial_rules_take_non_negative" CHECK ("take_bps" >= 0 AND "take_flat_minor" >= 0);

ALTER TABLE "catalog_brands" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_brands_app_all" ON "catalog_brands" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_categories_app_all" ON "catalog_categories" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_category_i18n" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_category_i18n_app_all" ON "catalog_category_i18n" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_items_app_all" ON "catalog_items" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_item_i18n" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_item_i18n_app_all" ON "catalog_item_i18n" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_assets_app_all" ON "catalog_assets" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_item_countries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_item_countries_app_all" ON "catalog_item_countries" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_variants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_variants_app_all" ON "catalog_variants" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_offers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_offers_app_all" ON "catalog_offers" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "price_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_versions_app_all" ON "price_versions" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "commercial_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commercial_rules_app_all" ON "commercial_rules" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "catalog_search_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_search_documents_app_all" ON "catalog_search_documents" FOR ALL USING (true) WITH CHECK (true);
