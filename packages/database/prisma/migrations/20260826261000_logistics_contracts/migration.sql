-- Additive 1F contracts: unique provider ref, quotes, adjustments, RTO, logistics jobs.

CREATE UNIQUE INDEX IF NOT EXISTS "shipments_provider_ref_key" ON "shipments"("provider_ref");

CREATE TABLE "shipping_quotes" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "origin_iso2" TEXT NOT NULL,
  "dest_iso2" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "customer_charge_minor" BIGINT NOT NULL,
  "carrier_quote_cost_minor" BIGINT,
  "platform_subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "vendor_subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "service_level" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipping_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shipping_quotes_country_id_created_at_idx" ON "shipping_quotes"("country_id","created_at");

CREATE TABLE "carrier_cost_adjustments" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "amount_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_cost_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "carrier_cost_adjustments_shipment_id_created_at_idx" ON "carrier_cost_adjustments"("shipment_id","created_at");

CREATE TABLE "return_shipments" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "carrier_code" TEXT NOT NULL,
  "tracking_number" TEXT,
  "reason" TEXT NOT NULL,
  "cost_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  "disposition" "ReturnDisposition" NOT NULL DEFAULT 'QUARANTINE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_shipments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "return_shipments_shipment_id_key" ON "return_shipments"("shipment_id");

CREATE TYPE "LogisticsJobStatus" AS ENUM ('CREATED','ASSIGNED','PICKUP','IN_PROGRESS','DELIVERED','FAILED','RETURNED');

CREATE TABLE "logistics_jobs" (
  "id" UUID NOT NULL,
  "shipment_id" UUID,
  "job_type" "LogisticsJobType" NOT NULL,
  "status" "LogisticsJobStatus" NOT NULL DEFAULT 'CREATED',
  "assignee_id" UUID,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "logistics_jobs_job_type_status_idx" ON "logistics_jobs"("job_type","status");

CREATE TABLE "logistics_job_events" (
  "id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_job_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "logistics_job_events_job_id_created_at_idx" ON "logistics_job_events"("job_id","created_at");

ALTER TABLE "carrier_cost_adjustments" ADD CONSTRAINT "carrier_cost_adjustments_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "logistics_job_events" ADD CONSTRAINT "logistics_job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "logistics_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipping_quotes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_quotes_app_all" ON "shipping_quotes" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "carrier_cost_adjustments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carrier_cost_adjustments_app_all" ON "carrier_cost_adjustments" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "return_shipments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return_shipments_app_all" ON "return_shipments" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "logistics_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logistics_jobs_app_all" ON "logistics_jobs" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "logistics_job_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logistics_job_events_app_all" ON "logistics_job_events" FOR ALL USING (true) WITH CHECK (true);
