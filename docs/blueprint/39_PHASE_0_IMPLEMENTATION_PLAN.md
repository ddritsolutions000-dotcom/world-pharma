# 39 — Phase 0 Implementation Plan

**Status:** Planning only — **do not write production feature code until this plan is authorized.**  
**Related:** [Decision board](38_PHASE_0_DECISION_BOARD.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Apps](04_APPLICATION_ARCHITECTURE.md) · [DevOps](32_DEVOPS_CICD.md) · [Partners](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

Phase 0 builds the **foundation**: monorepo, identity kernel, empty Country Policy Pack, partner **data model** with `join_public: false`, API health/auth middleware, outbox, CI, observability.

It does **not** build: customer pharmacy, doctor, lab, delivery, marketplace, or a public Join-us product.

---

## 1. Goal

A developer can:

1. Clone, `pnpm i`, `docker compose up`, run API + empty web shells.
2. Authenticate a **synthetic** user (OTP to Mailhog/console).
3. Load an **empty** country pack (all services off, all `join_public: false`).
4. See health, logs, traces, CI green.

No PHI. No PSP. No LiveKit. No public partner applications.

---

## 2. Workstreams

```
A Repo & toolchains ─────────────────────────────────┐
B Local data plane (Postgres, Redis, MinIO optional)┤
C Identity & IAM kernel ────────────────────────────┼─► Phase 0 DoD
D Country pack engine ──────────────────────────────┤
E Partner model (dark) ─────────────────────────────┤
F API cross-cutting (errors, authz, outbox) ─────────┤
G Web/admin/mobile shells (no product screens) ─────┤
H Security & observability ─────────────────────────────┤
I CI/CD ─────────────────────────────────────────────┘
        │
        ▼ (optional parallel, human)
J Hosted dev (cloud account) — blocked on OD-CLOUD-01 account
```

### A — Repository and toolchains

**Does:** Nx + pnpm, apps/packages layout per [04](04_APPLICATION_ARCHITECTURE.md) §5, shared-types, strict TS, ESLint boundaries.

**Does not:** Feature modules for order/care/lab.

**Depends on:** OD-MONO-01 default Nx ([38](38_PHASE_0_DECISION_BOARD.md)).

### B — Local data plane

**Does:** Compose PostgreSQL 16, Redis 7, optional MinIO. Prisma (default) migrations. UUID v7 helper. RLS helper.

**Does not:** Production RDS.

**Depends on:** A.

### C — Identity and IAM

**Does:** Person, Account, Session, Device, OTP challenge, Membership, Role, Permission. JWT `aud` families including `customer`, `admin`, `partner_applicant`. Refresh rotation. TOTP **schema**. Seed `super_admin` + synthetic customer.

**Does not:** Social login, production SMS, professional MFA enforcement in prod (no prod).

**Depends on:** A, B.

### D — Country Policy Pack engine

**Does:** Pack schema, versioned rows, loader, `GET /internal/packs/current` (admin). Empty pack: currency, timezone, locales, `services.*: false`, `partner_types.*.join_public: false`.

**Does not:** Legal document lists, tax law, real country ISO as “launch”.

**Depends on:** B.

### E — Partner model (dark)

**Does:** Tables: PartnerType, Partner, PartnerApplication, PartnerDocument metadata, Organization, Membership. State enum + unit tests for the machine in [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). Admin API **stubs** behind permission, **not** a Join UI.

**Does not:** Public Join, KYC file pipeline, invitations UI, type dashboards.

**Depends on:** C, D.

### F — API cross-cutting

**Does:** `/health` `/ready`, Problem+JSON, validation, authn/authz guards, country context, idempotency **infrastructure** (table; not payment routes), outbox + BullMQ worker + inbox, rate limit OTP.

**Does not:** Order/pay routes.

**Depends on:** C.

### G — Shells

**Does:** Next customer: splash + login. Next admin: login + “packs” read-only + health. RN: hello + login. Copy: “internal preview”, no medical claims.

**Does not:** Catalog, cart, consult, lab, rider, vendor, Join marketing.

**Depends on:** C.

### H — Security and observability

**Does:** `.env.example`, secret scan in CI, helmet headers, JSON logs, OTel, Sentry DSN from env, audit on login/pack publish.

**Depends on:** F.

### I — CI/CD

**Does:** PR: lint, typecheck, unit, build, secret scan, high vuln gate. Optional deploy-to-dev **if** cloud account exists.

**Depends on:** A.

### J — Hosted `dev` (optional for DoD-local; required for team `dev`)

**Does:** Terraform skeleton: VPC, RDS, Redis, ECS/Cloud Run, secrets.

**Depends on:** Human cloud account ([38](38_PHASE_0_DECISION_BOARD.md) §3.1).

---

## 3. Implementation order

| Step | Workstream | Exit |
| --- | --- | --- |
| 1 | A | Repo builds empty apps |
| 2 | B | Migrate + seed empty |
| 3 | F health only | `/health` 200 |
| 4 | C | OTP login synthetic |
| 5 | D | Empty pack loads |
| 6 | E | Partner tables + tests; join_public false |
| 7 | F remainder | Outbox worker processes a test event `USER_REGISTERED` |
| 8 | G | Shells login against API |
| 9 | H + I | CI green; no secrets in git |
| 10 | J | If account exists: deploy `dev` |

Do not start G product pages. Do not start J before step 1.

---

## 4. Dependencies

| Need | From |
| --- | --- |
| Nx vs Turbo | Default Nx |
| ORM | Default Prisma |
| Cloud | Human for hosted; not for step 1 |
| SMS | Adapter interface; Mailhog/console |
| Launch country | Not required; pack `TBD` |
| Legal packs | Empty keys only |

---

## 5. Environment strategy

| Env | Phase 0 |
| --- | --- |
| local | Compose; synthetic |
| dev | Shared if J done; synthetic |
| staging | Skeleton OK; fake adapters |
| prod | **Must not** take real users or PHI in Phase 0 |

Data: synthetic only. No production clone.

---

## 6. Risks (Phase 0)

| Risk | Mitigation |
| --- | --- |
| Scope creep into pharmacy/doctor UI | DoD forbids it; PR review |
| Hardcoding a country | Pack `TBD`; lint/review |
| `join_public` true by mistake | Seed false; test asserts |
| Secrets in git | gitignore + gitleaks |
| Premature Kubernetes | [38](38_PHASE_0_DECISION_BOARD.md) |
| PHI in Sentry | Scrub; no health tables yet |
| RLS disabled for convenience | Test forbids; OD-ADM-07 |

---

## 7. Rollback

| Change | Rollback |
| --- | --- |
| Migrations | Expand/contract; never destructive down in shared env without backup |
| Pack publish | Version pointer revert |
| CI | Previous workflow file |
| Feature flags | Default off |
| Hosted deploy | Previous task definition |

Phase 0 has **no money** and **no PHI** — rollback is cheap if that stays true.

---

## 8. Definition of done

The checklist in [38](38_PHASE_0_DECISION_BOARD.md) §8 is normative. Summary: repo, identity, empty pack, dark partner model, API middleware, outbox, security baseline, observability, CI — **no** regulated product surfaces.

---

## 9. What “first implementation task” means

When (and only when) stakeholders say **start Phase 0 coding**:

**Task 1:** Nx + pnpm monorepo + NestJS `GET /health` + Compose Postgres/Redis + Prisma init + CI lint/typecheck + README → blueprint.

That is the **only** first commit theme. Identity is task 2.

---

## 10. After Phase 0

Phase 1 ([33](33_DEVELOPMENT_ROADMAP.md)): customer catalog + owned pharmacy **unpaid**, still `join_public: false` unless legal pack says otherwise. Public Join remains off.
