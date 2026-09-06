# WORLD_PHARMA S463 — Founder Manual Acceptance Sheet

**Sprint:** 463 · **Master backlog:** #463  
**RUNTIME:** DEVELOPMENT / SANDBOX — **not production**  
**Instruction:** Mark exactly one box per step after you personally click through the UI.  
Do **not** mark PASS because a URL loaded or an API returned 200.

Legend: **PASS** = UI workflow completed as expected · **FAIL** = broken/wrong · **BLOCKED** = external/env · **NOT_AVAILABLE** = no UI/fixture for this step

Related setup: [WORLD_PHARMA_S463_MANUAL_REAL_USE_TEST_SETUP.md](WORLD_PHARMA_S463_MANUAL_REAL_USE_TEST_SETUP.md)

---

## Pre-flight (operator)

- [ ] All apps listed in setup doc are reachable  
- [ ] Confirmed RUNTIME = sandbox/development (not production)  
- [ ] OTP login works (dev reveal / auto-fill)  

---

## CUSTOMER COMMERCE — http://127.0.0.1:3000

Actor: `sandbox-customer@dev.local` · App: Customer Web · Login: Email OTP

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Login (OTP) | [ ] | [ ] | [ ] | [ ] |
| Home | [ ] | [ ] | [ ] | [ ] |
| Medicines / discovery | [ ] | [ ] | [ ] | [ ] |
| Search | [ ] | [ ] | [ ] | [ ] |
| Category | [ ] | [ ] | [ ] | [ ] |
| Product detail | [ ] | [ ] | [ ] | [ ] |
| Manufacturer visible | [ ] | [ ] | [ ] | [ ] |
| Composition visible | [ ] | [ ] | [ ] | [ ] |
| Strength visible | [ ] | [ ] | [ ] | [ ] |
| Pack size visible | [ ] | [ ] | [ ] | [ ] |
| Price visible | [ ] | [ ] | [ ] | [ ] |
| Discount visible | [ ] | [ ] | [ ] | [ ] |
| Stock visible | [ ] | [ ] | [ ] | [ ] |
| Rx status visible | [ ] | [ ] | [ ] | [ ] |
| Seller visible | [ ] | [ ] | [ ] | [ ] |
| Add to cart | [ ] | [ ] | [ ] | [ ] |
| Cart | [ ] | [ ] | [ ] | [ ] |
| Address | [ ] | [ ] | [ ] | [ ] |
| Checkout | [ ] | [ ] | [ ] | [ ] |
| Sandbox payment | [ ] | [ ] | [ ] | [ ] |
| Order confirmation | [ ] | [ ] | [ ] | [ ] |
| Order detail | [ ] | [ ] | [ ] | [ ] |
| Order history | [ ] | [ ] | [ ] | [ ] |
| Tracking | [ ] | [ ] | [ ] | [ ] |
| Reorder | [ ] | [ ] | [ ] | [ ] |
| Wishlist | [ ] | [ ] | [ ] | [ ] |
| Offers / deals | [ ] | [ ] | [ ] | [ ] |
| Profile / account | [ ] | [ ] | [ ] | [ ] |
| Logout | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CUSTOMER LAB — http://127.0.0.1:3000/lab

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Lab discovery / search | [ ] | [ ] | [ ] | [ ] |
| Test detail | [ ] | [ ] | [ ] | [ ] |
| Slot / address | [ ] | [ ] | [ ] | [ ] |
| Booking | [ ] | [ ] | [ ] | [ ] |
| Booking confirmation | [ ] | [ ] | [ ] | [ ] |
| Booking status | [ ] | [ ] | [ ] | [ ] |
| Collection / status | [ ] | [ ] | [ ] | [ ] |
| Report | [ ] | [ ] | [ ] | [ ] |
| Report viewing | [ ] | [ ] | [ ] | [ ] |
| No public report URL exposed | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CUSTOMER IMAGING — http://127.0.0.1:3000/radiology (and /imaging redirect)

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Service / study discovery | [ ] | [ ] | [ ] | [ ] |
| Booking | [ ] | [ ] | [ ] | [ ] |
| Study status | [ ] | [ ] | [ ] | [ ] |
| Report | [ ] | [ ] | [ ] | [ ] |
| View Study / diagnostic viewer | [ ] | [ ] | [ ] | [ ] |
| Series / slice navigation | [ ] | [ ] | [ ] | [ ] |
| Zoom | [ ] | [ ] | [ ] | [ ] |
| Pan | [ ] | [ ] | [ ] | [ ] |
| Rotate | [ ] | [ ] | [ ] | [ ] |
| Reset / fit / fullscreen (if present) | [ ] | [ ] | [ ] | [ ] |
| Auth + ownership enforced | [ ] | [ ] | [ ] | [ ] |
| No public DICOM / object URL | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CUSTOMER DOCTOR — http://127.0.0.1:3000/doctors

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Doctor discovery | [ ] | [ ] | [ ] | [ ] |
| Doctor profile | [ ] | [ ] | [ ] | [ ] |
| Availability | [ ] | [ ] | [ ] | [ ] |
| Appointment book | [ ] | [ ] | [ ] | [ ] |
| Appointment detail | [ ] | [ ] | [ ] | [ ] |
| Consultation / follow-up (if sandbox) | [ ] | [ ] | [ ] | [ ] |
| Prescription visibility | [ ] | [ ] | [ ] | [ ] |
| Health / timeline link | [ ] | [ ] | [ ] | [ ] |
| Logout | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CUSTOMER HEALTH — http://127.0.0.1:3000/health · /family · /account

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Profile | [ ] | [ ] | [ ] | [ ] |
| Family / members | [ ] | [ ] | [ ] | [ ] |
| Health records / timeline | [ ] | [ ] | [ ] | [ ] |
| Relevant history | [ ] | [ ] | [ ] | [ ] |
| Logout | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## VENDOR / PHARMACY — http://127.0.0.1:3004

