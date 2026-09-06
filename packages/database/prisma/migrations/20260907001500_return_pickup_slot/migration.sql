-- 1mg-like returns: optional pickup slot + link to outbound shipment for reverse pickup.
ALTER TABLE "return_requests"
  ADD COLUMN IF NOT EXISTS "pickup_slot_start" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickup_slot_end" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "shipment_id" UUID;

CREATE INDEX IF NOT EXISTS "return_requests_shipment_id_idx" ON "return_requests"("shipment_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'return_requests_shipment_id_fkey'
  ) THEN
    ALTER TABLE "return_requests"
      ADD CONSTRAINT "return_requests_shipment_id_fkey"
      FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
