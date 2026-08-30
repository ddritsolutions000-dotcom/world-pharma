# 32 — DevOps and CI/CD

**Status:** Blueprint  
**Audience:** Engineering, SRE, mobile, security  
**Requirement IDs:** REQ-DEVOPS, REQ-SEC, REQ-I18N  
**Related:** [Application](04_APPLICATION_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [Testing](31_TESTING_STRATEGY.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

DevOps here is **how the modular monolith and clients move from laptop to production without leaking secrets, PHI, or half-migrated money schemas**.

It is not a promise of 24/7 SRE in Phase 0.

---

## 2. Monorepo

**Decision: one monorepo** for `apps/` and `packages/` as in [04](04_APPLICATION_ARCHITECTURE.md) §5.

**OPEN DECISION (OD-MONO-01):** Nx vs Turborepo.

| | Nx | Turborepo |
| --- | --- | --- |
| **Why** | Generators, module boundary enforcement, affected graph | Thin orchestrator, fast cache |
| **Advantages** | Enforces [04](04_APPLICATION_ARCHITECTURE.md) module isolation; good for many RN/Next apps | Simple; Vercel-class cache; less ceremony |
| **Disadvantages** | Heavier; more opinion | Boundaries must be bolted (eslint/depcruise) |
| **Scaling** | Large orgs | Fine until hundreds of projects |
| **Cost** | Cloud cache optional | Same |
| **Lock-in** | Nx mental model | Low |

**Recommendation:** **Nx** if we will invest in `tags` (`scope:order` cannot import `scope:payment` internals). **Turborepo** if the team is small and eslint-boundaries are enough. **Decide in Phase 0 day 1.** Either way: remote cache, `shared-types`, one version of Nest/RN.

Not: a repo per app in v1 (forked identity).

---

## 3. Environments

| Env | Purpose | Data | Promo to |
| --- | --- | --- | --- |
| local | Developer compose | Synthetic | — |
| dev | Shared integration | Synthetic | — |
| preview | Per-PR optional | Synthetic | Destroy on merge |
| staging | Prod-like, fake PSP/video | Synthetic | Release candidate |
| prod | Live, country routing | Real; residency pinned | — |

No “prod replica” for developers. Break-glass prod access: [27](27_SECURITY_ARCHITECTURE.md).

**OPEN DECISION (OD-DEV-01):** Ephemeral preview environments for API+web. Recommendation: **yes for web/admin**; mobile previews via internal distribution (TestFlight/Play internal), not a new cloud per PR.

---

## 4. Branching

**Recommendation: trunk-based** with short-lived PRs.

| Branch | Rule |
| --- | --- |
| `main` | Always releasable; protected |
| `feat/*` `fix/*` | PR required |
| `release/*` | Optional freeze branch for store trains |
| Hotfix | From `main`; no long-lived `develop` |

**Forbidden:** `--no-verify` as culture; force-push to `main`.

Country packs: config in repo or config service; **not** a git fork per country ([01](01_PRODUCT_VISION.md)).

---

## 5. Pull request checks (required)

| Check | Why |
| --- | --- |
| Typecheck / lint / format | |
| Unit + module contract ([31](31_TESTING_STRATEGY.md)) | |
| Architecture boundaries | No deep module imports |
| Secret scan | |
| Dependency vulnerability (high+) | |
| Migration dry-run / expand-only lint | §6 |
| OpenAPI diff (warn) | Contract surprise |
| IaC plan (if infra in same PR) | |
| Label: `risk:money` / `risk:health` | Extra reviewer |

Mobile: extra lane for native deps (Pods, Gradle).

CODEOWNERS: payment, ledger, health, identity, infra.

---

## 6. Database migrations (expand / contract)

Money and health schemas cannot lock tables in a naive “rename column” on deploy.

**Pattern: expand → migrate → contract**

1. **Expand:** add new column/table/nullable; deploy API that writes **both** or reads old+new  
2. Backfill job (idempotent)  
3. Switch reads to new  
4. **Contract:** remove old in a later release  

Rules:

- Migrations are **forward-only** in prod; no down-migrations on money tables  
- Every migration is reviewed for lock time; concurrent index  
- Ledger tables: **no** rewrite of posted rows — new columns only if additive  
- Outbox/inbox unique keys exist before dual-writers  
- Feature flags gate new write paths ([§8](#8-feature-flags))

**Forbidden:** expand-contract skipped “because we are pre-launch” once staging has fake volume — practice the muscle in Phase 0.

---

## 7. Secrets in pipelines

| Secret | Where |
| --- | --- |
| Cloud deploy roles | OIDC from CI to cloud (no long-lived AKIA in Git) |
| Staging PSP keys | CI secrets / cloud secret manager; sandbox only |
| Prod | Deploy role reads Secrets Manager at runtime ([27](27_SECURITY_ARCHITECTURE.md) §8) |
| Store upload keys | Restricted GitHub environment `prod-mobile` with manual approval |
| Signing (JWT) | KMS; CI does not mint prod keys |

Preview envs: **ephemeral secrets**; never prod webhook secrets.

---

## 8. Feature flags

Two layers (do not confuse):

| Layer | Role |
| --- | --- |
| Country Policy Pack | **Legal/product availability** (UPI, WhatsApp, recording) — not a random kill switch |
| Runtime flags | Ramp, kill switch, experiment |

**OPEN DECISION (OD-FLAG-01):** LaunchDarkly vs open source (Unleash/Flagsmith). Recommendation: **open-source Unleash/Flagsmith or cloud-native** in Phase 0; commercial later if needed.

Flags: default-safe (recording off, wallet off). Flag evaluation in **API**, not only client. Audit flag change for money/health.

---

## 9. Deployment strategy

| Surface | Strategy |
| --- | --- |
| API monolith | Rolling or blue/green; health checks ([30](30_OBSERVABILITY.md) ready) |
| Next.js | Rolling; immutable image |
| Workers | Deploy with API **or** one minor version skew max (outbox schema!) |
| Mobile | Store trains; API **backward compatible** N versions |

**Rollback:**

- Image rollback for API/web **minutes**  
- **Do not** roll back a contract migration that already expanded — roll **forward** or disable flag  
- Mobile: staged rollout %; halt on crash spike (Sentry)  
- Dual webhook secrets remain during PSP cert rotation

**One-version compatibility:** old app + new API for at least one store cycle.

---

## 10. Mobile store release

| Topic | Practice |
| --- | --- |
| Tracks | Internal → closed → staged prod |
| OTA (Expo/CodePush) | **OPEN DECISION (OD-MOB-01):** allowed for JS-only; **never** for auth/crypto/policy that must match API |
| Review | Healthcare store questionnaires — **LEGAL REVIEW** of store claims (no “certified EHR”) |
| Listings | Separate customer vs partner (**OD-ARCH-02**) |
| Kill | Remote config to force-update if a security defect |

Version matrix documented: min app version per API.

---

## 11. Infrastructure as code

- One IaC tool (Terraform or CDK — **OD-IAC-01**, recommend Terraform)  
- Environments as dirs/workspaces, not copy-paste  
- State in remote backend with lock  
- Prod apply: restricted + plan artifact from CI  

Kubernetes manifests: **not** until OD-ORCH-01 says k8s.

---

## 12. Observability in the pipeline

- Every deploy tags release SHA in Sentry and metrics  
- Smoke: `/health/ready` + one authenticated synthetic probe (no PHI)  
- Failed smoke → auto rollback **if** migration is compatible; else halt and page  

---

## 13. On-call (directional)

Phase 0–1: engineering rotation informal. Before **paid** traffic (Phase 2): P1 roster, runbooks for payment webhook, outbox, OTP vendor.

**OD-SLA-01** still closed for contractual uptime.

---

## 14. Open decisions

| ID | Question | Recommendation | Needed by |
| --- | --- | --- | --- |
| OD-MONO-01 | Nx vs Turborepo | Nx if boundaries-as-code; Turbo if thin | Phase 0 |
| OD-CI-01 | GitHub Actions vs GitLab | Match VCS | Phase 0 |
| OD-DEV-01 | Preview envs | Web yes; API optional | Phase 0 |
| OD-FLAG-01 | Flag product | OSS or cloud-native | Phase 0 |
| OD-MOB-01 | OTA JS updates | JS-only; not policy | Phase 1 |
| OD-IAC-01 | Terraform vs CDK | Terraform | Phase 0 |
| OD-ARCH-02 | RN flavors | One workspace, separate listings | Phase 1 |
