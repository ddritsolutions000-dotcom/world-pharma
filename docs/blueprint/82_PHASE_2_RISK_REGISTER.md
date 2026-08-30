# 82 — Phase 2 Healthcare risk register

**Status:** Blueprint  
**Related:** [34](34_RISK_REGISTER.md) · [64](64_PHASE_2_MASTER_PLAN.md)

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-P2-01 | Inventing medical/telehealth law | Packs empty; LEGAL REVIEW; fail closed |
| R-P2-02 | Second identity for doctors/labs | Forbid; memberships only |
| R-P2-03 | PHI in OpenSearch/logs/CRM | Separate stores; redaction tests |
| R-P2-04 | Rider obtains lab PDF | REPORT_DELIVERY has no file ACL |
| R-P2-05 | Browser redirect marks consult complete | Server Encounter.complete only |
| R-P2-06 | Recording on by default | Default off; dual consent |
| R-P2-07 | Sample treated as parcel | Separate CoC machine |
| R-P2-08 | Published report mutated | Versioned immutability tests |
| R-P2-09 | Clinical affiliate inducement | Category OFF |
| R-P2-10 | Dual-book slots | Unique constraints |
| R-P2-11 | UNKNOWN payment creates booking | Same 1D rule |
| R-P2-12 | Premature microservices | Monolith until extract trigger |
| R-P2-13 | SFU without TURN | TURN mandatory in design |
| R-P2-14 | Cross-border consult/media | Pack deny until legal |
| R-P2-15 | Support sees EHR | No default; break-glass |
| R-P2-16 | Generic Partner App UX | Separate apps mandated |
| R-P2-17 | Live money in P2-HC | Sandbox until extra auth |
| R-P2-18 | HIS scope creep | Hospital = partner org only |

Escalate via CR if a risk requires architecture change ([43](43_ECOSYSTEM_BASELINE_LOCK.md)).
