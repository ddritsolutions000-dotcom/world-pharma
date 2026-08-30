-- R13-E: Analytics foundation rollup tables (non-clinical)

CREATE TABLE "analytics_daily_country_metrics" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "order_paid_count" INTEGER NOT NULL DEFAULT 0,
    "order_gmv_minor" BIGINT NOT NULL DEFAULT 0,
    "checkout_started_count" INTEGER NOT NULL DEFAULT 0,
    "cart_abandoned_count" INTEGER NOT NULL DEFAULT 0,
    "affiliate_click_count" INTEGER NOT NULL DEFAULT 0,
    "appointment_completed_count" INTEGER NOT NULL DEFAULT 0,
    "lab_booking_completed_count" INTEGER NOT NULL DEFAULT 0,
    "imaging_booking_completed_count" INTEGER NOT NULL DEFAULT 0,
    "product_view_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_country_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_daily_product_metrics" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "add_to_cart_count" INTEGER NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_product_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_daily_marketing_metrics" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "campaign_send_count" INTEGER NOT NULL DEFAULT 0,
    "marketing_opt_in_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_marketing_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_ingest_cursors" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "feed_kind" TEXT NOT NULL,
    "watermark_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_ingest_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_daily_country_metrics_country_id_metric_date_key"
  ON "analytics_daily_country_metrics"("country_id", "metric_date");

CREATE INDEX "analytics_daily_country_metrics_country_id_metric_date_idx"
  ON "analytics_daily_country_metrics"("country_id", "metric_date");

CREATE UNIQUE INDEX "analytics_daily_product_metrics_country_id_catalog_item_id_metric_date_key"
  ON "analytics_daily_product_metrics"("country_id", "catalog_item_id", "metric_date");

CREATE INDEX "analytics_daily_product_metrics_country_id_metric_date_idx"
  ON "analytics_daily_product_metrics"("country_id", "metric_date");

CREATE UNIQUE INDEX "analytics_daily_marketing_metrics_country_id_metric_date_key"
  ON "analytics_daily_marketing_metrics"("country_id", "metric_date");

CREATE INDEX "analytics_daily_marketing_metrics_country_id_metric_date_idx"
  ON "analytics_daily_marketing_metrics"("country_id", "metric_date");

CREATE UNIQUE INDEX "analytics_ingest_cursors_country_id_feed_kind_key"
  ON "analytics_ingest_cursors"("country_id", "feed_kind");

ALTER TABLE "analytics_daily_country_metrics" ADD CONSTRAINT "analytics_daily_country_metrics_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_daily_product_metrics" ADD CONSTRAINT "analytics_daily_product_metrics_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_daily_marketing_metrics" ADD CONSTRAINT "analytics_daily_marketing_metrics_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytics_ingest_cursors" ADD CONSTRAINT "analytics_ingest_cursors_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
