-- R13-A: search indexing kernel — job persistence + catalog search document version

CREATE TYPE "SearchIndexKind" AS ENUM ('CATALOG');

CREATE TYPE "SearchIndexJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "search_index_jobs" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "index_kind" "SearchIndexKind" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "SearchIndexJobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "search_index_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_index_jobs_idempotency_key_key" ON "search_index_jobs"("idempotency_key");
CREATE INDEX "search_index_jobs_country_id_status_created_at_idx" ON "search_index_jobs"("country_id", "status", "created_at");
CREATE INDEX "search_index_jobs_source_type_source_id_created_at_idx" ON "search_index_jobs"("source_type", "source_id", "created_at");

ALTER TABLE "search_index_jobs" ADD CONSTRAINT "search_index_jobs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_search_documents" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
