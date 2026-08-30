-- R7-B: LabBooking commercial spine + optional PaymentIntent lab payable.
-- Additive only. No Sample/CoC/pathology. No live PSP. No USING(true).

CREATE TYPE "LabCollectionMode" AS ENUM ('HOME', 'CENTER');
CREATE TYPE "LabBookingStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED');

CREATE TABLE "lab_bookings" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "lab_location_id" UUID,
    "collection_mode" "LabCollectionMode" NOT NULL,
    "status" "LabBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "currency" CHAR(3) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "slot_starts_at" TIMESTAMPTZ,
    "slot_ends_at" TIMESTAMPTZ,
    "timezone" TEXT,
    "customer_address_id" UUID,
    "address_snapshot" JSONB,
    "payment_intent_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lab_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_booking_lines" (
    "id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_minor" BIGINT NOT NULL,
    "line_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "price_version" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_booking_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_booking_status_history" (
    "id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "from_status" "LabBookingStatus" NOT NULL,
    "to_status" "LabBookingStatus" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_booking_status_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_bookings_idempotency_key_key" ON "lab_bookings"("idempotency_key");
CREATE INDEX "lab_bookings_customer_person_id_status_idx" ON "lab_bookings"("customer_person_id", "status");
CREATE INDEX "lab_bookings_lab_org_id_status_idx" ON "lab_bookings"("lab_org_id", "status");
CREATE INDEX "lab_bookings_country_id_status_idx" ON "lab_bookings"("country_id", "status");
CREATE INDEX "lab_bookings_lab_location_id_idx" ON "lab_bookings"("lab_location_id");
CREATE INDEX "lab_booking_lines_lab_booking_id_idx" ON "lab_booking_lines"("lab_booking_id");
CREATE INDEX "lab_booking_lines_offer_id_idx" ON "lab_booking_lines"("offer_id");
CREATE INDEX "lab_booking_status_history_lab_booking_id_created_at_idx" ON "lab_booking_status_history"("lab_booking_id", "created_at");

ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_lab_org_id_fkey" FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_lab_location_id_fkey" FOREIGN KEY ("lab_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_customer_address_id_fkey" FOREIGN KEY ("customer_address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_booking_lines" ADD CONSTRAINT "lab_booking_lines_lab_booking_id_fkey" FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_booking_lines" ADD CONSTRAINT "lab_booking_lines_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "catalog_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_booking_lines" ADD CONSTRAINT "lab_booking_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_booking_status_history" ADD CONSTRAINT "lab_booking_status_history_lab_booking_id_fkey" FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_booking_status_history" ADD CONSTRAINT "lab_booking_status_history_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PaymentIntent: commerce checkout FKs become optional; lab booking is alternate payable.
ALTER TABLE "payment_intents" ALTER COLUMN "checkout_session_id" DROP NOT NULL;
ALTER TABLE "payment_intents" ALTER COLUMN "checkout_quote_id" DROP NOT NULL;
ALTER TABLE "payment_intents" ADD COLUMN "lab_booking_id" UUID;

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_lab_booking_id_fkey"
  FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payment_intents_lab_booking_id_idx" ON "payment_intents"("lab_booking_id");

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_exactly_one_payable" CHECK (
  (
    ("checkout_session_id" IS NOT NULL AND "checkout_quote_id" IS NOT NULL AND "lab_booking_id" IS NULL)
    OR
    ("checkout_session_id" IS NULL AND "checkout_quote_id" IS NULL AND "lab_booking_id" IS NOT NULL)
  )
);

ALTER TABLE "lab_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_bookings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_booking_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_booking_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_booking_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_booking_status_history" FORCE ROW LEVEL SECURITY;

CREATE POLICY lab_bookings_access ON "lab_bookings" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.can_org("lab_org_id")
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.write_org("lab_org_id")
  );

CREATE POLICY lab_booking_lines_access ON "lab_booking_lines" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = lab_booking_lines.lab_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(b.lab_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = lab_booking_lines.lab_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.write_org(b.lab_org_id)
        )
    )
  );

CREATE POLICY lab_booking_status_history_access ON "lab_booking_status_history" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = lab_booking_status_history.lab_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(b.lab_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = lab_booking_status_history.lab_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.write_org(b.lab_org_id)
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "lab_bookings" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lab_booking_lines" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lab_booking_status_history" TO worldpharma_app;