Actor: `sandbox-vendor@dev.local` · Also Store: http://127.0.0.1:3003 if used for pharmacy staff

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Login | [ ] | [ ] | [ ] | [ ] |
| Dashboard | [ ] | [ ] | [ ] | [ ] |
| Catalog | [ ] | [ ] | [ ] | [ ] |
| SKU | [ ] | [ ] | [ ] | [ ] |
| Inventory | [ ] | [ ] | [ ] | [ ] |
| Orders list | [ ] | [ ] | [ ] | [ ] |
| Open customer order | [ ] | [ ] | [ ] | [ ] |
| Accept | [ ] | [ ] | [ ] | [ ] |
| Rx review (if applicable) | [ ] | [ ] | [ ] | [ ] |
| Pick | [ ] | [ ] | [ ] | [ ] |
| Pack | [ ] | [ ] | [ ] | [ ] |
| PACKED | [ ] | [ ] | [ ] | [ ] |
| READY | [ ] | [ ] | [ ] | [ ] |
| Dispatch / handoff | [ ] | [ ] | [ ] | [ ] |
| Returns / cancellation | [ ] | [ ] | [ ] | [ ] |
| Settlement / statement | [ ] | [ ] | [ ] | [ ] |
| Cannot see other vendor data | [ ] | [ ] | [ ] | [ ] |
| Cannot bypass Rx safety | [ ] | [ ] | [ ] | [ ] |
| Cannot execute prohibited payout | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## DELIVERY — http://127.0.0.1:3011 (Logistics) · rider actor `sandbox-delivery@dev.local`

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Login | [ ] | [ ] | [ ] | [ ] |
| Dashboard | [ ] | [ ] | [ ] | [ ] |
| Available / assigned shipment | [ ] | [ ] | [ ] | [ ] |
| Assignment visible | [ ] | [ ] | [ ] | [ ] |
| Order / job detail | [ ] | [ ] | [ ] | [ ] |
| Pickup | [ ] | [ ] | [ ] | [ ] |
| Tracking / OFD | [ ] | [ ] | [ ] | [ ] |
| Delivered (sandbox POD) | [ ] | [ ] | [ ] | [ ] |
| Delivery history | [ ] | [ ] | [ ] | [ ] |
| Mock/sandbox carrier only (no live claim) | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## AFFILIATE WEB — http://127.0.0.1:3010

