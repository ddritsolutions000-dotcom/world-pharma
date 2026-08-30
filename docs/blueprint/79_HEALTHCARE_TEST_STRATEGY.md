# 79 — Healthcare test strategy

**Status:** Blueprint — not implemented  
**Related:** [31](31_TESTING_STRATEGY.md) · [64](64_PHASE_2_MASTER_PLAN.md)

When coding is authorized: extend API e2e + contract tests. No PHI in fixtures (synthetic ids).

---

## 1. Mandatory cases

| # | Case |
| --- | --- |
| 1 | Identity isolation (doctor token ≠ customer admin) |
| 2 | Doctor cannot open unassigned patient |
| 3 | Patient sees only own artifacts |
| 4 | Consent required for report share |
| 5 | Consent revoke stops access |
| 6 | Video reconnect same session; drop ≠ complete |
| 7 | Slot double-book rejected |
| 8 | Rx items immutable after ISSUED (amendment path) |
| 9 | Lab book+pay idempotent |
| 10 | CoC illegal transition 409 |
| 11 | Published report bytes unchanged |
| 12 | Amendment increments version |
| 13 | Physical delivery without PDF on rider |
| 14 | Phlebotomist cannot list other jobs’ PHI |
| 15 | Lab org isolation |
| 16 | Pathologist queue isolation |
| 17 | Payment/refund does not confirm booking on UNKNOWN |
| 18 | RLS on clinical tables |
| 19 | RBAC catalog for new perms |
| 20 | Audit on publish/break-glass |
| 21 | Missing pack key fail-closed |
| 22 | No PHI in OpenSearch docs |
| 23 | No PHI in logs (redaction tests) |
| 24 | Affiliate clinical category blocked |
| 25 | Rider report job has no file URL |

---

## 2. Load / chaos (later)

Slot contention; SFU disconnect; outbox retry; duplicate webhooks.

---

## 3. Privacy tests

CI grep/fixtures: fail if report body, Rx text, or OTP appears in log snapshots.
