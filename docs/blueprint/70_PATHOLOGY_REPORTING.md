# 70 — Pathology and reporting

**Status:** Blueprint — not implemented  
**Related:** [09](09_LAB_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · [74](74_HEALTHCARE_LOGISTICS.md)

**LEGAL/COMPLIANCE REVIEW REQUIRED** for e-sign, official reports, critical-value notification.

---

## 1. Pathologist (APP-PATH)

Onboarding/KYC, work queue, assigned sample/case only, result entry, verification, e-sign **abstraction**, approval, amendment, critical-result workflow, audit.

---

## 2. Report lifecycle

```
DRAFT → PENDING_VERIFY → VERIFIED → PUBLISHED
                              ↓
                         AMENDED (new ReportVersion; prior PUBLISHED remains)
```

**Published reports are immutable.** Corrections = `ReportVersion` n+1 with `amends_version` + reason. Never UPDATE published blob.

---

## 3. Digital report

Encrypted object store. Access: patient, ordering doctor **with consent**, originating lab, assigned pathologist, break-glass. Download audited. **Not** in OpenSearch body. Rider: **no** PDF.

---

## 4. Physical report

```
PRINT → PACK → REPORT_DELIVERY (LogisticsJob) → OTP/POD → DELIVERED
```

Delivery partner: address, OTP, sealed pack ID. **Never** unrestricted clinical PDF.

---

## 5. Critical results

Pack-defined flags. Notify patient/doctor via notification kernel **without** putting values in push body (deep link + authenticated fetch).

---

## 6. Open

Whether digital copy is legally official; wet-ink vs e-sign; amendment notification duty.