Actor: `sandbox-affiliate@dev.local`

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Login | [ ] | [ ] | [ ] | [ ] |
| Dashboard | [ ] | [ ] | [ ] | [ ] |
| Links | [ ] | [ ] | [ ] | [ ] |
| Create link | [ ] | [ ] | [ ] | [ ] |
| Toggle link | [ ] | [ ] | [ ] | [ ] |
| Share | [ ] | [ ] | [ ] | [ ] |
| Earnings | [ ] | [ ] | [ ] | [ ] |
| Statement | [ ] | [ ] | [ ] | [ ] |
| KYC status (status only) | [ ] | [ ] | [ ] | [ ] |
| Inbox | [ ] | [ ] | [ ] | [ ] |
| Support | [ ] | [ ] | [ ] | [ ] |
| Profile | [ ] | [ ] | [ ] | [ ] |
| Logout | [ ] | [ ] | [ ] | [ ] |
| No payout execution | [ ] | [ ] | [ ] | [ ] |
| No KYC document payload | [ ] | [ ] | [ ] | [ ] |
| No cross-affiliate data | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CUSTOMER MOBILE

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Device/emulator available | [ ] | [ ] | [ ] | [ ] |
| Install customer APK | [ ] | [ ] | [ ] | [ ] |
| Login → Home → Medicines → Product → Cart → Checkout boundary → Orders → Lab → Imaging → Doctors → Profile → Logout | [ ] | [ ] | [ ] | [ ] |

**Expected if no device:** ANDROID_REAL_USE = ENVIRONMENT_BLOCKED · IOS = ENVIRONMENT_BLOCKED

Notes: _______________________________________________

---

## AFFILIATE MOBILE

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Device/emulator available | [ ] | [ ] | [ ] | [ ] |
| Install affiliate APK | [ ] | [ ] | [ ] | [ ] |
| Login → Dashboard → Links → create/toggle/share → Earnings → Statement → Inbox → Support → Profile → Logout | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## MAIN ADMIN — http://127.0.0.1:3001

Actor: `sandbox-admin@dev.local`

For each area mark A–E after use (see setup doc): **A** usable · **B** UI blocked · **C** external · **D** legal · **E** not testable  

| Area | A | B | C | D | E | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Customers | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Vendors | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Pharmacies | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Doctors | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Labs | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Imaging | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Delivery | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Affiliates | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Catalog | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Inventory | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Orders | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Payments | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Settlements | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| KYC | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Countries | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Policy packs | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Provider activation | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Notifications | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Support | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| CMS | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| CRM | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Marketing | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| SEO | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Public website controls | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Launch readiness | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## PUBLIC WEBSITE (unauthenticated) — http://127.0.0.1:3000

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Home | [ ] | [ ] | [ ] | [ ] |
| Medicine discovery | [ ] | [ ] | [ ] | [ ] |
| Product pages (guest) | [ ] | [ ] | [ ] | [ ] |
| Lab | [ ] | [ ] | [ ] | [ ] |
| Imaging | [ ] | [ ] | [ ] | [ ] |
| Doctors | [ ] | [ ] | [ ] | [ ] |
| Health information | [ ] | [ ] | [ ] | [ ] |
| Offers / deals | [ ] | [ ] | [ ] | [ ] |
| About / contact / FAQ / help | [ ] | [ ] | [ ] | [ ] |
| Terms / privacy links | [ ] | [ ] | [ ] | [ ] |
| Footer / nav | [ ] | [ ] | [ ] | [ ] |
| Responsive layout | [ ] | [ ] | [ ] | [ ] |
| No localhost leaks in copy | [ ] | [ ] | [ ] | [ ] |
| No fake “live production” claims | [ ] | [ ] | [ ] | [ ] |
| No public private-data URLs | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## SECURITY NEGATIVES (separate sessions)

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Customer → Admin denied | [ ] | [ ] | [ ] | [ ] |
| Customer → Vendor denied | [ ] | [ ] | [ ] | [ ] |
| Vendor → other vendor denied | [ ] | [ ] | [ ] | [ ] |
| Customer → other customer order denied | [ ] | [ ] | [ ] | [ ] |
| Customer → other patient clinical denied | [ ] | [ ] | [ ] | [ ] |
| Affiliate → other affiliate denied | [ ] | [ ] | [ ] | [ ] |
| Public → private report denied | [ ] | [ ] | [ ] | [ ] |
| Public → DICOM/frame denied | [ ] | [ ] | [ ] | [ ] |
| Public → KYC document denied | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## PAYMENT (sandbox only)

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Checkout → sandbox success | [ ] | [ ] | [ ] | [ ] |
| Order state after pay | [ ] | [ ] | [ ] | [ ] |
| Failure scenario (if UI offers) | [ ] | [ ] | [ ] | [ ] |
| Cancel (if UI offers) | [ ] | [ ] | [ ] | [ ] |
| Duplicate / idempotency (if observable) | [ ] | [ ] | [ ] | [ ] |

