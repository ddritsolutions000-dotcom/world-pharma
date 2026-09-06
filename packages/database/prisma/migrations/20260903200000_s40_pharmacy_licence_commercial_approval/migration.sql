-- Sprint 40: Pharmacy licence verification + partner commercial approval

CREATE TYPE "PharmacyLicenceStatus" AS ENUM (
  'NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED'
);

-- PharmacyLicence
CREATE TABLE "pharmacy_licences" (
    "id"                    UUID NOT NULL,
    "partner_id"            UUID NOT NULL,
    "country_id"            UUID NOT NULL,
    "licence_authority"     TEXT NOT NULL,
    "licence_number"        TEXT NOT NULL,
    "responsible_pharmacist" TEXT,
    "issued_at"             TIMESTAMPTZ,
    "expires_at"            TIMESTAMPTZ,
    "status"                "PharmacyLicenceStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "verified_by_id"        UUID,
    "verified_at"           TIMESTAMPTZ,
    "rejected_at"           TIMESTAMPTZ,
    "rejection_reason"      TEXT,
    "evidence_object_key"   TEXT,
    "regulatory_evidence_id" UUID,
    "notes"                 TEXT,
    "created_by_id"         UUID,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pharmacy_licences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pharmacy_licences_partner_id_country_id_idx"
    ON "pharmacy_licences"("partner_id", "country_id");
CREATE INDEX "pharmacy_licences_status_idx" ON "pharmacy_licences"("status");
ALTER TABLE "pharmacy_licences"
    ADD CONSTRAINT "pharmacy_licences_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pharmacy_licences"
    ADD CONSTRAINT "pharmacy_licences_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PartnerCommercialApproval
CREATE TABLE "partner_commercial_approvals" (
    "id"              UUID NOT NULL,
    "partner_id"      UUID NOT NULL,
    "country_id"      UUID NOT NULL,
    "approved"        BOOLEAN NOT NULL DEFAULT false,
    "approved_by_id"  UUID,
    "approved_at"     TIMESTAMPTZ,
    "revoked_by_id"   UUID,
    "revoked_at"      TIMESTAMPTZ,
    "notes"           TEXT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "partner_commercial_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_commercial_approvals_partner_id_country_id_key"
        UNIQUE ("partner_id", "country_id")
);
CREATE INDEX "partner_commercial_approvals_partner_id_idx"
    ON "partner_commercial_approvals"("partner_id");
ALTER TABLE "partner_commercial_approvals"
    ADD CONSTRAINT "partner_commercial_approvals_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_commercial_approvals"
    ADD CONSTRAINT "partner_commercial_approvals_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
