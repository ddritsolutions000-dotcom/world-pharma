-- Company-owned admin authority: privilege grants, break-glass, policy authorship.

CREATE TYPE "PrivilegeGrantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TABLE "privilege_grant_requests" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "target_person_id" UUID NOT NULL,
    "role_code" TEXT NOT NULL,
    "scope" "MembershipScope" NOT NULL DEFAULT 'platform',
    "country_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "status" "PrivilegeGrantStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    CONSTRAINT "privilege_grant_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "break_glass_grants" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "break_glass_grants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "privilege_grant_requests"
    ADD CONSTRAINT "privilege_grant_requests_target_person_id_fkey"
    FOREIGN KEY ("target_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privilege_grant_requests"
    ADD CONSTRAINT "privilege_grant_requests_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privilege_grant_requests"
    ADD CONSTRAINT "privilege_grant_requests_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "break_glass_grants"
    ADD CONSTRAINT "break_glass_grants_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "break_glass_grants"
    ADD CONSTRAINT "break_glass_grants_granted_by_id_fkey"
    FOREIGN KEY ("granted_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "privilege_grant_requests_target_person_id_status_idx" ON "privilege_grant_requests"("target_person_id", "status");
CREATE INDEX "privilege_grant_requests_status_created_at_idx" ON "privilege_grant_requests"("status", "created_at");
CREATE INDEX "break_glass_grants_person_id_expires_at_idx" ON "break_glass_grants"("person_id", "expires_at");

ALTER TABLE "policy_packs" ADD COLUMN "created_by_id" UUID;
