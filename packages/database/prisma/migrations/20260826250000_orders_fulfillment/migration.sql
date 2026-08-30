-- Phase 1E orders + fulfillment. Additive. No DHL / settlement / payouts.

CREATE TYPE "OrderStatus" AS ENUM (
  'CONFIRMED','ON_HOLD','ALLOCATED','PICKING','PICKED','PACKING','PACKED','READY_TO_SHIP',
  'SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCEL_REQUESTED','CANCELLED','RETURN_REQUESTED',
  'RETURNED','REFUND_PENDING','REFUNDED','PARTIALLY_REFUNDED','FAILED'
);
CREATE TYPE "FulfillmentStatus" AS ENUM ('ALLOCATED','PICKING','PICKED','PACKING','PACKED','READY_TO_SHIP','CANCELLED');
CREATE TYPE "PickTaskStatus" AS ENUM ('OPEN','IN_PROGRESS','PICKED','EXCEPTION');
CREATE TYPE "PackTaskStatus" AS ENUM ('OPEN','IN_PROGRESS','PACKED','EXCEPTION');
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT','READY','HANDOFF_PENDING');
CREATE TYPE "ReturnReason" AS ENUM ('WRONG_ITEM','DAMAGED','DELIVERY_FAILURE','CUSTOMER_REFUSAL','OTHER_POLICY_ALLOWED');

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "seller_org_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "checkout_session_id" UUID NOT NULL,
  "checkout_quote_id" UUID NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "fulfilling_location_id" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
  "currency" CHAR(3) NOT NULL,
  "goods_minor" BIGINT NOT NULL,
  "discount_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "shipping_minor" BIGINT NOT NULL DEFAULT 0,
  "total_minor" BIGINT NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE UNIQUE INDEX "orders_payment_intent_id_key" ON "orders"("payment_intent_id");
CREATE INDEX "orders_customer_person_id_created_at_idx" ON "orders"("customer_person_id","created_at");
CREATE INDEX "orders_seller_org_id_status_created_at_idx" ON "orders"("seller_org_id","status","created_at");
CREATE INDEX "orders_country_id_status_idx" ON "orders"("country_id","status");
CREATE INDEX "orders_checkout_session_id_idx" ON "orders"("checkout_session_id");

CREATE TABLE "order_items" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "offer_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "unit_minor" BIGINT NOT NULL,
  "line_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reservation_id" UUID,
  "lot_id" UUID,
  "rx_required" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

CREATE TABLE "order_addresses" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "country_code" TEXT NOT NULL,
  "region" TEXT,
  "city" TEXT NOT NULL,
  "postal_code" TEXT,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "recipient_name" TEXT NOT NULL,
  "phone" TEXT,
  CONSTRAINT "order_addresses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_addresses_order_id_key" ON "order_addresses"("order_id");

CREATE TABLE "order_price_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "goods_minor" BIGINT NOT NULL,
  "discount_minor" BIGINT NOT NULL,
  "total_minor" BIGINT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "order_price_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_price_snapshots_order_id_key" ON "order_price_snapshots"("order_id");

CREATE TABLE "order_tax_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "tax_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "adapter_ref" TEXT,
  CONSTRAINT "order_tax_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_tax_snapshots_order_id_key" ON "order_tax_snapshots"("order_id");

CREATE TABLE "order_promo_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "campaign_id" UUID,
  "code" TEXT,
  "discount_minor" BIGINT NOT NULL,
  "funding" TEXT NOT NULL,
  "platform_minor" BIGINT NOT NULL DEFAULT 0,
  "vendor_minor" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "order_promo_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_promo_snapshots_order_id_key" ON "order_promo_snapshots"("order_id");

CREATE TABLE "order_affiliate_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "affiliate_code" TEXT,
  "estimate_minor" BIGINT NOT NULL DEFAULT 0,
  "clinical_blocked" BOOLEAN NOT NULL DEFAULT true,
  "payable" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "order_affiliate_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_affiliate_snapshots_order_id_key" ON "order_affiliate_snapshots"("order_id");

CREATE TABLE "order_shipping_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "charged_minor" BIGINT NOT NULL,
  "subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "actual_cost_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  CONSTRAINT "order_shipping_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_shipping_snapshots_order_id_key" ON "order_shipping_snapshots"("order_id");

CREATE TABLE "order_payment_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "order_payment_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_payment_snapshots_order_id_key" ON "order_payment_snapshots"("order_id");

CREATE TABLE "order_economics_snapshots" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "customer_paid_minor" BIGINT NOT NULL,
  "vendor_payable_est_minor" BIGINT NOT NULL,
  "platform_take_est_minor" BIGINT NOT NULL DEFAULT 0,
  "gateway_fee_est_minor" BIGINT NOT NULL DEFAULT 0,
  "promo_subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "affiliate_est_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL DEFAULT 0,
  "shipping_charged_minor" BIGINT NOT NULL DEFAULT 0,
  "shipping_subsidy_minor" BIGINT NOT NULL DEFAULT 0,
  "actual_carrier_cost_minor" BIGINT,
  "currency" CHAR(3) NOT NULL,
  CONSTRAINT "order_economics_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_economics_snapshots_order_id_key" ON "order_economics_snapshots"("order_id");

CREATE TABLE "order_status_history" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "actor_id" UUID,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id","created_at");

CREATE TABLE "order_notes" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "actor_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fulfillment_groups" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "status" "FulfillmentStatus" NOT NULL DEFAULT 'ALLOCATED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fulfillment_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fulfillment_groups_order_id_idx" ON "fulfillment_groups"("order_id");

CREATE TABLE "fulfillment_items" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "qty" INTEGER NOT NULL,
  "lot_id" UUID,
  CONSTRAINT "fulfillment_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_tasks" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "status" "PickTaskStatus" NOT NULL DEFAULT 'OPEN',
  "required_qty" INTEGER NOT NULL,
  "picked_qty" INTEGER NOT NULL DEFAULT 0,
  "lot_suggestion" TEXT,
  "exception" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pick_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pack_tasks" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "status" "PackTaskStatus" NOT NULL DEFAULT 'OPEN',
  "exception" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pack_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "carrier_ref" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "return_requests" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "reason" "ReturnReason" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_quote_id_fkey" FOREIGN KEY ("checkout_quote_id") REFERENCES "checkout_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilling_location_id_fkey" FOREIGN KEY ("fulfilling_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_price_snapshots" ADD CONSTRAINT "order_price_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_tax_snapshots" ADD CONSTRAINT "order_tax_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_promo_snapshots" ADD CONSTRAINT "order_promo_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_affiliate_snapshots" ADD CONSTRAINT "order_affiliate_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_shipping_snapshots" ADD CONSTRAINT "order_shipping_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_payment_snapshots" ADD CONSTRAINT "order_payment_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_economics_snapshots" ADD CONSTRAINT "order_economics_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillment_groups" ADD CONSTRAINT "fulfillment_groups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillment_groups" ADD CONSTRAINT "fulfillment_groups_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fulfillment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fulfillment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pack_tasks" ADD CONSTRAINT "pack_tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fulfillment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fulfillment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_owner ON "orders";
CREATE POLICY orders_owner ON "orders"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "customer_person_id"::text = current_setting('app.person_id', true)
  );
