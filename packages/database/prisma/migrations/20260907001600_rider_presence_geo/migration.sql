-- Coarse GPS on rider presence for nearest online rider assignment.
ALTER TABLE "rider_presence" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(9,6);
ALTER TABLE "rider_presence" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(9,6);
