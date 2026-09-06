-- Super Admin dual-control fields for partner withdraws
ALTER TABLE "partner_withdraw_requests"
  ADD COLUMN IF NOT EXISTS "approved_by" UUID,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "executed_by" UUID,
  ADD COLUMN IF NOT EXISTS "rejected_by" UUID,
  ADD COLUMN IF NOT EXISTS "reject_note" TEXT;

-- APPROVED status for Super Admin queue (between REQUESTED and PROCESSING)
DO $$ BEGIN
  ALTER TYPE "PartnerWithdrawStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "partner_withdraw_requests_status_created_at_idx"
  ON "partner_withdraw_requests"("status", "created_at");
