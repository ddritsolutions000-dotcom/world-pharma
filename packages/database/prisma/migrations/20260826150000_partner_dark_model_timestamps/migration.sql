-- AlterTable
ALTER TABLE "partners" ADD COLUMN "deactivated_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "partner_applications" ADD COLUMN "reviewed_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "partner_documents" ADD COLUMN "rejected_at" TIMESTAMPTZ;
