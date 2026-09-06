-- Partner payout: encrypted beneficiary ciphertext for live disbursement (never return plaintext to clients).
ALTER TABLE "partner_payout_accounts"
  ADD COLUMN IF NOT EXISTS "account_number_cipher" TEXT,
  ADD COLUMN IF NOT EXISTS "upi_id_cipher" TEXT,
  ADD COLUMN IF NOT EXISTS "beneficiary_live_ready" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "partner_payout_accounts"."account_number_cipher" IS 'AES-GCM ciphertext for live bank account; never expose to clients';
COMMENT ON COLUMN "partner_payout_accounts"."upi_id_cipher" IS 'AES-GCM ciphertext for live UPI; never expose to clients';
