-- Identity kernel. RLS is enabled; policies are permissive until Country Policy Packs set app.country_id.

CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'PENDING', 'DISABLED', 'PENDING_DELETION');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');
CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'EMAIL');
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'ACCOUNT_RECOVERY', 'STEP_UP');
CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'LOCKED');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'STOLEN');
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "MembershipScope" AS ENUM ('platform', 'country', 'organization', 'location', 'self');
CREATE TYPE "JwtAudience" AS ENUM ('customer', 'partner_applicant', 'admin');
CREATE TYPE "RefreshTokenStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'PENDING',
    "status_reason" TEXT,
    "preferred_locale" TEXT,
    "primary_country_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" TEXT,
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_identifiers" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value_normalized" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "person_id" UUID,
    "identifier_type" "IdentifierType" NOT NULL,
    "identifier_normalized" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hmac" TEXT NOT NULL,
    "status" "OtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "resend_available_at" TIMESTAMPTZ NOT NULL,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "country_id" UUID,
    "bound_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "device_id" UUID,
    "membership_id" UUID,
    "audience" "JwtAudience" NOT NULL,
    "country_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "RefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "rotated_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "reused_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "parent_role_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope" "MembershipScope" NOT NULL,
    "country_id" UUID,
    "organization_id" UUID,
    "location_id" UUID,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "totp_secrets" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "secret_cipher" TEXT NOT NULL,
    "enrolled_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "totp_secrets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "person_id" UUID,
    "session_id" UUID,
    "outcome" TEXT NOT NULL,
    "request_id" TEXT,
    "ip_hash" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_person_id_key" ON "accounts"("person_id");
CREATE INDEX "account_identifiers_person_id_idx" ON "account_identifiers"("person_id");
CREATE UNIQUE INDEX "account_identifiers_type_value_normalized_key" ON "account_identifiers"("type", "value_normalized");
CREATE INDEX "otp_challenges_identifier_normalized_purpose_created_at_idx" ON "otp_challenges"("identifier_normalized", "purpose", "created_at");
CREATE INDEX "otp_challenges_status_expires_at_idx" ON "otp_challenges"("status", "expires_at");
CREATE INDEX "devices_person_id_status_idx" ON "devices"("person_id", "status");
CREATE INDEX "sessions_person_id_status_idx" ON "sessions"("person_id", "status");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_session_id_status_idx" ON "refresh_tokens"("session_id", "status");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "memberships_person_id_status_idx" ON "memberships"("person_id", "status");
CREATE INDEX "totp_secrets_person_id_idx" ON "totp_secrets"("person_id");
CREATE INDEX "recovery_codes_person_id_idx" ON "recovery_codes"("person_id");
CREATE INDEX "security_events_person_id_created_at_idx" ON "security_events"("person_id", "created_at");
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_identifiers" ADD CONSTRAINT "account_identifiers_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "totp_secrets" ADD CONSTRAINT "totp_secrets_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "totp_secrets" ADD CONSTRAINT "totp_secrets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "persons" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "persons_app_all" ON "persons" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_app_all" ON "accounts" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "account_identifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_identifiers_app_all" ON "account_identifiers" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "otp_challenges" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "otp_challenges_app_all" ON "otp_challenges" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_app_all" ON "devices" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_app_all" ON "sessions" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refresh_tokens_app_all" ON "refresh_tokens" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_app_all" ON "memberships" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "totp_secrets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "totp_secrets_app_all" ON "totp_secrets" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "recovery_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_codes_app_all" ON "recovery_codes" FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_events_app_all" ON "security_events" FOR ALL USING (true) WITH CHECK (true);
