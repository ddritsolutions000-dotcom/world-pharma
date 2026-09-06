-- Sprint 20: enrich catalog search documents for medicine discovery filters/sort.
ALTER TABLE "catalog_search_documents"
  ADD COLUMN IF NOT EXISTS "rx_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "min_sell_minor" BIGINT,
  ADD COLUMN IF NOT EXISTS "max_discount_pct" INTEGER,
  ADD COLUMN IF NOT EXISTS "avg_rating" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "review_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "manufacturer_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "composition" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "catalog_search_documents_country_published_rx_idx"
  ON "catalog_search_documents" ("country_id", "published", "rx_required");

CREATE INDEX IF NOT EXISTS "catalog_search_documents_country_published_price_idx"
  ON "catalog_search_documents" ("country_id", "published", "min_sell_minor");
