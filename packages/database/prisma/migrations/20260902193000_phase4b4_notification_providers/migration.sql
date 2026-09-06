CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'PUSH', 'IN_APP', 'WHATSAPP');
CREATE TYPE "NotificationProviderRole" AS ENUM ('PRIMARY', 'FALLBACK');
CREATE TYPE "NotificationConfigStatus" AS ENUM ('UNCONFIGURED', 'SANDBOX', 'VERIFIED');

CREATE TABLE "notification_country_providers" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "provider_code" TEXT NOT NULL,
  "provider_name" TEXT NOT NULL,
  "role" "NotificationProviderRole" NOT NULL DEFAULT 'PRIMARY',
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "config_status" "NotificationConfigStatus" NOT NULL DEFAULT 'UNCONFIGURED',
  "secret_ref" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "last_verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_country_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_country_providers_country_id_channel_provider_code_role_key"
  ON "notification_country_providers"("country_id", "channel", "provider_code", "role");
CREATE INDEX "notification_country_providers_country_id_channel_active_idx"
  ON "notification_country_providers"("country_id", "channel", "active");

ALTER TABLE "notification_country_providers"
  ADD CONSTRAINT "notification_country_providers_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_country_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_country_providers" FORCE ROW LEVEL SECURITY;

CREATE POLICY "notification_country_providers_select" ON "notification_country_providers"
  FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR app.can_country(country_id));

CREATE POLICY "notification_country_providers_insert" ON "notification_country_providers"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "notification_country_providers_update" ON "notification_country_providers"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.actor_kind() IN ('user', 'worker'))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "notification_country_providers_delete" ON "notification_country_providers"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform());

GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_country_providers" TO worldpharma_app;
