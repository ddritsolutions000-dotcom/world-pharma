-- Sprint 41: product duplicate candidates + pharmacy catalog import boundary

CREATE TYPE "ProductDuplicateStatus" AS ENUM (
  'POSSIBLE_DUPLICATE', 'DISMISSED', 'CONFIRMED_DISTINCT'
);

CREATE TYPE "PharmacyCatalogImportStatus" AS ENUM (
  'RECEIVED', 'VALIDATING', 'ACCEPTED', 'REJECTED', 'PARTIAL'
);

CREATE TYPE "PharmacyCatalogImportRowStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'REJECTED', 'DUPLICATE'
);

CREATE TABLE "product_duplicate_candidates" (
    "id"             UUID NOT NULL,
    "country_id"     UUID NOT NULL,
    "item_id"        UUID NOT NULL,
    "match_item_id"  UUID NOT NULL,
    "match_keys"     JSONB NOT NULL DEFAULT '[]',
    "status"         "ProductDuplicateStatus" NOT NULL DEFAULT 'POSSIBLE_DUPLICATE',
    "reviewed_by_id" UUID,
    "reviewed_at"    TIMESTAMPTZ,
    "notes"          TEXT,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "product_duplicate_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_duplicate_candidates_item_id_match_item_id_key" UNIQUE ("item_id", "match_item_id")
);
CREATE INDEX "product_duplicate_candidates_country_id_status_idx"
    ON "product_duplicate_candidates"("country_id", "status");
ALTER TABLE "product_duplicate_candidates"
    ADD CONSTRAINT "product_duplicate_candidates_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pharmacy_catalog_import_batches" (
    "id"              UUID NOT NULL,
    "seller_org_id"   UUID NOT NULL,
    "country_id"      UUID NOT NULL,
    "source_id"       TEXT NOT NULL,
    "source_version"  TEXT NOT NULL,
    "status"          "PharmacyCatalogImportStatus" NOT NULL DEFAULT 'RECEIVED',
    "imported_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_by_id"   UUID,
    "accepted_count"  INTEGER NOT NULL DEFAULT 0,
    "rejected_count"  INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pharmacy_catalog_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pharmacy_catalog_import_batches_seller_org_id_source_id_source_version_key"
        UNIQUE ("seller_org_id", "source_id", "source_version")
);
CREATE INDEX "pharmacy_catalog_import_batches_country_id_status_idx"
    ON "pharmacy_catalog_import_batches"("country_id", "status");
ALTER TABLE "pharmacy_catalog_import_batches"
    ADD CONSTRAINT "pharmacy_catalog_import_batches_seller_org_id_fkey"
    FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pharmacy_catalog_import_batches"
    ADD CONSTRAINT "pharmacy_catalog_import_batches_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pharmacy_catalog_import_rows" (
    "id"              UUID NOT NULL,
    "batch_id"        UUID NOT NULL,
    "source_row_key"  TEXT NOT NULL,
    "product_id"      TEXT,
    "sku"             TEXT,
    "price_minor"     BIGINT,
    "currency"        CHAR(3),
    "stock_qty"       INTEGER,
    "country_code"    CHAR(2),
    "payload"         JSONB NOT NULL DEFAULT '{}',
    "status"          "PharmacyCatalogImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reasons"  JSONB NOT NULL DEFAULT '[]',
    "offer_id"        UUID,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pharmacy_catalog_import_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pharmacy_catalog_import_rows_batch_id_source_row_key_key" UNIQUE ("batch_id", "source_row_key")
);
CREATE INDEX "pharmacy_catalog_import_rows_batch_id_status_idx"
    ON "pharmacy_catalog_import_rows"("batch_id", "status");
ALTER TABLE "pharmacy_catalog_import_rows"
    ADD CONSTRAINT "pharmacy_catalog_import_rows_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "pharmacy_catalog_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
