-- Phase 1D sandbox payment kernel. Additive only. No Order / settlement / payouts.

CREATE TYPE "PaymentIntentStatus" AS ENUM (
  'CREATED',
  'REQUIRES_ACTION',
  'PROCESSING',
  'AUTHORIZED',
  'AUTHORIZED_COD',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'UNKNOWN'
);

CREATE TYPE "PaymentAttemptStatus" AS ENUM (
  'CREATED',
  'SUBMITTED',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN'
);

CREATE TYPE "RefundStatus" AS ENUM (
  'REQUESTED',
  'PROCESSING',
  'REFUNDED',
  'FAILED'
);

CREATE TYPE "PaymentMethodFamily" AS ENUM (
  'CARD',
  'BANK_TRANSFER',
  'LOCAL_BANK',
  'WALLET',
  'MOBILE_PAYMENT',
  'COD'
);

CREATE TYPE "ReconciliationStatus" AS ENUM (
  'MATCHED',
  'BREAK',
  'INVESTIGATE'
);

CREATE TABLE "payment_gateways" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "health_score" INTEGER NOT NULL DEFAULT 100,
  "secret_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateways_code_key" ON "payment_gateways"("code");

CREATE TABLE "payment_gateway_accounts" (
  "id" UUID NOT NULL,
  "gateway_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "countries_csv" TEXT NOT NULL DEFAULT '*',
  "currencies_csv" TEXT NOT NULL DEFAULT '*',
  "methods_csv" TEXT NOT NULL DEFAULT 'CARD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "secret_ref" TEXT NOT NULL,
  CONSTRAINT "payment_gateway_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_accounts_code_key" ON "payment_gateway_accounts"("code");

CREATE TABLE "payment_gateway_capabilities" (
  "id" UUID NOT NULL,
  "gateway_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "payment_gateway_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_capabilities_gateway_id_name_key" ON "payment_gateway_capabilities"("gateway_id", "name");

CREATE TABLE "payment_methods" (
  "id" UUID NOT NULL,
  "family" "PaymentMethodFamily" NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_methods_family_key" ON "payment_methods"("family");

CREATE TABLE "payment_routing_rules" (
  "id" UUID NOT NULL,
  "country_id" UUID,
  "currency" TEXT,
  "method" "PaymentMethodFamily" NOT NULL,
  "gateway_code" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "payment_routing_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_routing_rules_country_id_method_currency_idx" ON "payment_routing_rules"("country_id", "method", "currency");

CREATE TABLE "payment_fx_snapshots" (
  "id" UUID NOT NULL,
  "base_currency" CHAR(3) NOT NULL,
  "quote_currency" CHAR(3) NOT NULL,
  "rate_minor" BIGINT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'mock',
  "quoted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_fx_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_intents" (
  "id" UUID NOT NULL,
  "checkout_session_id" UUID NOT NULL,
  "checkout_quote_id" UUID NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "method" "PaymentMethodFamily" NOT NULL,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "captured_minor" BIGINT NOT NULL DEFAULT 0,
  "refunded_minor" BIGINT NOT NULL DEFAULT 0,
  "fx_snapshot_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "next_action" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");
CREATE INDEX "payment_intents_customer_person_id_status_idx" ON "payment_intents"("customer_person_id", "status");
CREATE INDEX "payment_intents_checkout_session_id_idx" ON "payment_intents"("checkout_session_id");

CREATE TABLE "payment_attempts" (
  "id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "gateway_id" UUID NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "method" "PaymentMethodFamily" NOT NULL,
  "provider_ref" TEXT,
  "routing_json" JSONB NOT NULL,
  "error_code" TEXT,
  "submitted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_attempts_intent_id_created_at_idx" ON "payment_attempts"("intent_id", "created_at");

CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "attempt_id" UUID,
  "kind" TEXT NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "provider_ref" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_transactions_intent_id_created_at_idx" ON "payment_transactions"("intent_id", "created_at");

CREATE TABLE "refunds" (
  "id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");
CREATE INDEX "refunds_intent_id_status_idx" ON "refunds"("intent_id", "status");

CREATE TABLE "refund_attempts" (
  "id" UUID NOT NULL,
  "refund_id" UUID NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PROCESSING',
  "provider_ref" TEXT,
  "error_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "gateway_id" UUID NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "signature_ok" BOOLEAN NOT NULL DEFAULT false,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "payload_cipher" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_gateway_id_provider_event_id_key" ON "payment_webhook_events"("gateway_id", "provider_event_id");
CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events"("created_at");

CREATE TABLE "payment_reconciliations" (
  "id" UUID NOT NULL,
  "intent_id" UUID,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'INVESTIGATE',
  "break_type" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_reconciliations_status_created_at_idx" ON "payment_reconciliations"("status", "created_at");

ALTER TABLE "payment_gateway_accounts" ADD CONSTRAINT "payment_gateway_accounts_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "payment_gateways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_gateway_capabilities" ADD CONSTRAINT "payment_gateway_capabilities_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "payment_gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_routing_rules" ADD CONSTRAINT "payment_routing_rules_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_checkout_quote_id_fkey" FOREIGN KEY ("checkout_quote_id") REFERENCES "checkout_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_customer_person_id_fkey" FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_fx_snapshot_id_fkey" FOREIGN KEY ("fx_snapshot_id") REFERENCES "payment_fx_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "payment_gateways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "payment_gateways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_intents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_intents_owner ON "payment_intents";
CREATE POLICY payment_intents_owner ON "payment_intents"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "customer_person_id"::text = current_setting('app.person_id', true)
  );

ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_attempts_via_intent ON "payment_attempts";
CREATE POLICY payment_attempts_via_intent ON "payment_attempts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "payment_intents" i
      WHERE i.id = "payment_attempts"."intent_id"
        AND i."customer_person_id"::text = current_setting('app.person_id', true)
    )
  );

ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refunds_via_intent ON "refunds";
CREATE POLICY refunds_via_intent ON "refunds"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "payment_intents" i
      WHERE i.id = "refunds"."intent_id"
        AND i."customer_person_id"::text = current_setting('app.person_id', true)
    )
  );
