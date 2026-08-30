-- R12-A: CRM marketing preferences + conversion events

CREATE TYPE "ConversionEventKind" AS ENUM (
  'ORDER_PAID',
  'CHECKOUT_STARTED',
  'CART_ABANDONED',
  'BOOKING_COMPLETED',
  'AFFILIATE_CLICK',
  'APPOINTMENT_COMPLETED',
  'LAB_BOOKING_COMPLETED',
  'IMAGING_BOOKING_COMPLETED'
);

CREATE TABLE "marketing_preferences" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "marketing_allowed" BOOLEAN NOT NULL DEFAULT false,
    "email_allowed" BOOLEAN NOT NULL DEFAULT false,
    "push_allowed" BOOLEAN NOT NULL DEFAULT false,
    "sms_allowed" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_allowed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "marketing_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversion_events" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "person_id" UUID,
    "order_id" UUID,
    "session_id" UUID,
    "source" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "event_kind" "ConversionEventKind" NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_preferences_person_id_country_id_key" ON "marketing_preferences"("person_id", "country_id");
CREATE INDEX "marketing_preferences_country_id_marketing_allowed_idx" ON "marketing_preferences"("country_id", "marketing_allowed");

CREATE UNIQUE INDEX "conversion_events_source_source_key_event_kind_key" ON "conversion_events"("source", "source_key", "event_kind");
CREATE INDEX "conversion_events_country_id_occurred_at_idx" ON "conversion_events"("country_id", "occurred_at");
CREATE INDEX "conversion_events_person_id_occurred_at_idx" ON "conversion_events"("person_id", "occurred_at");

ALTER TABLE "marketing_preferences" ADD CONSTRAINT "marketing_preferences_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketing_preferences" ADD CONSTRAINT "marketing_preferences_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
