-- Sprint 45 — Delivery OTP hardening metadata (attempts, expiry, purpose, consumption).
-- Does not store plaintext OTP. secret_hash remains HMAC/hash only.

ALTER TABLE "proofs_of_delivery"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "consumed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'DELIVERY_POD';

CREATE INDEX IF NOT EXISTS "proofs_of_delivery_shipment_purpose_idx"
  ON "proofs_of_delivery" ("shipment_id", "purpose");
