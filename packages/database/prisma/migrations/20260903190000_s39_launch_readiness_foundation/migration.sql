-- Sprint 39: Launch-market regulatory & production-dependency foundation

-- Enums
CREATE TYPE "HealthcarePolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "RegulatoryRequirementStatus" AS ENUM ('REQUIRED', 'WAIVED', 'NOT_APPLICABLE');
CREATE TYPE "RegulatoryEvidenceStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ProductionDependencyStatus" AS ENUM ('MISSING', 'CONFIGURED', 'EXTERNAL_GATED', 'VERIFIED', 'EXPIRED', 'BLOCKED');
CREATE TYPE "CountryReadinessDimension" AS ENUM ('SOFTWARE', 'LEGAL', 'COMMERCIAL', 'INTEGRATION', 'PRODUCTION');
CREATE TYPE "CountryReadinessGateStatus" AS ENUM ('READY', 'MISSING', 'EXTERNAL_GATED', 'EXPIRED', 'BLOCKED');

-- HealthcarePolicy
CREATE TABLE "healthcare_policies" (
    "id"                UUID NOT NULL,
    "country_id"        UUID NOT NULL,
    "version"           INTEGER NOT NULL,
    "status"            "HealthcarePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "requirements"      JSONB NOT NULL,
    "regulatory_body"   TEXT,
    "effective_from"    TIMESTAMPTZ,
    "published_at"      TIMESTAMPTZ,
    "published_by_id"   UUID,
    "created_by_id"     UUID,
    "superseded_at"     TIMESTAMPTZ,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "healthcare_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "healthcare_policies_country_id_version_key" UNIQUE ("country_id", "version")
);
CREATE INDEX "healthcare_policies_country_id_status_idx" ON "healthcare_policies"("country_id", "status");
ALTER TABLE "healthcare_policies" ADD CONSTRAINT "healthcare_policies_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RegulatoryRequirement
CREATE TABLE "regulatory_requirements" (
    "id"              UUID NOT NULL,
    "country_id"      UUID NOT NULL,
    "code"            TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "description"     TEXT,
    "status"          "RegulatoryRequirementStatus" NOT NULL DEFAULT 'REQUIRED',
    "category"        TEXT NOT NULL,
    "reference_url"   TEXT,
    "notes"           TEXT,
    "created_by_id"   UUID,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "regulatory_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regulatory_requirements_country_id_code_key" UNIQUE ("country_id", "code")
);
CREATE INDEX "regulatory_requirements_country_id_idx" ON "regulatory_requirements"("country_id");
ALTER TABLE "regulatory_requirements" ADD CONSTRAINT "regulatory_requirements_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RegulatoryEvidence
CREATE TABLE "regulatory_evidence" (
    "id"                    UUID NOT NULL,
    "country_id"            UUID NOT NULL,
    "requirement_id"        UUID,
    "healthcare_policy_id"  UUID,
    "document_type"         TEXT NOT NULL,
    "status"                "RegulatoryEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "issuer"                TEXT,
    "reference_number"      TEXT,
    "issued_at"             TIMESTAMPTZ,
    "expires_at"            TIMESTAMPTZ,
    "storage_object_key"    TEXT,
    "verification_status"   TEXT,
    "verified_by_id"        UUID,
    "verified_at"           TIMESTAMPTZ,
    "notes"                 TEXT,
    "created_by_id"         UUID,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "regulatory_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "regulatory_evidence_country_id_status_idx" ON "regulatory_evidence"("country_id", "status");
CREATE INDEX "regulatory_evidence_requirement_id_idx" ON "regulatory_evidence"("requirement_id");
ALTER TABLE "regulatory_evidence" ADD CONSTRAINT "regulatory_evidence_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regulatory_evidence" ADD CONSTRAINT "regulatory_evidence_requirement_id_fkey"
    FOREIGN KEY ("requirement_id") REFERENCES "regulatory_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regulatory_evidence" ADD CONSTRAINT "regulatory_evidence_healthcare_policy_id_fkey"
    FOREIGN KEY ("healthcare_policy_id") REFERENCES "healthcare_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ProductionDependency
CREATE TABLE "production_dependencies" (
    "id"                    UUID NOT NULL,
    "country_id"            UUID,
    "dependency_type"       TEXT NOT NULL,
    "environment"           TEXT NOT NULL DEFAULT 'production',
    "status"                "ProductionDependencyStatus" NOT NULL DEFAULT 'MISSING',
    "provider_identifier"   TEXT,
    "config_reference"      TEXT,
    "verification_status"   TEXT,
    "last_verified_at"      TIMESTAMPTZ,
    "external_gated"        BOOLEAN NOT NULL DEFAULT true,
    "notes"                 TEXT,
    "created_by_id"         UUID,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "production_dependencies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "production_dependencies_country_id_dependency_type_idx"
    ON "production_dependencies"("country_id", "dependency_type");
CREATE INDEX "production_dependencies_dependency_type_environment_idx"
    ON "production_dependencies"("dependency_type", "environment");
ALTER TABLE "production_dependencies" ADD CONSTRAINT "production_dependencies_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CountryReadinessGate
CREATE TABLE "country_readiness_gates" (
    "id"          UUID NOT NULL,
    "country_id"  UUID NOT NULL,
    "dimension"   "CountryReadinessDimension" NOT NULL,
    "status"      "CountryReadinessGateStatus" NOT NULL DEFAULT 'MISSING',
    "blockers"    JSONB NOT NULL DEFAULT '[]',
    "notes"       TEXT,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "country_readiness_gates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "country_readiness_gates_country_id_dimension_key" UNIQUE ("country_id", "dimension")
);
CREATE INDEX "country_readiness_gates_country_id_idx" ON "country_readiness_gates"("country_id");
ALTER TABLE "country_readiness_gates" ADD CONSTRAINT "country_readiness_gates_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
