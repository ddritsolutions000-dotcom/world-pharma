-- Phase 1F mock carrier / logistics. Additive. No live DHL.

ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'BOOKING';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'BOOKED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'LABEL_CREATED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'PICKUP_SCHEDULED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'BOOKING_FAILED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'BOOKING_UNKNOWN';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CANCEL_REQUESTED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'RETURN_TO_ORIGIN';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'LOST';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DAMAGED';

CREATE TYPE "LogisticsJobType" AS ENUM ('MEDICINE_DELIVERY','SAMPLE_COLLECTION','SAMPLE_TRANSPORT','REPORT_DELIVERY');
CREATE TYPE "ShippingServiceLevel" AS ENUM ('STANDARD','EXPRESS','SAME_DAY','NEXT_DAY','ECONOMY','INTERNATIONAL');
CREATE TYPE "TemperatureRequirement" AS ENUM ('AMBIENT','REFRIGERATED','FROZEN','TEMPERATURE_MONITORED');
CREATE TYPE "ProofOfDeliveryKind" AS ENUM ('OTP','SIGNATURE','PHOTO');
CREATE TYPE "ReturnDisposition" AS ENUM ('QUARANTINE','INSPECT','RESTOCK','DESTROY');
CREATE TYPE "CarrierReconStatus" AS ENUM ('MATCHED','BREAK','INVESTIGATE');

ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "seller_org_id" UUID;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "country_id" UUID;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "customer_person_id" UUID;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "job_type" "LogisticsJobType" NOT NULL DEFAULT 'MEDICINE_DELIVERY';
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "service_level" "ShippingServiceLevel" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "temperature" "TemperatureRequirement" NOT NULL DEFAULT 'AMBIENT';
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "carrier_id" UUID;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "carrier_account_id" UUID;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "tracking_number" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "provider_ref" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "booking_key" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "routing_json" JSONB;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "mock_scenario" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "customer_charge_minor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "quoted_cost_minor" BIGINT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "currency" CHAR(3) NOT NULL DEFAULT 'XXX';

UPDATE "shipments" s
SET
  seller_org_id = o.seller_org_id,
  country_id = o.country_id,
  customer_person_id = o.customer_person_id,
  customer_charge_minor = o.shipping_minor,
  currency = o.currency
FROM "orders" o
WHERE s.order_id = o.id
  AND s.seller_org_id IS NULL;

ALTER TABLE "shipments" ALTER COLUMN "seller_org_id" SET NOT NULL;
ALTER TABLE "shipments" ALTER COLUMN "country_id" SET NOT NULL;
ALTER TABLE "shipments" ALTER COLUMN "customer_person_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "shipments_booking_key_key" ON "shipments"("booking_key");
CREATE INDEX IF NOT EXISTS "shipments_customer_person_id_created_at_idx" ON "shipments"("customer_person_id","created_at");
CREATE INDEX IF NOT EXISTS "shipments_seller_org_id_status_idx" ON "shipments"("seller_org_id","status");
CREATE INDEX IF NOT EXISTS "shipments_country_id_status_idx" ON "shipments"("country_id","status");

CREATE TABLE "carriers" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "secret_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carriers_code_key" ON "carriers"("code");

CREATE TABLE "carrier_accounts" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "secret_ref" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carrier_accounts_code_key" ON "carrier_accounts"("code");

CREATE TABLE "carrier_capabilities" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "carrier_capabilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carrier_capabilities_carrier_id_name_key" ON "carrier_capabilities"("carrier_id","name");

CREATE TABLE "carrier_services" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "level" "ShippingServiceLevel" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "carrier_services_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carrier_services_carrier_id_code_key" ON "carrier_services"("carrier_id","code");

CREATE TABLE "carrier_coverages" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "origin_iso2" TEXT NOT NULL DEFAULT '*',
  "dest_iso2" TEXT NOT NULL DEFAULT '*',
  "international" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "carrier_coverages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carrier_health" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 100,
  "circuit_open" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_health_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carrier_health_carrier_id_key" ON "carrier_health"("carrier_id");

CREATE TABLE "shipment_packages" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "weight_grams" INTEGER NOT NULL DEFAULT 500,
  "length_mm" INTEGER NOT NULL DEFAULT 200,
  "width_mm" INTEGER NOT NULL DEFAULT 150,
  "height_mm" INTEGER NOT NULL DEFAULT 80,
  "declared_minor" BIGINT NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL,
  "package_type" TEXT NOT NULL DEFAULT 'PARCEL',
  "temperature" "TemperatureRequirement" NOT NULL DEFAULT 'AMBIENT',
  CONSTRAINT "shipment_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_package_items" (
  "id" UUID NOT NULL,
  "package_id" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  CONSTRAINT "shipment_package_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_labels" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "carrier_code" TEXT NOT NULL,
  "tracking_number" TEXT NOT NULL,
  "label_ref" TEXT NOT NULL,
  "label_format" TEXT NOT NULL DEFAULT 'MOCK',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipment_labels_shipment_id_key" ON "shipment_labels"("shipment_id");

CREATE TABLE "shipment_tracking_events" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "provider_code" TEXT NOT NULL,
  "normalized" "ShipmentStatus" NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "location" TEXT,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_tracking_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipment_tracking_events_shipment_id_provider_event_id_key" ON "shipment_tracking_events"("shipment_id","provider_event_id");

CREATE TABLE "delivery_attempts" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "attempt_no" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proofs_of_delivery" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "kind" "ProofOfDeliveryKind" NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proofs_of_delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carrier_costs" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "amount_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  "fx_snapshot_id" UUID,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_costs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carrier_reconciliations" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "status" "CarrierReconStatus" NOT NULL DEFAULT 'INVESTIGATE',
  "break_type" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_reconciliations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "carrier_accounts" ADD CONSTRAINT "carrier_accounts_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_capabilities" ADD CONSTRAINT "carrier_capabilities_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_services" ADD CONSTRAINT "carrier_services_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_coverages" ADD CONSTRAINT "carrier_coverages_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_health" ADD CONSTRAINT "carrier_health_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipment_packages" ADD CONSTRAINT "shipment_packages_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_package_items" ADD CONSTRAINT "shipment_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "shipment_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_labels" ADD CONSTRAINT "shipment_labels_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "shipment_tracking_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proofs_of_delivery" ADD CONSTRAINT "proofs_of_delivery_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_costs" ADD CONSTRAINT "carrier_costs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_reconciliations" ADD CONSTRAINT "carrier_reconciliations_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipments_owner ON "shipments";
CREATE POLICY shipments_owner ON "shipments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "customer_person_id"::text = current_setting('app.person_id', true)
  );
