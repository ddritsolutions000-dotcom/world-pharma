-- R8-B: ImagingBooking commercial spine + optional PaymentIntent imaging payable.
-- Additive only. No acquisition/report/DICOM. No live PSP. No USING(true).

ALTER TYPE "LocationKind" ADD VALUE IF NOT EXISTS 'IMAGING';

CREATE TYPE "ImagingBookingStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED');

CREATE TABLE "imaging_bookings" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "imaging_org_id" UUID NOT NULL,
    "imaging_location_id" UUID NOT NULL,
    "status" "ImagingBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "currency" CHAR(3) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "slot_starts_at" TIMESTAMPTZ,
    "slot_ends_at" TIMESTAMPTZ,
    "timezone" TEXT,
    "payment_intent_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "prep_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "referral_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "imaging_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_booking_lines" (
    "id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_minor" BIGINT NOT NULL,
    "line_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "price_version" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imaging_booking_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_booking_status_history" (
    "id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "from_status" "ImagingBookingStatus" NOT NULL,
    "to_status" "ImagingBookingStatus" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imaging_booking_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_referrals" (
    "id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "referral_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imaging_referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imaging_bookings_idempotency_key_key" ON "imaging_bookings"("idempotency_key");
CREATE INDEX "imaging_bookings_customer_person_id_status_idx" ON "imaging_bookings"("customer_person_id", "status");
CREATE INDEX "imaging_bookings_imaging_org_id_status_idx" ON "imaging_bookings"("imaging_org_id", "status");
CREATE INDEX "imaging_bookings_country_id_status_idx" ON "imaging_bookings"("country_id", "status");
CREATE INDEX "imaging_bookings_imaging_location_id_slot_starts_at_slot_ends_at_idx" ON "imaging_bookings"("imaging_location_id", "slot_starts_at", "slot_ends_at");
CREATE INDEX "imaging_booking_lines_imaging_booking_id_idx" ON "imaging_booking_lines"("imaging_booking_id");
CREATE INDEX "imaging_booking_lines_offer_id_idx" ON "imaging_booking_lines"("offer_id");
CREATE INDEX "imaging_booking_status_history_imaging_booking_id_created_at_idx" ON "imaging_booking_status_history"("imaging_booking_id", "created_at");
CREATE UNIQUE INDEX "imaging_referrals_imaging_booking_id_key" ON "imaging_referrals"("imaging_booking_id");

ALTER TABLE "imaging_bookings" ADD CONSTRAINT "imaging_bookings_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_bookings" ADD CONSTRAINT "imaging_bookings_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_bookings" ADD CONSTRAINT "imaging_bookings_imaging_org_id_fkey" FOREIGN KEY ("imaging_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_bookings" ADD CONSTRAINT "imaging_bookings_imaging_location_id_fkey" FOREIGN KEY ("imaging_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imaging_booking_lines" ADD CONSTRAINT "imaging_booking_lines_imaging_booking_id_fkey" FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_booking_lines" ADD CONSTRAINT "imaging_booking_lines_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "catalog_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_booking_lines" ADD CONSTRAINT "imaging_booking_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imaging_booking_status_history" ADD CONSTRAINT "imaging_booking_status_history_imaging_booking_id_fkey" FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_booking_status_history" ADD CONSTRAINT "imaging_booking_status_history_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imaging_referrals" ADD CONSTRAINT "imaging_referrals_imaging_booking_id_fkey" FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PaymentIntent: imaging booking is third alternate payable.
ALTER TABLE "payment_intents" ADD COLUMN "imaging_booking_id" UUID;

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_imaging_booking_id_fkey"
  FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payment_intents_imaging_booking_id_idx" ON "payment_intents"("imaging_booking_id");

ALTER TABLE "payment_intents" DROP CONSTRAINT IF EXISTS "payment_intents_exactly_one_payable";

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_exactly_one_payable" CHECK (
  (
    ("checkout_session_id" IS NOT NULL AND "checkout_quote_id" IS NOT NULL AND "lab_booking_id" IS NULL AND "imaging_booking_id" IS NULL)
    OR
    ("checkout_session_id" IS NULL AND "checkout_quote_id" IS NULL AND "lab_booking_id" IS NOT NULL AND "imaging_booking_id" IS NULL)
    OR
    ("checkout_session_id" IS NULL AND "checkout_quote_id" IS NULL AND "lab_booking_id" IS NULL AND "imaging_booking_id" IS NOT NULL)
  )
);

ALTER TABLE "imaging_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_bookings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_booking_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_booking_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_booking_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_booking_status_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_referrals" FORCE ROW LEVEL SECURITY;

CREATE POLICY imaging_bookings_access ON "imaging_bookings" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.can_org("imaging_org_id")
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("customer_person_id")
    OR app.write_org("imaging_org_id")
  );

CREATE POLICY imaging_booking_lines_access ON "imaging_booking_lines" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_booking_lines.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(b.imaging_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_booking_lines.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.write_org(b.imaging_org_id)
        )
    )
  );

CREATE POLICY imaging_booking_status_history_access ON "imaging_booking_status_history" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_booking_status_history.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(b.imaging_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_booking_status_history.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.write_org(b.imaging_org_id)
        )
    )
  );

CREATE POLICY imaging_referrals_access ON "imaging_referrals" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_referrals.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(b.imaging_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_referrals.imaging_booking_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.write_org(b.imaging_org_id)
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_bookings" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_booking_lines" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_booking_status_history" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_referrals" TO worldpharma_app;