SANDBOX_PAYMENT = ________ · REAL_PSP = EXTERNAL_BLOCKED (do not change)

---

## OTP (sandbox only)

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Request OTP | [ ] | [ ] | [ ] | [ ] |
| Wrong code rejected | [ ] | [ ] | [ ] | [ ] |
| Correct sandbox code accepted | [ ] | [ ] | [ ] | [ ] |
| Session established | [ ] | [ ] | [ ] | [ ] |
| Logout | [ ] | [ ] | [ ] | [ ] |

SANDBOX_OTP = ________ · REAL_OTP_PROVIDER = EXTERNAL_BLOCKED (do not change)

---

## ORDER-TO-DELIVERY (primary manual acceptance)

Replay end-to-end in the UIs (Customer → Vendor → Delivery → Customer):

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Customer creates paid sandbox order | [ ] | [ ] | [ ] | [ ] |
| Vendor sees order | [ ] | [ ] | [ ] | [ ] |
| Accept | [ ] | [ ] | [ ] | [ ] |
| Pick | [ ] | [ ] | [ ] | [ ] |
| Pack | [ ] | [ ] | [ ] | [ ] |
| PACKED | [ ] | [ ] | [ ] | [ ] |
| READY | [ ] | [ ] | [ ] | [ ] |
| Delivery assignment | [ ] | [ ] | [ ] | [ ] |
| Pickup | [ ] | [ ] | [ ] | [ ] |
| Tracking / OFD | [ ] | [ ] | [ ] | [ ] |
| Delivered | [ ] | [ ] | [ ] | [ ] |
| Customer sees completed / delivered | [ ] | [ ] | [ ] | [ ] |

Notes: _______________________________________________

---

## CROSS-BORDER SOFTWARE (no real shipment)

| Step | PASS | FAIL | BLOCKED | NOT_AVAILABLE |
| --- | :---: | :---: | :---: | :---: |
| Customer country ≠ source/fulfillment observable in admin/policy | [ ] | [ ] | [ ] | [ ] |
| Currency / policy pack context | [ ] | [ ] | [ ] | [ ] |
| Legal gate / international not auto-approved | [ ] | [ ] | [ ] | [ ] |

LEGAL_CROSS_BORDER_PERMISSION = EXTERNAL_REVIEW_REQUIRED (do not mark production-ready)

---

## Founder sign-off (after run)

| Field | Value |
| --- | --- |
| Date | |
| Tester | |
| Overall verdict | PASS / FAIL / PARTIAL |
| Blocking failures (list) | |
| PUBLIC_OPEN_READY | **NO** (must remain NO unless production gates proven) |
| CAN_PRODUCTION_LAUNCH | **NO** |

**Do not claim public-open or production launch from this sandbox manual run alone.**
