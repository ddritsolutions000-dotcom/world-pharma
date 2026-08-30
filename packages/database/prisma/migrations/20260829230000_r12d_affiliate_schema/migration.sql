-- R12-D: affiliate referral codes, links, clicks

CREATE TYPE "AffiliateReferralCodeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED');
CREATE TYPE "AffiliateLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "affiliate_referral_codes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "partner_id" UUID,
  "code" TEXT NOT NULL,
  "status" "AffiliateReferralCodeStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMPTZ,
  "created_by_person_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_links" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "referral_code_id" UUID NOT NULL,
  "label" TEXT,
  "landing_path" TEXT,
  "status" "AffiliateLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_person_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_clicks" (
  "id" UUID NOT NULL,
  "click_id" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "referral_code_id" UUID NOT NULL,
  "link_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliate_referral_codes_country_id_code_key" ON "affiliate_referral_codes"("country_id", "code");
CREATE INDEX "affiliate_referral_codes_organization_id_country_id_status_idx" ON "affiliate_referral_codes"("organization_id", "country_id", "status");
CREATE INDEX "affiliate_links_organization_id_country_id_status_idx" ON "affiliate_links"("organization_id", "country_id", "status");
CREATE INDEX "affiliate_links_referral_code_id_idx" ON "affiliate_links"("referral_code_id");
CREATE UNIQUE INDEX "affiliate_clicks_click_id_key" ON "affiliate_clicks"("click_id");
CREATE INDEX "affiliate_clicks_organization_id_country_id_created_at_idx" ON "affiliate_clicks"("organization_id", "country_id", "created_at");
CREATE INDEX "affiliate_clicks_referral_code_id_created_at_idx" ON "affiliate_clicks"("referral_code_id", "created_at");

ALTER TABLE "affiliate_referral_codes" ADD CONSTRAINT "affiliate_referral_codes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_referral_codes" ADD CONSTRAINT "affiliate_referral_codes_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_referral_codes" ADD CONSTRAINT "affiliate_referral_codes_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "affiliate_referral_codes" ADD CONSTRAINT "affiliate_referral_codes_created_by_person_id_fkey"
  FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_referral_code_id_fkey"
  FOREIGN KEY ("referral_code_id") REFERENCES "affiliate_referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_created_by_person_id_fkey"
  FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_referral_code_id_fkey"
  FOREIGN KEY ("referral_code_id") REFERENCES "affiliate_referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_link_id_fkey"
  FOREIGN KEY ("link_id") REFERENCES "affiliate_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
