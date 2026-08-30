# 40 — Identity Implementation Notes

**Status:** Phase 0 Task 2 — implemented kernel  
**Canonical model:** [03](03_USER_ROLES_AND_PERMISSIONS.md), [20](20_DATABASE_ARCHITECTURE.md), [21](21_API_ARCHITECTURE.md), [27](27_SECURITY_ARCHITECTURE.md)

This note records what shipped. It does not replace the blueprint.

Company-owned vs partner org authority is implemented in `apps/api/src/identity/authority.ts` and [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md). Org roles do not receive company permissions.

---

## Implemented architecture

Identity is a NestJS module (`apps/api/src/identity`) on the modular monolith. There is **one** human: `Person`. Login credentials live on `Account`. Phone/email live on `AccountIdentifier` (globally unique per type). Business profiles (customer, doctor, pharmacy, …) are **not** in this task.

```
Person 1──1 Account
Person 1──N AccountIdentifier (PHONE | EMAIL)
Person 1──N Session ──N RefreshToken (rotating family)
Person 1──N Membership ── Role ── Permission
Person 1──N OtpChallenge (HMAC at rest)
Person 0──N TotpSecret / RecoveryCode (schema only)
```

Primary keys are UUID v7 generated in the application.

---

## Auth flow

1. `POST /api/v1/auth/otp/request` — normalize identifier, rate-limit IP + identifier (Redis), persist HMAC challenge, dispatch via `OtpAdapter`.
2. `POST /api/v1/auth/otp/verify` — constant-time HMAC compare, consume challenge, create Person/Account if needed, issue access JWT + rotating refresh.
3. Access JWT is short-lived (`sub`, `sid`, `aud`, optional `membership_id` / `roles[]` hint, `ver`). Server reloads session + account status on each guarded request.
4. `POST /api/v1/auth/token/refresh` — rotate refresh; reuse of a rotated token revokes the family (`STOLEN`).
5. `POST /api/v1/auth/logout` and `/auth/logout-all`.
6. `GET /api/v1/me` (alias `GET /api/v1/auth/me`) — safe identity only.

Audience values: `customer` | `partner_applicant` | `admin`. Admin audience is issued only when the person already has `super_admin` or `global_admin`.

---

## OTP

| Control | Phase 0 |
| --- | --- |
| Length | 6 digits |
| Storage | HMAC-SHA256(`OTP_PEPPER`, `challengeId:code`) |
| TTL | 300s |
| Attempts | 5 then LOCKED |
| Resend | 60s |
| Rate limit | 5 / identifier / 15m and 10 / IP / 15m (Redis) |
| Provider | `ConsoleOtpAdapter` (no SMS/email vendor) |

Purposes: `REGISTER`, `LOGIN`, `VERIFY_EMAIL`, `VERIFY_PHONE`, `ACCOUNT_RECOVERY`, `STEP_UP`.

Unknown identifiers still receive a generic 200 on request (no account-existence leak). Disabled/locked accounts fail after a valid OTP with a generic `AUTH_DENIED`.

Local only: `AUTH_DEV_REVEAL_OTP=true` returns `dev_code`. **Forbidden in production** (env parser rejects it).

---

## Sessions and refresh

- Access TTL 15 minutes; refresh 14 days (customer-class default).
- Refresh stored as SHA-256; raw token returned once.
- Rotation: previous row `ROTATED`; reuse → family + session `STOLEN` + `REFRESH_TOKEN_REUSE_DETECTED`.
- JWT is not the session source of truth; `sid` must match an `ACTIVE` session with matching `token_version`.

---

## RBAC

Seeded system roles: `super_admin`, `global_admin`.  
Seeded permissions: `user:read`, `session:revoke`, `identity:audit_read`.

Guards: `JwtAuthGuard`, `PermissionsGuard` + `@RequirePermissions()`. Controllers must not parse JWTs.

Password hash and TOTP tables exist; **no password or TOTP enrollment API** in this task.

---

## Security controls

- Helmet headers, request id, Problem+JSON errors
- Redis rate limits on OTP
- HMAC OTP, hashed refresh, hashed IP/UA
- No OTP/refresh/JWT/MFA secrets in `security_events.metadata`
- RLS **enabled** on identity tables with a **permissive USING (true)** policy until Country Policy Packs (Task 3) set `app.country_id`. RLS is not disabled.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** retention of `otp_challenges`, `sessions`, `security_events` is not encoded as a legal period. Engineering default: OTP rows are short-lived; sessions follow refresh TTL; security events are append-only. Country packs must set retention later.

---

## Local development

```bash
cp .env.example .env   # AUTH_DEV_REVEAL_OTP=true
pnpm install
docker compose up -d
pnpm exec prisma migrate deploy --schema packages/database/prisma/schema.prisma
pnpm dev
```

If a native PostgreSQL is already bound to `5432`, set `POSTGRES_PORT` / `DATABASE_URL` to another host port (this machine uses `55432`).

```http
POST /api/v1/auth/otp/request
{ "identifier": "dev@example.com", "purpose": "REGISTER" }

POST /api/v1/auth/otp/verify
{ "challenge_id": "...", "code": "<dev_code>" }

GET /api/v1/me
Authorization: Bearer <access_token>
```

Health remains `GET /health` (no `/api/v1` prefix).

---

## Deferred

| Item | Why |
| --- | --- |
| SMS/email/WhatsApp vendors | OD-NTF-01 |
| Password login | OTP-first (OD-SEC-02) |
| TOTP enforcement | Schema ready; required later for admin/professionals |
| Country Policy Packs | Task 3 |
| CustomerProfile / Partner profiles | Separate from identity |
| Outbox dispatcher | Events persist to `security_events`; bus comes later |
| FORCE RLS + `app.country_id` | Task 3 |
| Social login / WebAuthn | OD-SEC-01 |

**Next task:** Phase 0 Task 3 — Country Policy Pack foundation. Do not start it from this note.
