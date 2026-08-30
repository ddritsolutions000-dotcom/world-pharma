# 29 — Infrastructure Architecture

**Status:** Blueprint  
**Audience:** Architecture, engineering, SRE, finance (cost), security  
**Requirement IDs:** REQ-INFRA, REQ-I18N (residency), REQ-VID, REQ-PAY (adapters)  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Performance](28_PERFORMANCE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [DevOps](32_DEVOPS_CICD.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Risk](34_RISK_REGISTER.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose and stance

This document chooses **runtime and vendor classes** for World Pharma. It is not a Terraform repo.

**Decisions already made at application level** ([04](04_APPLICATION_ARCHITECTURE.md)):

- Modular **monolith first** (NestJS modules)
- React Native + Next.js clients
- PostgreSQL, Redis, OpenSearch, S3-compatible objects, LiveKit, adapter-based PSP/SMS

**Infrastructure decisions in this document:**

- Cloud provider (**OPEN**)
- Orchestration: start **without Kubernetes**
- Managed data stores over self-operated clusters in Phase 0–4
- Data-residency topology that can **pin** a country later without a rewrite

**Do not invent** a launch country or a certification. Hosting regions are filled after **OD-COUNTRY-01** and legal residency review.

---

## 2. Starting topology (recommended)

```
  Clients (RN, Next.js)
        │
        ▼
  CDN + WAF (edge)
        │
        ▼
  Containers: API (NestJS) + web (Next.js)
  ── same VPC ──
  Managed PostgreSQL (primary + PITR)
  Managed Redis (cache, queue, pub/sub)
  OpenSearch (managed or self-hosted on VMs later)
  Object storage (S3 API)
  LiveKit (Cloud or self-host per OD-VID-01)
  Secrets manager + KMS
        │
        ▼
  Adapters: PSP, SMS/email/WhatsApp, maps, KYC
```

**Not in v1:** service mesh, multi-region active-active, self-managed Kafka, in-house SFU from scratch, in-house acquirer.

**OPEN DECISION (OD-CLOUD-01):** AWS vs GCP as primary cloud. Recommendation and rationale in §4. Either is acceptable; **pick one** before Phase 0 CI lands.

---

## 3. Orchestration: Kubernetes vs ECS vs Cloud Run

| Option | Why people pick it | Advantages | Disadvantages | When it fits World Pharma |
| --- | --- | --- | --- | --- |
| **Kubernetes (EKS/GKE)** | Portability, dense microservices, custom schedulers | Ecosystem, GPU/video later, multi-tenant isolation | Ops cost, YAML tax, premature for one API | **Later**, when we extract payment/video/search or need multi-cluster residency |
| **ECS Fargate (AWS)** | Containers without cluster nodes | Less control-plane; IAM-native | AWS lock-in; less portable | Strong if OD-CLOUD-01 = AWS |
| **Cloud Run (GCP)** | Scale-to-zero, simple services | Fast ops, good for burst | Request timeout limits; WebSocket/long-lived needs care | Strong if OD-CLOUD-01 = GCP **and** WS/video signaling are designed for it |
| **VM + compose/Nomad** | Tiny teams | Simple | Drift, weak scheduling | Only local/dev, not prod |

**Recommendation (closed for Phase 0–4 unless OD-CLOUD-01 forces a flavor):**

**Run containers on a managed compute service (ECS Fargate or Cloud Run or equivalent). Use managed PostgreSQL and Redis. Do not start on Kubernetes.**

Revisit Kubernetes when **any** of: three+ independently scaled extractable services, country-pinned clusters, or LiveKit self-host at scale with custom networking.

**OPEN DECISION (OD-ORCH-01):** Exact managed compute product after OD-CLOUD-01. Bound: **no self-managed k8s on day one**.

---

## 4. Cloud provider

### 4.1 Why a hyperscaler (not colo, not “VPS”)

Healthcare commerce needs KMS, private networking, PITR, object lock, WAF, and regions. A single VPS cannot host payments + health blobs + video responsibly.

### 4.2 AWS vs GCP (and Azure)

| | **AWS** | **GCP** | Azure |
| --- | --- | --- | --- |
| **Why** | Broadest marketplace, healthcare customer density, region coverage, S3 as de-facto API | Excellent Cloud Run/Cloud SQL/BigQuery; clean IAM for small teams | Strong if enterprise Microsoft estate — **not** our current stack |
| **Advantages** | ECS Fargate middle path; RDS; ElastiCache; S3; CloudFront; WAF; Secrets Manager; KMS | Cloud Run simplicity; Cloud SQL; Memorystore; BigQuery for Phase 8 analytics | AD/M365 if corporate IT demands |
| **Disadvantages** | IAM/console complexity; cost surprises | Fewer regions in some future countries; Cloud Run WebSocket caveats | Weakest fit for RN/Nest/LiveKit team |
| **Scaling** | Proven | Proven | Proven |
| **Cost** | Similar at our size; reserved/savings plans later | Similar; committed use | Often higher for this stack |
| **Lock-in** | S3/IAM/ECS; mitigate with S3 API + containers + Postgres | Cloud Run + GCP APIs; same mitigation | Highest if Teams-only identity |

**Recommendation until OD-CLOUD-01 closes: AWS** as default, because:

1. Region coverage for a **multi-country** 24-month horizon is typically broader.
2. ECS Fargate is a better match for a **long-lived NestJS monolith + WebSockets** than scale-to-zero HTTP.
3. S3 ecosystem (scan, CDN origin, backup) is the object-store lingua franca already assumed in [04](04_APPLICATION_ARCHITECTURE.md).

**GCP is a first-class alternative** if the founding team’s ops strength is Cloud Run/BigQuery or if launch-country residency is GCP-only. Do **not** dual-run AWS+GCP in v1.

Azure: only if a strategic partner mandates it — **out of default**.

**Vendor lock-in mitigation (either cloud):** containers, PostgreSQL, Redis protocol, S3 API, OpenTelemetry, LiveKit adapter, PSP adapter.

---

## 5. Technology evaluations

For each major technology: why, alternatives, advantages, disadvantages, scaling, cost, lock-in.

### 5.1 Next.js (customer web + admin)

| | |
| --- | --- |
| **Why** | SEO for catalog/doctors/labs; App Router; one React skill with RN mental model; admin shells as route groups ([04](04_APPLICATION_ARCHITECTURE.md)) |
| **Alternatives** | Remix, Vite SPA, plain React |
| **Advantages** | SSR/ISR for public catalog; shared design system with RN via packages |
| **Disadvantages** | Server/client boundary complexity; caching mistakes can leak session HTML |
| **Scaling** | Horizontal containers; CDN for public; do not SSR Rx viewers |
| **Cost** | Modest compute; CDN bandwidth |
| **Lock-in** | Framework, not cloud; keep API on NestJS so web is replaceable |

### 5.2 NestJS (modular monolith API)

| | |
| --- | --- |
| **Why** | Module boundaries + DI; TypeScript with clients; first-class health/queues |
| **Alternatives** | Spring Boot, .NET, Go, Fastify-only |
| **Advantages** | Matches team; extractable modules; OpenAPI |
| **Disadvantages** | Node CPU for PDF/image/video token minting — offload heavy work to jobs |
| **Scaling** | Horizontal behind LB; sticky not required if Redis pub/sub ([28](28_PERFORMANCE_ARCHITECTURE.md)) |
| **Cost** | Low vs JVM at our start size |
| **Lock-in** | Language; modules stay extractable |

### 5.3 PostgreSQL 16

| | |
| --- | --- |
| **Why** | Integrity, JSON, GIS, RLS, money-safe numeric, PITR ([04](04_APPLICATION_ARCHITECTURE.md)) |
| **Alternatives** | MySQL, CockroachDB, Cosmos, Dynamo as primary |
| **Advantages** | Transactions for pay→order→ledger outbox; RLS for tenancy |
| **Disadvantages** | Vertical limit eventually; not a search engine |
| **Scaling** | Managed instance → read replica → partition hot tables → Citus/Cockroach **later** if evidence |
| **Cost** | Dominant data cost; right-size; storage for audit/GPS |
| **Lock-in** | Low; managed flavor (RDS vs Cloud SQL) is the lock |

**Decision:** Managed Postgres (RDS/Cloud SQL). No self-managed Postgres in prod in Phase 0–4.

### 5.4 Redis

| | |
| --- | --- |
| **Why** | Session assist, rate limit, cache, BullMQ, pub/sub geo ([28](28_PERFORMANCE_ARCHITECTURE.md)) |
| **Alternatives** | KeyDB, KeyDB, Memorystore equivalent, RabbitMQ-only (no cache) |
| **Advantages** | One ops surface for cache+queue+presence |
| **Disadvantages** | Mixing durable jobs and cache on **one** undersized instance is a **RISK** (R-INFRA-01) |
| **Scaling** | Split **cache Redis** vs **queue Redis** when noisy; cluster later |
| **Cost** | Memory-priced; watch GPS keys |
| **Lock-in** | Protocol portable |

**Recommendation:** Managed Redis. **Two logical instances** (cache vs BullMQ) as soon as jobs matter — cheap insurance.

### 5.5 OpenSearch

| | |
| --- | --- |
| **Why** | Synonyms, filters, self-host option, no per-search SaaS tax at catalog scale |
| **Alternatives** | Elasticsearch, Algolia, Typesense, Postgres FTS |
| **Advantages** | Healthcare can keep index in-region; rich filters (Rx flag, city, slot) |
| **Disadvantages** | Cluster ops; mapping discipline; not a substitute for OLTP |
| **Scaling** | Managed OpenSearch (AWS) or Elastic Cloud; dedicated cluster when search p95 slips |
| **Cost** | Medium; over-sharding wastes money |
| **Lock-in** | Medium; queries are somewhat portable to ES |

**OPEN DECISION (OD-SEARCH-01):** AWS OpenSearch vs self-host vs Elastic Cloud. Recommendation: **managed OpenSearch in the same cloud as OD-CLOUD-01**.

**Forbidden:** Indexing result values or Rx bytes ([28](28_PERFORMANCE_ARCHITECTURE.md)).

### 5.6 BullMQ

| | |
| --- | --- |
| **Why** | Same Redis; good DX with NestJS; delayed jobs; priorities |
| **Alternatives** | SQS+Lambda, RabbitMQ, Cloud Tasks, Kafka |
| **Advantages** | Fits monolith; exactly-once **effects** via job id = event id |
| **Disadvantages** | Redis persistence must be on; not a multi-region log |
| **Scaling** | Workers as separate container process/service; extract to SQS when a module is extracted |
| **Cost** | Redis + worker CPU |
| **Lock-in** | Low; port jobs to SQS/Cloud Tasks at extract time |

Kafka is **out** until analytics/event bus volume justifies it (Phase 8+).

### 5.7 S3-compatible object storage

| | |
| --- | --- |
| **Why** | Rx, KYC, reports, POD photos, optional recordings |
| **Alternatives** | GCS, Azure Blob, MinIO |
| **Advantages** | Versioning, KMS, lifecycle, presigned URLs |
| **Disadvantages** | Mis-ACL is a SEV-1 ([27](27_SECURITY_ARCHITECTURE.md), [34](34_RISK_REGISTER.md)) |
| **Scaling** | Unlimited objects; lifecycle cold storage per pack retention — **do not invent years** |
| **Cost** | Storage + egress (video/report downloads) |
| **Lock-in** | Use S3 API; GCS is compatible enough via adapter |

Buckets: **split** public-catalog vs health vs kyc vs recordings. Block public ACLs on health/kyc/record.

### 5.8 CDN

| | |
| --- | --- |
| **Why** | Static + public media + WAF option |
| **Alternatives** | Cloudflare, CloudFront, Fastly, Google CDN |
| **Advantages** | p95 static, bot filter |
| **Disadvantages** | Caching logged-in HTML; caching Rx |
| **Scaling** | Automatic |
| **Cost** | Bandwidth; WAF add-on |
| **Lock-in** | Medium if WAF rules are proprietary |

**OPEN DECISION (OD-CDN-01):** Cloudflare vs CloudFront (or Cloud CDN). Recommendation: **Cloudflare** for combined WAF+CDN+bot if AWS origin; or CloudFront if staying AWS-pure. Pick one in Phase 0.

### 5.9 LiveKit

| | |
| --- | --- |
| **Why** | WebRTC SFU, optional recording, OSS self-host path ([04](04_APPLICATION_ARCHITECTURE.md), [08](08_DOCTOR_PLATFORM.md)) |
| **Alternatives** | Twilio Video, Agora, Daily, in-house SFU (**forbidden** in vision) |
| **Advantages** | Adapter-friendly; OSS exit; simulcast |
| **Disadvantages** | TURN cost; Cloud vs residency (**OD-VID-01**); media is a failure domain |
| **Scaling** | Cloud: vendor; self-host: dedicated nodes + TURN |
| **Cost** | Minutes + TURN + recording (if ever on) |
| **Lock-in** | **Mitigate with adapter.** Clients must not import Cloud-only APIs |

**OPEN DECISION (OD-VID-01):** LiveKit Cloud vs self-hosted vs hybrid. Recommendation: **Cloud until a country pack requires in-region media**; design adapter from Phase 4.

### 5.10 Notifications

| | |
| --- | --- |
| **Why** | Adapter layer: FCM, APNs, email, SMS, WhatsApp BSP ([04](04_APPLICATION_ARCHITECTURE.md)) |
| **Alternatives** | Direct vendor SDKs in domain modules (**forbidden**); Customer.io as the only bus |
| **Advantages** | Country pack can disable WhatsApp without code fork |
| **Disadvantages** | WhatsApp BSP lock-in and template review (**R-INFRA-02**) |
| **Scaling** | Queue + provider fan-out |
| **Cost** | SMS/WhatsApp dominate; OTP bombing = cost+security ([27](27_SECURITY_ARCHITECTURE.md)) |
| **Lock-in** | Isolate BSP behind adapter; dual SMS vendor when volume justifies |

**OPEN DECISION (OD-NTF-01):** Primary SMS aggregator and WhatsApp BSP per first country. No global default.

Transactional vs marketing: separate provider credentials and opt-in flags ([15](15_CRM_PLATFORM.md)).

### 5.11 Analytics

| | |
| --- | --- |
| **Why** | Product + ops metrics without dumping PHI into a warehouse ([16](16_HEALTH_RECORD.md), [30](30_OBSERVABILITY.md)) |
| **Alternatives** | Mixpanel/Amplitude, BigQuery/Snowflake, in-app only |
| **Advantages** | Event sink in monolith (`analytics` module) |
| **Disadvantages** | Warehouse over-ingest of clinical payload is a **RISK** |
| **Scaling** | Start: Postgres + warehouse nightly **metadata** events; Phase 8: real warehouse |
| **Cost** | Cheap early; warehouse later |
| **Lock-in** | Keep event schema in `shared-types` |

**OPEN DECISION (OD-ANL-01):** Product analytics vendor. Recommendation: **self-hosted event table + one product analytics** with PII/PHI scrub; no full reports in Mixpanel.

### 5.12 Monitoring / APM

Covered in depth in [30](30_OBSERVABILITY.md).

| | |
| --- | --- |
| **Why** | Logs, metrics, traces, error tracking |
| **Alternatives** | Grafana stack, Datadog, cloud-native (X-Ray/Cloud Monitoring), Sentry |
| **Advantages** | OTel keeps vendors swappable |
| **Disadvantages** | Cost of high-cardinality traces |
| **Scaling** | Sample traces; never log payloads |
| **Cost** | Can exceed compute if unsampled |
| **Lock-in** | OTel first |

**OPEN DECISION (OD-OBS-01):** Grafana Cloud / self-host vs Datadog vs cloud APM + Sentry. Recommendation: **Sentry + OpenTelemetry + cloud metrics in Phase 0**; Datadog only if ops staff already live there.

### 5.13 CI/CD

See [32](32_DEVOPS_CICD.md).

| | |
| --- | --- |
| **Why** | Monorepo pipelines, preview apps, mobile lanes |
| **Alternatives** | GitHub Actions, GitLab, Circle, cloud Build |
| **Advantages** | PR checks as quality gate |
| **Disadvantages** | Secrets in CI; preview envs with PHI (**forbidden**) |
| **Scaling** | Remote cache (Turborepo/Nx) |
| **Cost** | Minutes; iOS runners |
| **Lock-in** | Medium; keep pipeline as code |

**OPEN DECISION (OD-CI-01):** GitHub Actions vs GitLab CI. Recommendation: **GitHub Actions** if repo is GitHub; otherwise match the VCS.

### 5.14 React Native (mobile)

Mandated ([04](04_APPLICATION_ARCHITECTURE.md)). Alternatives (Flutter) **not selected**. Store listings: **OD-ARCH-02** flavors vs multiple apps.

Scaling: store release trains, not cluster scale. Cost: Apple/Google fees + CI devices.

---

## 6. Data residency topology

Aligned with [01](01_PRODUCT_VISION.md) §8 and [18](18_GLOBALIZATION.md) when written.

| Phase | Topology |
| --- | --- |
| Launch (one country TBD) | **One regional prod cluster** in a region compatible with that country’s **legal** residency (filled after review). Logical `country_id` on every row |
| Second country, same residency class | Same cluster, pack isolation, RLS |
| Country that **requires** pin | **Country pin:** separate DB+objects+KMS in an allowed region; same codebase; config routing. Do not replicate health blobs globally ([16](16_HEALTH_RECORD.md) OD-EHR-08) |

| Store | Residency rule |
| --- | --- |
| Postgres | Primary in pin region; replicas not in a forbidden region |
| Redis | Same region; no cross-region replication of session/health hints |
| Objects | Bucket in pin region; CloudFront/Cloudflare **cache of health blobs forbidden** |
| OpenSearch | Same region; metadata only |
| Backups | Same class as prod; **OD-DR-01** |
| Analytics | Metadata warehouse may be global **only if** no payload and legal allows; default **same region** until reviewed |
| LiveKit | Media region closest + lawful; **OD-VID-01** |

**LEGAL/COMPLIANCE REVIEW REQUIRED** before choosing a region for a named country. This blueprint does not pick Mumbai vs Singapore vs Frankfurt as “the” home.

DNS/geo routing: customers hit a global anycast **only** for static; API may be geo-DNS to the pin. Tokens include `country_id` so a wrong-region API rejects.

---

## 7. Environment mapping

| Env | Infra |
| --- | --- |
| local | Compose: API, Postgres, Redis; fake PSP/video |
| dev | Shared small containers; synthetic data |
| staging | Prod-like sizes scaled down; fake PSP; fake or sandbox LiveKit; **no PHI** |
| prod | Managed DB/Redis; WAF; PITR; restricted secrets |

Preview environments: [32](32_DEVOPS_CICD.md). Must not clone prod health data.

---

## 8. Network and connectivity

- Private subnets for DB/Redis/OpenSearch
- API/web in public via LB + WAF
- Egress allow-list for PSP, SMS, LiveKit, maps
- No SSH bastion with standing keys; break-glass SSM/IAP, audited
- Webhooks: public dedicated path, signature required ([12](12_PAYMENT_PLATFORM.md))

---

## 9. Cost model (directional)

Not a budget. Drivers:

| Driver | Notes |
| --- | --- |
| Managed Postgres | Primary OLTP |
| Redis memory | GPS + queues |
| Object egress | Reports, images |
| SMS / WhatsApp / OTP | Can dominate; rate-limit is a cost control |
| LiveKit + TURN | Per concurrent consult |
| OpenSearch | Idle cluster waste |
| Observability ingest | Cardinality |
| Multi-region | Do not buy until a pack requires pin |

FinOps: tags per env/service; monthly review; OTP and WhatsApp anomaly alerts ([30](30_OBSERVABILITY.md)).

---

## 10. DR and backup (infra view)

Security constraints: [27](27_SECURITY_ARCHITECTURE.md) §13.

| System | Backup |
| --- | --- |
| Postgres | PITR; encrypted; restore tested |
| Redis | Queue Redis persistence on; cache Redis ephemeral OK |
| Objects | Versioning + replication **within residency class** |
| OpenSearch | Snapshot to resident bucket |
| Secrets / KMS | Dual-region **only if** residency allows |

**OD-DR-01:** RPO ≤ 5 min OLTP; RTO hours in early phases; not active-active.

---

## 11. Risks (this document)

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-INFRA-01 | One Redis for cache + jobs → eviction drops queue | Separate instances |
| R-INFRA-02 | WhatsApp as single critical path | SMS/email fallback; pack flags |
| R-INFRA-03 | k8s too early | This document’s start topology |
| R-INFRA-04 | LiveKit Cloud vs residency | Adapter + OD-VID-01 |
| R-INFRA-05 | Dual-cloud before product-market fit | Single cloud |
| R-INFRA-06 | Health blobs on public CDN | Bucket split + WAF rules |
| R-INFRA-07 | Backup off-residency | Pin backups |

Program-level: [34](34_RISK_REGISTER.md).

---

## 12. Assumptions

| ID | Statement |
| --- | --- |
| A-INFRA-01 | One primary cloud in v1 |
| A-INFRA-02 | Managed Postgres and Redis; no self-managed k8s at start |
| A-INFRA-03 | S3 API for objects |
| A-INFRA-04 | Launch region follows legal pack, not engineering convenience alone |

---

## 13. Open decisions (this document)

| ID | Question | Recommendation | Needed by |
| --- | --- | --- | --- |
| OD-CLOUD-01 | AWS vs GCP | AWS default; GCP acceptable | Phase 0 |
| OD-ORCH-01 | ECS vs Cloud Run vs later k8s | Managed containers; k8s later | Phase 0 |
| OD-CDN-01 | Cloudflare vs CloudFront | One vendor for CDN+WAF | Phase 0 |
| OD-SEARCH-01 | OpenSearch hosting | Managed, same cloud | Phase 1 (catalog) |
| OD-VID-01 | LiveKit Cloud vs self-host | Cloud until residency | Phase 4 |
| OD-NTF-01 | SMS/WhatsApp vendors | Per country pack | Phase 1 |
| OD-ANL-01 | Product analytics vendor | Scrubbed events; not PHI warehouse | Phase 1–2 |
| OD-OBS-01 | APM stack | OTel + Sentry + cloud metrics | Phase 0 |
| OD-CI-01 | CI system | Match VCS; Actions if GitHub | Phase 0 |
| OD-DR-01 | Numeric RPO/RTO | PITR 5 min; RTO hours | Phase 0 |
| OD-ARCH-02 | RN flavors vs multi-app | One workspace, separate listings | Phase 1 |
| OD-COUNTRY-01 | First launch country | Empty pack until legal | Blocks prod region |
