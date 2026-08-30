-- R13-E: least-privilege grants for analytics rollup tables

GRANT SELECT, INSERT, UPDATE, DELETE ON "analytics_daily_country_metrics" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "analytics_daily_product_metrics" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "analytics_daily_marketing_metrics" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "analytics_ingest_cursors" TO worldpharma_app;
