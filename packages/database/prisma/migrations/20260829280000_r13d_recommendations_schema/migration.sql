-- R13-D: Deterministic commerce co-occurrence rollup (catalog item pairs only)

CREATE TABLE "analytics_order_item_pairs" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "item_a_id" UUID NOT NULL,
    "item_b_id" UUID NOT NULL,
    "pair_count" INTEGER NOT NULL DEFAULT 0,
    "rule_version" TEXT NOT NULL DEFAULT 'rules_v1',
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_order_item_pairs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_order_item_pairs_country_id_item_a_id_item_b_id_rule_version_key"
  ON "analytics_order_item_pairs"("country_id", "item_a_id", "item_b_id", "rule_version");

CREATE INDEX "analytics_order_item_pairs_country_id_item_a_id_pair_count_idx"
  ON "analytics_order_item_pairs"("country_id", "item_a_id", "pair_count");

CREATE INDEX "analytics_order_item_pairs_country_id_item_b_id_pair_count_idx"
  ON "analytics_order_item_pairs"("country_id", "item_b_id", "pair_count");

ALTER TABLE "analytics_order_item_pairs" ADD CONSTRAINT "analytics_order_item_pairs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
