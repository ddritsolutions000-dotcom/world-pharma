-- Phase 1C cart + checkout. Additive. No Order / payment capture tables.

CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'ABANDONED', 'EXPIRED');
CREATE TYPE "CheckoutStatus" AS ENUM ('VALIDATING', 'QUOTED', 'REVALIDATION_REQUIRED', 'READY_FOR_PAYMENT', 'EXPIRED', 'CANCELLED', 'FAILED');
CREATE TYPE "PromoKind" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "PromoFunding" AS ENUM ('PLATFORM', 'VENDOR', 'SPLIT');
CREATE TYPE "ShippingQuoteStatus" AS ENUM ('UNAVAILABLE', 'QUOTED');
CREATE TYPE "TaxQuoteStatus" AS ENUM ('UNKNOWN', 'QUOTED');

CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "seller_org_id" UUID,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "carts_customer_person_id_country_id_key" ON "carts"("customer_person_id", "country_id");
CREATE INDEX "carts_country_id_status_idx" ON "carts"("country_id", "status");

CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "prescription_case_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cart_items_cart_id_offer_id_key" ON "cart_items"("cart_id", "offer_id");
CREATE INDEX "cart_items_cart_id_deleted_at_idx" ON "cart_items"("cart_id", "deleted_at");
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_qty_positive" CHECK ("qty" > 0);

CREATE TABLE "cart_quotes" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sell_minor" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cart_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cart_quotes_cart_id_created_at_idx" ON "cart_quotes"("cart_id", "created_at");

CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT,
    "region" TEXT,
    "city" TEXT NOT NULL,
    "postal_code" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_addresses_customer_person_id_country_id_idx" ON "customer_addresses"("customer_person_id", "country_id");

CREATE TABLE "checkout_sessions" (
    "id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "seller_org_id" UUID NOT NULL,
    "address_id" UUID,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'VALIDATING',
    "idempotency_key" TEXT NOT NULL,
    "promo_code" TEXT,
    "affiliate_code" TEXT,
    "reservation_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkout_sessions_idempotency_key_key" ON "checkout_sessions"("idempotency_key");
CREATE INDEX "checkout_sessions_customer_person_id_status_idx" ON "checkout_sessions"("customer_person_id", "status");
CREATE INDEX "checkout_sessions_cart_id_status_idx" ON "checkout_sessions"("cart_id", "status");

CREATE TABLE "checkout_quotes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sell_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "shipping_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL,
    "tax_status" "TaxQuoteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "shipping_status" "ShippingQuoteStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checkout_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "checkout_quotes_session_id_created_at_idx" ON "checkout_quotes"("session_id", "created_at");

CREATE TABLE "promo_campaigns" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PromoKind" NOT NULL,
    "percent_bps" INTEGER NOT NULL DEFAULT 0,
    "fixed_minor" BIGINT NOT NULL DEFAULT 0,
    "min_basket_minor" BIGINT NOT NULL DEFAULT 0,
    "funding" "PromoFunding" NOT NULL DEFAULT 'PLATFORM',
    "country_id" UUID,
    "max_redemptions" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_campaigns_code_key" ON "promo_campaigns"("code");

CREATE TABLE "promo_applications" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "funding" "PromoFunding" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_applications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promo_applications_session_id_idx" ON "promo_applications"("session_id");

CREATE TABLE "affiliate_attribution_snapshots" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "affiliate_code" TEXT NOT NULL,
    "preview_minor" BIGINT NOT NULL DEFAULT 0,
    "clinical_blocked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "affiliate_attribution_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "affiliate_attribution_snapshots_session_id_key" ON "affiliate_attribution_snapshots"("session_id");

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_records_person_id_key_key" ON "idempotency_records"("person_id", "key");
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "carts_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "carts_seller_org_id_fkey" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "catalog_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_quotes" ADD CONSTRAINT "cart_quotes_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checkout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promo_campaigns" ADD CONSTRAINT "promo_campaigns_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promo_applications" ADD CONSTRAINT "promo_applications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checkout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promo_applications" ADD CONSTRAINT "promo_applications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "promo_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_attribution_snapshots" ADD CONSTRAINT "affiliate_attribution_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checkout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carts_app_all" ON "carts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_items_app_all" ON "cart_items" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "cart_quotes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_quotes_app_all" ON "cart_quotes" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_addresses_app_all" ON "customer_addresses" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "checkout_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout_sessions_app_all" ON "checkout_sessions" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "checkout_quotes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout_quotes_app_all" ON "checkout_quotes" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "promo_campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_campaigns_app_all" ON "promo_campaigns" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "promo_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_applications_app_all" ON "promo_applications" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "affiliate_attribution_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_attribution_snapshots_app_all" ON "affiliate_attribution_snapshots" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "idempotency_records_app_all" ON "idempotency_records" FOR ALL USING (true) WITH CHECK (true);
