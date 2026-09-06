# WORLD_PHARMA — Final Code Audit and Remaining Work Completion

**Master backlog:** #457  
**Document type:** Final repository audit + actionable coding closure  
**Baseline tip before this pass:** #456 (S159)  
**CAN_PRODUCTION_LAUNCH:** **NO** (external / human gates — not a software defect)

| Gate | Value |
| --- | --- |
| **PLATFORM_SOFTWARE_COMPLETE** | **YES** |
| **ACTIONABLE_CODING_BACKLOG** | **ZERO** |
| **CORE_REAL_USE_JOURNEYS_COMPLETE** | **YES** |
| **GLOBAL_ARCHITECTURE_COMPLETE** | **YES** |
| **SECURITY_SOFTWARE_GATE** | **PASS** |
| **MOBILE_FEATURE_COMPLETE** | **YES** |
| **ANDROID_REAL_USE_VALIDATED** | **PARTIAL** |
| **IOS_VALIDATED** | **ENVIRONMENT_BLOCKED** |
| **PRODUCTION_INTEGRATION_SOFTWARE_READY** | **YES** (activation paths exist; live providers EXTERNAL_GATED) |
| **EXTERNAL_GATES_REMAIN** | **YES** |
| **BUSINESS_LEGAL_GATES_REMAIN** | **YES** |
| **DEVICE_BUILD_GATES_REMAIN** | **YES** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

---

## 1. Audit scope

Re-inspected current repository (not prior report trust alone): Master Index tip #456, S151–S159 docs, `WORLD_PHARMA_1MG_REAL_USE_AUDIT.md`, apps/packages, core customer–admin journeys, security samples, globalization, mobile.

**Authority:** repository code wins over docs when they disagree.

---

## 2. Repository inventory (current)

| Layer | Present |
| --- | --- |
| API | `apps/api` |
| Web | admin, customer, vendor, doctor, lab, radiology, radiologist, pathologist, logistics, affiliate, join, store |
| Mobile | `mobile` (customer), affiliate, store, doctor, lab, phlebotomist, delivery |
| Packages | shell-core/web, ui-kit, shared, database, … |
| Policy / country | PolicyPack + CountryProductionLifecycle + empty fail-closed packs |
| Activation rails | S87–S150 / S132–S148 production paths (EXTERNAL_GATED) |

---

## 3. Findings table

| ID | Area | Severity | Current state | Root cause | Action | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | web-affiliate CSV export | P1 | Used `NEXT_PUBLIC_API_URL` → `:3000` | Wrong env + port | Use `affiliateStatementCsvUrl()` | **COMPLETED** |
| F02 | web-affiliate share URL | P1 | Fallback `localhost:3002` (doctor) | Wrong local default; prod leak class | Fail-closed + `:3000` local | **COMPLETED** |
| F03 | web-affiliate inbox join | P2 | Fallback `:3004` (vendor) | Wrong join port | Default `:3008` | **COMPLETED** |
| F04 | customer checkout phone | P2 | Always `+91…` | India hardcode in global UX | Country-seeded E.164 + editable field | **COMPLETED** |
| F05 | vendor PACKED UI | P1 | No Ready action | API `ready` unwired | Add Mark ready to ship | **COMPLETED** |
| F06 | `/imaging` SPA 404 | P3 | Legacy path | Renamed to `/radiology` | Soft redirects | **COMPLETED** |
| F07 | Video DI mock fallback | — | Mock when LiveKit unset | Covered by `assertProductionVideoSessionAllowed` | No change (already fail-closed for production sessions) | **N/A (gated)** |
| F08 | Console OTP / mock PSP | — | Domain env gates | Intentional sandbox until COMMUNICATION/PAYMENT_ENVIRONMENT=production | EXTERNAL / config | **EXTERNAL** |
| F09 | HL7/FHIR | — | Missing adapters | Until lab network contracted | EXTERNAL / optional | **EXTERNAL** |
| F10 | Device tap-through | — | No AVD/USB | Environment | DEVICE | **DEVICE** |
| F11 | iOS binaries | — | No Xcode | Environment | DEVICE | **DEVICE** |
| F12 | First market / MoR / licences | — | Unselected | Human decisions (S158) | BUSINESS/LEGAL | **BUSINESS** |

