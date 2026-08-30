-- R13-C: Provider discovery search index tables (public metadata only)

ALTER TYPE "SearchIndexKind" ADD VALUE IF NOT EXISTS 'PROVIDER_DOCTOR';
ALTER TYPE "SearchIndexKind" ADD VALUE IF NOT EXISTS 'PROVIDER_LAB';
ALTER TYPE "SearchIndexKind" ADD VALUE IF NOT EXISTS 'PROVIDER_TEST';
ALTER TYPE "SearchIndexKind" ADD VALUE IF NOT EXISTS 'PROVIDER_PHARMACY';

CREATE TABLE "provider_doctor_search_documents" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "specialties" TEXT NOT NULL DEFAULT '',
    "online_capable" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_doctor_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_lab_search_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_lab_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_test_search_documents" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "lab_org_id" UUID,
    "lab_name" TEXT NOT NULL DEFAULT '',
    "category_name" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_test_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_pharmacy_search_documents" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_pharmacy_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_doctor_search_documents_profile_id_country_id_locale_key"
  ON "provider_doctor_search_documents"("profile_id", "country_id", "locale");
CREATE INDEX "provider_doctor_search_documents_country_id_published_idx"
  ON "provider_doctor_search_documents"("country_id", "published");

CREATE UNIQUE INDEX "provider_lab_search_documents_organization_id_country_id_locale_key"
  ON "provider_lab_search_documents"("organization_id", "country_id", "locale");
CREATE INDEX "provider_lab_search_documents_country_id_published_idx"
  ON "provider_lab_search_documents"("country_id", "published");

CREATE UNIQUE INDEX "provider_test_search_documents_item_id_country_id_locale_key"
  ON "provider_test_search_documents"("item_id", "country_id", "locale");
CREATE INDEX "provider_test_search_documents_country_id_published_idx"
  ON "provider_test_search_documents"("country_id", "published");
CREATE INDEX "provider_test_search_documents_lab_org_id_idx"
  ON "provider_test_search_documents"("lab_org_id");

CREATE UNIQUE INDEX "provider_pharmacy_search_documents_location_id_country_id_locale_key"
  ON "provider_pharmacy_search_documents"("location_id", "country_id", "locale");
CREATE INDEX "provider_pharmacy_search_documents_country_id_published_idx"
  ON "provider_pharmacy_search_documents"("country_id", "published");

ALTER TABLE "provider_doctor_search_documents"
  ADD CONSTRAINT "provider_doctor_search_documents_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_lab_search_documents"
  ADD CONSTRAINT "provider_lab_search_documents_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_test_search_documents"
  ADD CONSTRAINT "provider_test_search_documents_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_pharmacy_search_documents"
  ADD CONSTRAINT "provider_pharmacy_search_documents_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
