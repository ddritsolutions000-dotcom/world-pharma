-- R12-B: marketing segments, campaigns, sends, suppressions

CREATE TYPE "CrmSegmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "CrmCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CrmCampaignChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS', 'WHATSAPP');
CREATE TYPE "CrmCampaignSendStatus" AS ENUM ('SENT', 'SKIPPED');
CREATE TYPE "CrmSuppressionChannel" AS ENUM ('ALL', 'IN_APP', 'EMAIL', 'PUSH', 'SMS', 'WHATSAPP');

CREATE TABLE "crm_segments" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CrmSegmentStatus" NOT NULL DEFAULT 'DRAFT',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "crm_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_campaigns" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "segment_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CrmCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "CrmCampaignChannel" NOT NULL DEFAULT 'IN_APP',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cms_content_id" UUID,
    "scheduled_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_campaign_sends" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'default',
    "status" "CrmCampaignSendStatus" NOT NULL,
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_campaign_sends_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_suppressions" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "channel" "CrmSuppressionChannel" NOT NULL DEFAULT 'ALL',
    "reason" TEXT NOT NULL DEFAULT 'opt_out',
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_segments_country_id_code_key" ON "crm_segments"("country_id", "code");
CREATE INDEX "crm_segments_country_id_status_idx" ON "crm_segments"("country_id", "status");

CREATE UNIQUE INDEX "crm_campaigns_country_id_code_key" ON "crm_campaigns"("country_id", "code");
CREATE INDEX "crm_campaigns_country_id_status_idx" ON "crm_campaigns"("country_id", "status");

CREATE UNIQUE INDEX "crm_campaign_sends_campaign_id_person_id_idempotency_key_key" ON "crm_campaign_sends"("campaign_id", "person_id", "idempotency_key");
CREATE INDEX "crm_campaign_sends_campaign_id_created_at_idx" ON "crm_campaign_sends"("campaign_id", "created_at");
CREATE INDEX "crm_campaign_sends_person_id_created_at_idx" ON "crm_campaign_sends"("person_id", "created_at");

CREATE UNIQUE INDEX "crm_suppressions_person_id_country_id_channel_key" ON "crm_suppressions"("person_id", "country_id", "channel");
CREATE INDEX "crm_suppressions_country_id_channel_idx" ON "crm_suppressions"("country_id", "channel");

ALTER TABLE "crm_segments" ADD CONSTRAINT "crm_segments_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_segments" ADD CONSTRAINT "crm_segments_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "crm_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crm_campaign_sends" ADD CONSTRAINT "crm_campaign_sends_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "crm_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_campaign_sends" ADD CONSTRAINT "crm_campaign_sends_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_campaign_sends" ADD CONSTRAINT "crm_campaign_sends_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crm_suppressions" ADD CONSTRAINT "crm_suppressions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_suppressions" ADD CONSTRAINT "crm_suppressions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
