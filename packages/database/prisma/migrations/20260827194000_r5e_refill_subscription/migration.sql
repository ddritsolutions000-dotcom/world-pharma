-- CR-R5-E-IMPL-120: Refill request / re-auth + gated subscription foundation (ED-R5E-01).
-- Automatic recurring refill remains OFF by default (auto_execute_enabled = false).

CREATE TYPE "RefillRequestStatus" AS ENUM (
  'REQUESTED',
  'PENDING_REAUTH',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED_BLOCKED',
  'QUEUED_FOR_DISPENSE'
);

CREATE TYPE "RxSubscriptionStatus" AS ENUM (
  'DISABLED',
  'ACTIVE',
  'PAUSED',
  'CANCELLED',
  'EXPIRED_BLOCKED',
  'PAYMENT_FAILED'
);

CREATE TABLE "refill_requests" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "prescription_version_id" UUID NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "status" "RefillRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "eligibility_reason_code" TEXT,
  "eligibility_snapshot" JSONB,
  "decided_by_person_id" UUID,
  "decision_reason_code" TEXT,
  "decided_at" TIMESTAMPTZ,
  "dispensing_case_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "refill_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refill_requests_idempotency_key_key" ON "refill_requests"("idempotency_key");
CREATE INDEX "refill_requests_customer_person_id_created_at_idx" ON "refill_requests"("customer_person_id", "created_at");
CREATE INDEX "refill_requests_prescription_id_status_idx" ON "refill_requests"("prescription_id", "status");
CREATE INDEX "refill_requests_country_id_status_idx" ON "refill_requests"("country_id", "status");

ALTER TABLE "refill_requests"
  ADD CONSTRAINT "refill_requests_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refill_requests"
  ADD CONSTRAINT "refill_requests_decided_by_person_id_fkey"
  FOREIGN KEY ("decided_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "refill_request_history" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "from_status" "RefillRequestStatus" NOT NULL,
  "to_status" "RefillRequestStatus" NOT NULL,
  "actor_person_id" UUID NOT NULL,
  "reason_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refill_request_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refill_request_history_request_id_created_at_idx"
  ON "refill_request_history"("request_id", "created_at");

ALTER TABLE "refill_request_history"
  ADD CONSTRAINT "refill_request_history_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "refill_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refill_request_history"
  ADD CONSTRAINT "refill_request_history_actor_person_id_fkey"
  FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "rx_subscriptions" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "customer_person_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "status" "RxSubscriptionStatus" NOT NULL DEFAULT 'DISABLED',
  "auto_execute_enabled" BOOLEAN NOT NULL DEFAULT false,
  "next_attempt_at" TIMESTAMPTZ,
  "last_attempt_at" TIMESTAMPTZ,
  "pause_reason_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "rx_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rx_subscriptions_prescription_id_customer_person_id_key"
  ON "rx_subscriptions"("prescription_id", "customer_person_id");
CREATE INDEX "rx_subscriptions_customer_person_id_status_idx"
  ON "rx_subscriptions"("customer_person_id", "status");
CREATE INDEX "rx_subscriptions_country_id_status_idx"
  ON "rx_subscriptions"("country_id", "status");

ALTER TABLE "rx_subscriptions"
  ADD CONSTRAINT "rx_subscriptions_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refill_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refill_request_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rx_subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY refill_requests_access ON "refill_requests"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
    OR decided_by_person_id = app.person_id()
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
  );

CREATE POLICY refill_request_history_access ON "refill_request_history"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM refill_requests r
      WHERE r.id = request_id AND (
        r.customer_person_id = app.person_id()
        OR r.decided_by_person_id = app.person_id()
      )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR actor_person_id = app.person_id()
  );

CREATE POLICY rx_subscriptions_access ON "rx_subscriptions"
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "refill_requests" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "refill_request_history" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rx_subscriptions" TO worldpharma_app;
