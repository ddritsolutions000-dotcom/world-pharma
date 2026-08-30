-- R13-G: Clinical/PHI search index (metadata only — not in public discovery)

ALTER TYPE "SearchIndexKind" ADD VALUE IF NOT EXISTS 'CLINICAL';

CREATE TABLE "clinical_search_documents" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "artifact_type" "HealthArtifactType" NOT NULL,
    "title" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clinical_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinical_search_documents_artifact_id_country_id_key"
  ON "clinical_search_documents"("artifact_id", "country_id");
CREATE INDEX "clinical_search_documents_country_id_person_id_published_idx"
  ON "clinical_search_documents"("country_id", "person_id", "published");
CREATE INDEX "clinical_search_documents_person_id_published_at_idx"
  ON "clinical_search_documents"("person_id", "published_at");

ALTER TABLE "clinical_search_documents"
  ADD CONSTRAINT "clinical_search_documents_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
