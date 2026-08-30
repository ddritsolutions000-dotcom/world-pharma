-- Phase 1B inventory + warehouse. Additive. Does not alter Phase 0 / 1A tables except
-- locations.timezone (nullable) and catalog_search_documents.in_stock (boolean default false).

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "catalog_search_documents" ADD COLUMN IF NOT EXISTS "in_stock" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "InventoryLotStatus" AS ENUM ('ACTIVE', 'QUARANTINE', 'EXPIRED', 'CLOSED');
CREATE TYPE "InventoryMovementType" AS ENUM (
  'RECEIPT', 'ADJUSTMENT', 'RESERVATION', 'RELEASE',
  'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGE', 'EXPIRY',
  'QUARANTINE', 'UNQUARANTINE', 'RETURN', 'PICK', 'PACK', 'SHIP'
);
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'RECEIVED', 'POSTED', 'CANCELLED');
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'RESERVED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE "InventoryReservationStatus" AS ENUM ('OPEN', 'RELEASED', 'EXPIRED', 'CONSUMED');
CREATE TYPE "InventoryReservationPurpose" AS ENUM ('MANUAL', 'CHECKOUT');
CREATE TYPE "InventoryRejectDisposition" AS ENUM ('QUARANTINE', 'DAMAGE');

CREATE TABLE "warehouse_profiles" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "fulfillment_capable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "warehouse_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouse_profiles_location_id_key" ON "warehouse_profiles"("location_id");
CREATE INDEX "warehouse_profiles_organization_id_idx" ON "warehouse_profiles"("organization_id");

CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "owner_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL DEFAULT '',
    "expires_on" DATE,
    "manufactured_on" DATE,
    "status" "InventoryLotStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_lots_location_id_variant_id_lot_code_key" ON "inventory_lots"("location_id", "variant_id", "lot_code");
CREATE INDEX "inventory_lots_location_id_variant_id_idx" ON "inventory_lots"("location_id", "variant_id");
CREATE INDEX "inventory_lots_owner_org_id_country_id_idx" ON "inventory_lots"("owner_org_id", "country_id");
CREATE INDEX "inventory_lots_expires_on_idx" ON "inventory_lots"("expires_on");

CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "expired" INTEGER NOT NULL DEFAULT 0,
    "quarantined" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "in_transit" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_balances_lot_id_key" ON "inventory_balances"("lot_id");
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_non_negative"
  CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "damaged" >= 0 AND "expired" >= 0
    AND "quarantined" >= 0 AND "returned" >= 0 AND "in_transit" >= 0 AND "available" >= 0);
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_available_formula"
  CHECK ("available" = "on_hand" - "reserved" - "damaged" - "expired" - "quarantined" - "returned");
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_buckets_fit"
  CHECK ("reserved" + "damaged" + "expired" + "quarantined" + "returned" <= "on_hand");

CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "actor_person_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT,
    "ref_type" TEXT,
    "ref_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");
CREATE INDEX "inventory_movements_lot_id_occurred_at_idx" ON "inventory_movements"("lot_id", "occurred_at");
CREATE INDEX "inventory_movements_ref_type_ref_id_idx" ON "inventory_movements"("ref_type", "ref_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_qty_positive" CHECK ("qty" > 0);

CREATE OR REPLACE FUNCTION inventory_movements_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_movements_no_update
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_immutable();

CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "lot_id" UUID,
    "location_id" UUID NOT NULL,
    "owner_org_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'OPEN',
    "purpose" "InventoryReservationPurpose" NOT NULL DEFAULT 'MANUAL',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "transfer_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_reservations_idempotency_key_key" ON "inventory_reservations"("idempotency_key");
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");
CREATE INDEX "inventory_reservations_owner_org_id_location_id_variant_id_idx" ON "inventory_reservations"("owner_org_id", "location_id", "variant_id");
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_qty_positive" CHECK ("qty" > 0);

CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "owner_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "actor_person_id" UUID,
    "received_at" TIMESTAMPTZ,
    "posted_at" TIMESTAMPTZ,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "goods_receipts_idempotency_key_key" ON "goods_receipts"("idempotency_key");
CREATE INDEX "goods_receipts_owner_org_id_status_idx" ON "goods_receipts"("owner_org_id", "status");
CREATE INDEX "goods_receipts_location_id_status_idx" ON "goods_receipts"("location_id", "status");

CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL DEFAULT '',
    "expires_on" DATE,
    "manufactured_on" DATE,
    "qty" INTEGER NOT NULL,
    "qty_accepted" INTEGER NOT NULL DEFAULT 0,
    "qty_rejected" INTEGER NOT NULL DEFAULT 0,
    "reject_disposition" "InventoryRejectDisposition",
    "lot_id" UUID,
    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_qty_non_negative"
  CHECK ("qty" >= 0 AND "qty_accepted" >= 0 AND "qty_rejected" >= 0);

CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "owner_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "actor_person_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_transfers_idempotency_key_key" ON "stock_transfers"("idempotency_key");
CREATE INDEX "stock_transfers_owner_org_id_status_idx" ON "stock_transfers"("owner_org_id", "status");
CREATE INDEX "stock_transfers_country_id_status_idx" ON "stock_transfers"("country_id", "status");

CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "source_lot_id" UUID NOT NULL,
    "dest_lot_id" UUID,
    "qty" INTEGER NOT NULL,
    "qty_in_transit" INTEGER NOT NULL DEFAULT 0,
    "qty_received" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_transfer_lines_transfer_id_idx" ON "stock_transfer_lines"("transfer_id");
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_qty_positive" CHECK ("qty" > 0);

ALTER TABLE "warehouse_profiles" ADD CONSTRAINT "warehouse_profiles_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_profiles" ADD CONSTRAINT "warehouse_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_source_lot_id_fkey" FOREIGN KEY ("source_lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouse_profiles_app_all" ON "warehouse_profiles" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "inventory_lots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_lots_app_all" ON "inventory_lots" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "inventory_balances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_balances_app_all" ON "inventory_balances" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_app_all" ON "inventory_movements" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "inventory_reservations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_reservations_app_all" ON "inventory_reservations" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goods_receipts_app_all" ON "goods_receipts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goods_receipt_lines_app_all" ON "goods_receipt_lines" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_transfers_app_all" ON "stock_transfers" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "stock_transfer_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_transfer_lines_app_all" ON "stock_transfer_lines" FOR ALL USING (true) WITH CHECK (true);
