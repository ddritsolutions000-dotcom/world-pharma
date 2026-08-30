-- Country Policy Packs (blueprint 18 / 20)

CREATE TYPE "CountryStatus" AS ENUM ('INACTIVE', 'ACTIVE');
CREATE TYPE "PolicyPackStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

CREATE TABLE "partner_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_types_code_key" ON "partner_types"("code");

CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "iso3166_a2" TEXT NOT NULL,
    "iso3166_a3" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "status" "CountryStatus" NOT NULL DEFAULT 'INACTIVE',
    "default_locale" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL,
    "default_timezone" TEXT NOT NULL,
    "phone_prefix" TEXT,
    "published_policy_pack_id" UUID,
    "data_residency_mode" TEXT NOT NULL DEFAULT 'shared',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "countries_iso3166_a2_key" ON "countries"("iso3166_a2");

CREATE TABLE "policy_packs" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PolicyPackStatus" NOT NULL DEFAULT 'DRAFT',
    "document" JSONB NOT NULL,
    "checksum" TEXT,
    "effective_from" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "published_by_id" UUID,
    "superseded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "policy_packs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "policy_packs_country_id_version_key" ON "policy_packs"("country_id", "version");
CREATE INDEX "policy_packs_country_id_status_idx" ON "policy_packs"("country_id", "status");

ALTER TABLE "policy_packs" ADD CONSTRAINT "policy_packs_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "countries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries_app_all" ON "countries" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "policy_packs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_packs_app_all" ON "policy_packs" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "partner_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_types_app_all" ON "partner_types" FOR ALL USING (true) WITH CHECK (true);
