# 45 — Security / Observability Implementation Notes

**Status:** Phase 0 Task 6 — implemented  
**Canonical:** [27](27_SECURITY_ARCHITECTURE.md), [30](30_OBSERVABILITY.md), [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

Shared kernel for future customer, partner, clinical, logistics, and finance surfaces. No product modules.

The observability architecture filename in the Master Index is `30_OBSERVABILITY.md` (not `30_OBSERVABILITY_ARCHITECTURE.md`).

---

## HTTP security

`configureApi()` (used by `main.ts` and security tests):

- Helmet: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. CSP is **off** (JSON API, not HTML). `Cross-Origin-Resource-Policy` is `cross-origin` so explicit CORS origins are not blocked.
- `Permissions-Policy` disables camera, microphone, geolocation, payment, usb, display-capture.
- CORS from `CORS_ALLOWED_ORIGINS` (comma-separated). Development default: `http://localhost:3000` and `http://127.0.0.1:3000`. Production **requires** the env var. No `*`.
- JSON/urlencoded body limit `HTTP_JSON_LIMIT` (default `100kb`). URI length cap 8192.
- HTTP server timeout 30s. Redis connect/command timeouts 1500ms.
- Request/correlation ids: `x-request-id`, `x-correlation-id`.

Liveness remains `GET /health` → `{ "status": "ok" }` (HTTP 200, no dependency checks). Readiness `GET /health/ready` returns HTTP 200 when postgres + Redis 5+ are up, otherwise HTTP 503 with `status: "not_ready"` and per-dependency flags (`postgres`, `redis`, `redis_version`, `bullmq`).

---

## Validation / errors

Auth bodies use Zod `.strict()`. Unexpected fields → 400. Problem+JSON errors include `request_id`. Production/internal errors do not include Prisma/Redis/SQL/token/otp details. Payload-too-large maps to 413 `PAYLOAD_TOO_LARGE`.

Authorization still uses existing JWT + RBAC. Disabled/locked accounts denied. Permission failures emit `PRIVILEGE_DENIED`. Invalid bearer tokens emit `UNAUTHORIZED_ACCESS_ATTEMPT`.

---

## Rate limit / abuse

Redis keys `rl:{scope}` per IP and per identifier. OTP request, OTP verify, and refresh are limited independently (not a global lockout). Exceeding a window emits `RATE_LIMITED` and increments `rate_limit_total`. If Redis is down, auth rate limiting **fails closed** with `503 RATE_LIMIT_UNAVAILABLE` (no unlimited OTP).

`AbuseService.record(signal)` is a hook for later fraud (OTP spam, stuffing, scraping, fake partner apps). It only writes a security event + metric.

---

## Logging / redaction

Structured HTTP logs via interceptor. `redactValue` / `redactText` strip passwords, OTPs, tokens, MFA, KYC, clinical notes, PAN/CVV, private URLs. Do not rely on ad-hoc redaction in modules.

Protected categories: passwords, OTPs, access/refresh tokens, MFA secrets, KYC documents, health records / clinical notes, payment card data (PAN/CVV), private storage URLs.

Audit (`SecurityEvent`) is durable and separate from application logs. Payloads must stay identifiers/status.

---

## Correlation / tracing

`AsyncLocalStorage` holds `requestId` / `correlationId`. Outbox rows inherit `correlationId` when enqueue is in-request. BullMQ jobs carry `eventId` + `correlationId`. No vendor tracer in Phase 0 (OD-OBS-01 deferred).

---

## Metrics

In-process counters (Prometheus text at `GET /metrics`): HTTP totals/errors, auth failures, rate limits, outbox processed/failed/dead-lettered, BullMQ processed. Labels are method/status — not user id, email, or full URL.

---

## Secrets

`SecretProvider` reads environment only. No production credentials in git. `.env` is gitignored. Startup `parseEnv` fails closed on missing required vars without printing secret values.

Postgres/Redis remain env-driven. RLS is unchanged. Redis is a cache/queue, not identity source of truth.

Future KYC uploads: keep well under a dedicated limit (suggested 10 MB) on a private object store; not JSON `/` this API.

---

## Dependency failure

- Liveness does not check Postgres/Redis/BullMQ.
- Readiness returns 503 when Postgres or Redis 5+ is unavailable.
- Auth rate limiting fails closed if Redis is unreachable.
- Optional observability (in-process metrics) does not take the process down.

---

## Jest

Outbox tests close worker + dispatcher Redis connections in `afterAll` via `quit()`. `RedisService` also `quit()`s on destroy. API Jest uses Postgres `worldpharma_test`, Redis DB `1`, and BullMQ prefix `wp-test` so a live `nx serve api` cannot steal test outbox claims.

---

## Deferred

- OpenTelemetry backend / Sentry (OD-OBS-01)
- WAF / bot at gateway
- File-upload KYC limits in HTTP
- DB TLS enforcement (prod connection string)
- Redis AUTH password in Compose
- Admin `/metrics` auth

**Next:** Phase 0 Task 7 — Design system foundation. Not started.
