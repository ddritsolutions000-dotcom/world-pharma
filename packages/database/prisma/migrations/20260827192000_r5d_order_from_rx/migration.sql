-- CR-R5-D-IMPL-118: Order-from-Rx commercial handoff (ED-R5D-01 Option B).
-- Cart/checkout may skip soft inventory hold; Order links to dispense without second PICK.

ALTER TABLE "carts"
  ADD COLUMN "skip_inventory_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dispensing_case_id" UUID,
  ADD COLUMN "dispense_event_id" UUID;

CREATE INDEX "carts_dispensing_case_id_idx" ON "carts"("dispensing_case_id");

ALTER TABLE "checkout_sessions"
  ADD COLUMN "skip_inventory_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dispensing_case_id" UUID,
  ADD COLUMN "dispense_event_id" UUID;

CREATE INDEX "checkout_sessions_dispense_event_id_idx" ON "checkout_sessions"("dispense_event_id");

ALTER TABLE "orders"
  ADD COLUMN "dispensing_case_id" UUID,
  ADD COLUMN "dispense_event_id" UUID,
  ADD COLUMN "prescription_id" UUID,
  ADD COLUMN "prescription_version_id" UUID,
  ADD COLUMN "rx_inventory_consumed_at_dispense" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "orders_dispense_event_id_key" ON "orders"("dispense_event_id");
CREATE INDEX "orders_dispensing_case_id_idx" ON "orders"("dispensing_case_id");
CREATE INDEX "orders_prescription_id_idx" ON "orders"("prescription_id");

CREATE TABLE "rx_commerce_handoffs" (
  "id" UUID NOT NULL,
  "handoff_key" TEXT NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "dispensing_case_id" UUID NOT NULL,
  "dispense_event_id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_version_id" UUID NOT NULL,
  "cart_id" UUID,
  "order_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "rx_commerce_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rx_commerce_handoffs_handoff_key_key" ON "rx_commerce_handoffs"("handoff_key");
CREATE UNIQUE INDEX "rx_commerce_handoffs_dispense_event_id_key" ON "rx_commerce_handoffs"("dispense_event_id");
CREATE INDEX "rx_commerce_handoffs_customer_person_id_created_at_idx"
  ON "rx_commerce_handoffs"("customer_person_id", "created_at");
CREATE INDEX "rx_commerce_handoffs_dispensing_case_id_idx"
  ON "rx_commerce_handoffs"("dispensing_case_id");

ALTER TABLE "rx_commerce_handoffs"
  ADD CONSTRAINT "rx_commerce_handoffs_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rx_commerce_handoffs"
  ADD CONSTRAINT "rx_commerce_handoffs_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rx_commerce_handoffs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY rx_commerce_handoffs_access ON "rx_commerce_handoffs"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "rx_commerce_handoffs" TO worldpharma_app;
