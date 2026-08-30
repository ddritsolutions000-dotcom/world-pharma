-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT', 'REGISTERED', 'PROFILE_INCOMPLETE', 'DOCUMENTS_REQUIRED', 'DOCUMENTS_SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'VERIFIED', 'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'BLOCKED', 'DEACTIVATED', 'REACTIVATION_REQUESTED');

-- CreateEnum
CREATE TYPE "PartnerApplicationSource" AS ENUM ('INTERNAL', 'INVITE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "KycCaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('PLATFORM', 'PHARMACY_OWNED', 'VENDOR', 'CLINIC', 'HOSPITAL', 'LAB', 'LOGISTICS_FLEET', 'AFFILIATE_ORG', 'HEALTHCARE_BUSINESS');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('STORE', 'WAREHOUSE', 'LAB', 'CLINIC', 'HOSPITAL', 'VENDOR_WAREHOUSE', 'COLLECTION_POINT');

-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('ADMIN', 'ORGANIZATION', 'STAFF', 'REFERRAL', 'PUBLIC_LINK');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "partner_type_code" TEXT NOT NULL,
    "country_id" UUID NOT NULL,
    "organization_id" UUID,
    "status" "PartnerStatus" NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ,
    "suspended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_applications" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "partner_type_code" TEXT NOT NULL,
    "country_id" UUID NOT NULL,
    "source" "PartnerApplicationSource" NOT NULL DEFAULT 'INTERNAL',
    "status" "PartnerStatus" NOT NULL DEFAULT 'DRAFT',
    "pack_version" INTEGER,
    "reviewer_id" UUID,
    "rejection_reason" TEXT,
    "info_request" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_status_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "from_status" "PartnerStatus",
    "to_status" "PartnerStatus" NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_cases" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "application_id" UUID,
    "country_id" UUID NOT NULL,
    "status" "KycCaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "verification_level" TEXT,
    "reviewer_id" UUID,
    "rejection_reason" TEXT,
    "started_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "verified_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_documents" (
    "id" UUID NOT NULL,
    "kyc_case_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "document_type_code" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "issuer" TEXT,
    "expires_on" DATE,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewer_id" UUID,
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ,

    CONSTRAINT "partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "kind" "OrganizationKind" NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "address_line" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_invitations" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "country_id" UUID NOT NULL,
    "partner_type_code" TEXT,
    "organization_id" UUID,
    "partner_id" UUID,
    "intended_role_code" TEXT NOT NULL,
    "invited_email" TEXT,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_country_id_status_idx" ON "partners"("country_id", "status");

-- CreateIndex
CREATE INDEX "partners_partner_type_code_status_idx" ON "partners"("partner_type_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partners_person_id_partner_type_code_country_id_key" ON "partners"("person_id", "partner_type_code", "country_id");

-- CreateIndex
CREATE INDEX "partner_applications_partner_id_status_idx" ON "partner_applications"("partner_id", "status");

-- CreateIndex
CREATE INDEX "partner_applications_country_id_status_idx" ON "partner_applications"("country_id", "status");

-- CreateIndex
CREATE INDEX "partner_status_history_application_id_created_at_idx" ON "partner_status_history"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "kyc_cases_partner_id_status_idx" ON "kyc_cases"("partner_id", "status");

-- CreateIndex
CREATE INDEX "partner_documents_kyc_case_id_status_idx" ON "partner_documents"("kyc_case_id", "status");

-- CreateIndex
CREATE INDEX "organizations_country_id_status_idx" ON "organizations"("country_id", "status");

-- CreateIndex
CREATE INDEX "locations_organization_id_is_active_idx" ON "locations"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitations_token_hash_key" ON "partner_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "partner_invitations_status_expires_at_idx" ON "partner_invitations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_person_id_organization_id_role_id_key" ON "memberships"("person_id", "organization_id", "role_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_partner_type_code_fkey" FOREIGN KEY ("partner_type_code") REFERENCES "partner_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_status_history" ADD CONSTRAINT "partner_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_kyc_case_id_fkey" FOREIGN KEY ("kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitations" ADD CONSTRAINT "partner_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners_app_all" ON "partners" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "partner_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_applications_app_all" ON "partner_applications" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "partner_status_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_status_history_app_all" ON "partner_status_history" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "kyc_cases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kyc_cases_app_all" ON "kyc_cases" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "partner_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_documents_app_all" ON "partner_documents" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_app_all" ON "organizations" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_app_all" ON "locations" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "partner_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_invitations_app_all" ON "partner_invitations" FOR ALL USING (true) WITH CHECK (true);

