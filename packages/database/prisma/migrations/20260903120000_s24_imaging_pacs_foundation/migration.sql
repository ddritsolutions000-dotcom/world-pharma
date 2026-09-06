-- S24: Imaging PACS/DICOM foundation — study UIDs, series, instances with private object refs.

ALTER TABLE "imaging_studies" ADD COLUMN IF NOT EXISTS "study_instance_uid" TEXT;
ALTER TABLE "imaging_studies" ADD COLUMN IF NOT EXISTS "study_description" TEXT;
ALTER TABLE "imaging_studies" ADD COLUMN IF NOT EXISTS "study_date_time" TIMESTAMPTZ;
ALTER TABLE "imaging_studies" ADD COLUMN IF NOT EXISTS "ingest_idempotency_key" TEXT;

UPDATE "imaging_studies"
SET "study_instance_uid" = '2.25.' || replace(id::text, '-', '')
WHERE "study_instance_uid" IS NULL;

ALTER TABLE "imaging_studies" ALTER COLUMN "study_instance_uid" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "imaging_studies_study_instance_uid_key" ON "imaging_studies"("study_instance_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "imaging_studies_ingest_idempotency_key_key" ON "imaging_studies"("ingest_idempotency_key") WHERE "ingest_idempotency_key" IS NOT NULL;

CREATE TYPE "ImagingStudyInstanceStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

CREATE TABLE "imaging_study_series" (
    "id" UUID NOT NULL,
    "imaging_study_id" UUID NOT NULL,
    "series_instance_uid" TEXT NOT NULL,
    "modality_code" TEXT,
    "description" TEXT,
    "series_number" INTEGER,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_study_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_study_instances" (
    "id" UUID NOT NULL,
    "imaging_series_id" UUID NOT NULL,
    "sop_instance_uid" TEXT NOT NULL,
    "object_key" TEXT,
    "content_type" TEXT,
    "byte_size" BIGINT,
    "checksum_sha256" TEXT,
    "status" "ImagingStudyInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_study_instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imaging_study_series_series_instance_uid_key" ON "imaging_study_series"("series_instance_uid");
CREATE INDEX "imaging_study_series_imaging_study_id_idx" ON "imaging_study_series"("imaging_study_id");

CREATE UNIQUE INDEX "imaging_study_instances_sop_instance_uid_key" ON "imaging_study_instances"("sop_instance_uid");
CREATE UNIQUE INDEX "imaging_study_instances_idempotency_key_key" ON "imaging_study_instances"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "imaging_study_instances_imaging_series_id_idx" ON "imaging_study_instances"("imaging_series_id");

ALTER TABLE "imaging_study_series" ADD CONSTRAINT "imaging_study_series_imaging_study_id_fkey" FOREIGN KEY ("imaging_study_id") REFERENCES "imaging_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_study_instances" ADD CONSTRAINT "imaging_study_instances_imaging_series_id_fkey" FOREIGN KEY ("imaging_series_id") REFERENCES "imaging_study_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
