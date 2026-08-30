-- Additive: PaymentGatewayAccount.created_at was in Prisma schema but omitted from 1D create table.

ALTER TABLE "payment_gateway_accounts"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
