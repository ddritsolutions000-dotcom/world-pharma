-- AlterEnum
ALTER TYPE "JwtAudience" ADD VALUE IF NOT EXISTS 'doctor';

-- AlterEnum
ALTER TYPE "OrganizationKind" ADD VALUE IF NOT EXISTS 'INDEPENDENT_PRACTICE';

-- CreateEnum
CREATE TYPE "CredentialReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClinicalRelationshipKind" AS ENUM ('CARE', 'ORGANIZATION', 'EXPLICIT');

-- CreateEnum
CREATE TYPE "ClinicalRelationshipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "professional_name" TEXT NOT NULL DEFAULT '',
    "gender" TEXT,
    "languages" JSONB NOT NULL DEFAULT '[]',
    "specialties" JSONB NOT NULL DEFAULT '[]',
    "bio" TEXT,
    "years_experience" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "consultation_config" JSONB NOT NULL DEFAULT '{}',
    "online_capable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_credentials" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "credential_type" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "status" "CredentialReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "object_key" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "doctor_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_service_locations" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_service_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_grants" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "subject_person_id" UUID NOT NULL,
    "recipient_partner_id" UUID NOT NULL,
    "organization_id" UUID,
    "purpose" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '[]',
    "status" "ConsentGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "granted_by_person_id" UUID NOT NULL,
    "revoked_by_person_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consent_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_relationships" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "patient_person_id" UUID NOT NULL,
    "doctor_partner_id" UUID NOT NULL,
    "organization_id" UUID,
    "kind" "ClinicalRelationshipKind" NOT NULL,
    "status" "ClinicalRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clinical_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_access_audits" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "doctor_partner_id" UUID,
    "patient_person_id" UUID,
    "purpose" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_access_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_verification_reviews" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "application_id" UUID,
    "actor_person_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_verification_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_profiles_partner_id_key" ON "doctor_profiles"("partner_id");
CREATE INDEX "doctor_profiles_country_id_person_id_idx" ON "doctor_profiles"("country_id", "person_id");
CREATE UNIQUE INDEX "doctor_credentials_partner_id_credential_type_number_key" ON "doctor_credentials"("partner_id", "credential_type", "number");
CREATE INDEX "doctor_credentials_partner_id_status_idx" ON "doctor_credentials"("partner_id", "status");
CREATE INDEX "doctor_credentials_country_id_status_idx" ON "doctor_credentials"("country_id", "status");
CREATE INDEX "doctor_credentials_expires_on_idx" ON "doctor_credentials"("expires_on");
CREATE UNIQUE INDEX "doctor_service_locations_profile_id_location_id_key" ON "doctor_service_locations"("profile_id", "location_id");
CREATE INDEX "doctor_service_locations_country_id_idx" ON "doctor_service_locations"("country_id");
CREATE INDEX "consent_grants_subject_person_id_recipient_partner_id_status_idx" ON "consent_grants"("subject_person_id", "recipient_partner_id", "status");
CREATE INDEX "consent_grants_country_id_status_idx" ON "consent_grants"("country_id", "status");
CREATE INDEX "consent_grants_expires_at_idx" ON "consent_grants"("expires_at");
CREATE UNIQUE INDEX "clinical_relationships_patient_person_id_doctor_partner_id_organization_id_key" ON "clinical_relationships"("patient_person_id", "doctor_partner_id", "organization_id");
CREATE INDEX "clinical_relationships_doctor_partner_id_status_idx" ON "clinical_relationships"("doctor_partner_id", "status");
CREATE INDEX "clinical_relationships_country_id_status_idx" ON "clinical_relationships"("country_id", "status");
CREATE INDEX "clinical_access_audits_doctor_partner_id_created_at_idx" ON "clinical_access_audits"("doctor_partner_id", "created_at");
CREATE INDEX "clinical_access_audits_country_id_created_at_idx" ON "clinical_access_audits"("country_id", "created_at");
CREATE INDEX "doctor_verification_reviews_partner_id_created_at_idx" ON "doctor_verification_reviews"("partner_id", "created_at");

ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_credentials" ADD CONSTRAINT "doctor_credentials_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_credentials" ADD CONSTRAINT "doctor_credentials_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_credentials" ADD CONSTRAINT "doctor_credentials_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_service_locations" ADD CONSTRAINT "doctor_service_locations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "doctor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_service_locations" ADD CONSTRAINT "doctor_service_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_service_locations" ADD CONSTRAINT "doctor_service_locations_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_subject_person_id_fkey" FOREIGN KEY ("subject_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_granted_by_person_id_fkey" FOREIGN KEY ("granted_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_recipient_partner_id_fkey" FOREIGN KEY ("recipient_partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_relationships" ADD CONSTRAINT "clinical_relationships_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_relationships" ADD CONSTRAINT "clinical_relationships_patient_person_id_fkey" FOREIGN KEY ("patient_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_relationships" ADD CONSTRAINT "clinical_relationships_doctor_partner_id_fkey" FOREIGN KEY ("doctor_partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_relationships" ADD CONSTRAINT "clinical_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_access_audits" ADD CONSTRAINT "clinical_access_audits_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_access_audits" ADD CONSTRAINT "clinical_access_audits_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_verification_reviews" ADD CONSTRAINT "doctor_verification_reviews_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_verification_reviews" ADD CONSTRAINT "doctor_verification_reviews_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "doctor_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_profiles_tenant" ON "doctor_profiles" USING (true) WITH CHECK (true);

ALTER TABLE "doctor_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_credentials_tenant" ON "doctor_credentials" USING (true) WITH CHECK (true);

ALTER TABLE "doctor_service_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_service_locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_service_locations_tenant" ON "doctor_service_locations" USING (true) WITH CHECK (true);

ALTER TABLE "consent_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consent_grants_tenant" ON "consent_grants" USING (true) WITH CHECK (true);

ALTER TABLE "clinical_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_relationships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "clinical_relationships_tenant" ON "clinical_relationships" USING (true) WITH CHECK (true);

ALTER TABLE "clinical_access_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_access_audits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "clinical_access_audits_tenant" ON "clinical_access_audits" USING (true) WITH CHECK (true);

ALTER TABLE "doctor_verification_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_verification_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doctor_verification_reviews_tenant" ON "doctor_verification_reviews" USING (true) WITH CHECK (true);