---

## 4. Root causes (summary)

Post-S157 core journeys were sound. Remaining **actionable** defects were **satellite UX wiring** (affiliate URLs, vendor recovery action, checkout phone globalization, legacy imaging path)—not missing engines.

---

## 5. Code changes

| File | Change |
| --- | --- |
| `apps/web-affiliate/src/affiliate-hub.tsx` | CSV export via `affiliateStatementCsvUrl` |
| `apps/web-affiliate/src/affiliate-labels.ts` | Share URL fail-closed + local `:3000` |
| `apps/web-affiliate/src/affiliate-inbox.ts` | Join default `:3008` |
| `apps/web-affiliate/src/affiliate-labels.spec.ts` | Share URL cases |
| `apps/web-affiliate/src/affiliate-inbox.spec.ts` | Join default case |
| `apps/web-customer/src/checkout-page.tsx` | Country phone seeds + phone field |
| `apps/web-customer/next.config.ts` | `/imaging` → `/radiology` redirects |
| `apps/web-vendor/src/vendor-orders-panel.tsx` | PACKED → `ready` action |

---

## 6. Tests

| Suite | Result |
| --- | --- |
| web-affiliate | **9/9 PASS** |
| mobile-affiliate | **10/10 PASS** |
| api S154 + S156 + topology | **36/36 PASS** |

**TESTS_RUN:** focused affiliate + critical API · **PASS** · **FAIL: 0** · **BLOCKED: 0**

---

## 7. Security result

Sampled `me/*` ownership (lab, imaging, orders, affiliate, prescriptions) intact. Production video sessions assert provider gate. OTP/PSP live require domain env + evidence (not NODE_ENV alone)—by design. Share/CSV localhost leaks fixed on web affiliate (mobile already fixed S159).

**SECURITY_SOFTWARE_GATE = PASS**

---

## 8. Global architecture result

Checkout phone no longer forces India. UPI label remains IN-gated. Tax remains opaque/`UNKNOWN` until profiles filled. Customer market ≠ fulfillment country preserved in logistics contracts.

**GLOBAL_ARCHITECTURE_COMPLETE = YES**

---

## 9–17. Domain results (concise)

| Domain | Software |
| --- | --- |
| Customer | Journeys complete; phone/imaging path fixed |
| Pharmacy/vendor | Fulfillment UI now recovers PACKED → ready |
| Doctor / eRx / telemed | Engines present; live providers EXTERNAL_GATED |
| Lab | Sandbox journey complete; HL7 EXTERNAL |
| Imaging | S152 viewer + radiology routes; PACS EXTERNAL |
| Delivery | Mock carrier EXTERNAL for live |
| Affiliate | Web URL defects closed; mobile S159 |
| Admin | Launch readiness + provider activation sufficient |
| Mobile | Feature complete; device PARTIAL; iOS blocked |

---

## 18. External blockers

Live PSP, OTP/SMS, carrier, KYC, eRx, video, PACS, storage/KMS/malware, secrets, DB, backup, APM, WAF, deploy, payout, pharmacy/lab/imaging networks.

## 19. Business / legal blockers

OD-COUNTRY-01 first market, OD-PAY-01 MoR, licences, privacy/terms, pentest evidence, support SOPs (see S158 control plan).

## 20. Device / build blockers

Android authenticated install tap-through; iOS/macOS/Xcode; EAS store signing.

## 21. Optional items

Native mobile S152 frame viewer; wallet/content corpus depth; further IN-locale copy polish.

## 22. Final actionable backlog

**ZERO** coding items remaining.

## 23. Exact final flags

See table at top. Platform software is complete; production launch remains human/external-gated.

**Do not start another feature sprint.** Next work: S158 human decisions + device install validation.
