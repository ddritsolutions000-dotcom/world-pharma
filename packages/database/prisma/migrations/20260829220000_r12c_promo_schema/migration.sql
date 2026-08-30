-- R12-C: promo campaign lifecycle columns

CREATE TYPE "PromoCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

ALTER TABLE "promo_campaigns" ADD COLUMN "status" "PromoCampaignStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "promo_campaigns" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "promo_campaigns" ADD COLUMN "created_by_person_id" UUID;
ALTER TABLE "promo_campaigns" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing checkout promos remain redeemable
UPDATE "promo_campaigns" SET "status" = 'ACTIVE' WHERE "status" = 'DRAFT';

CREATE INDEX "promo_campaigns_country_id_status_idx" ON "promo_campaigns"("country_id", "status");

ALTER TABLE "promo_campaigns" ADD CONSTRAINT "promo_campaigns_created_by_person_id_fkey"
  FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
