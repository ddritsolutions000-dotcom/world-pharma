# 05 — Customer Platform

**Status:** Blueprint  
**Audience:** Product, architecture, customer-app engineering, QA  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health Record](16_HEALTH_RECORD.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Search](24_SEARCH_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md)

**Requirement IDs:** REQ-CUST, REQ-ID, REQ-ORD, REQ-RX, REQ-DOC, REQ-VID, REQ-LAB, REQ-REP, REQ-WAL, REQ-PAY, REQ-AFF, REQ-EHR, REQ-NOT, REQ-SRCH, REQ-SUP

---

## 1. Purpose

The Customer Platform is the **patient/caregiver super-app experience** on the World Pharma kernel. It is not a separate backend. It is a **client family** (React Native + Next.js) plus customer-scoped application services that compose kernel modules: identity, party, catalog, order, prescription, care, diagnostics, logistics, payment, wallet, health, CRM, search, notification, compliance.

One **Person** has one customer profile, one health timeline, one wallet (per country), and one support identity. Pharmacy, vendor, doctor, and lab apps are out of scope here; this document specifies only what the **customer** sees and which kernel contracts those screens call.

**ASSUMPTION (A-CUS-01):** Customer mobile (`APP-CUS-M`) and customer web (`APP-CUS-W`) share the same API contracts and Country Policy Pack. Web may omit some native capabilities (background location, push richness) but must not invent a second checkout or identity.

**ASSUMPTION (A-CUS-02 / A-BIZ-01):** v1 **does not** put multiple vendors in one goods **Order**. A goods Order has exactly one selling **Organization** (owned pharmacy **or** one vendor).

**ASSUMPTION (A-CUS-03 / A-BIZ-02):** Medicines/products live in **Cart** → **Order**. Doctor consults and lab collections live in **Booking**. A **CheckoutSession** can take **one payment** for child **Order** and/or **Booking** objects.

---

## 2. Clients

| ID | Client | Notes |
| --- | --- | --- |
| APP-CUS-M | React Native (Android, iOS) | Primary. Offline cache of catalog fragments, orders, reports metadata. Cannot confirm payment offline. |
| APP-CUS-W | Next.js App Router | SEO for medicines, doctors, labs; same checkout kernel. |

Audience JWT: `aud = customer`. Staff tokens must be rejected. See [Roles](03_USER_ROLES_AND_PERMISSIONS.md) **RISK** privilege confusion.

Deep links: order, booking, report, consult waiting room, referral code, passwordless magic (if policy allows).

---

## 3. Cross-cutting contracts

| Topic | Contract |
| --- | --- |
| IDs | UUID v7 for all new records (`user_id`, `cart_id`, `checkout_session_id`, `order_id`, `booking_id`, …) |
| Money | Integer **minor units** + ISO 4217 `currency`. Never float. Display formatting is a Country Policy Pack concern. |
| Soft delete | `deleted_at` on customer-owned mutable records (addresses, cart lines, reviews, tickets). **Ledger, payment journal, and health artifact clinical payloads are not soft-deleted** this way; retention follows [Health Record](16_HEALTH_RECORD.md) and [Ledger](13_LEDGER_SETTLEMENT.md). |
| Country | Every customer session has a selected `country_id`. Catalog, tax, payments, Rx, telemedicine, and wallet are filtered by the **Country Policy Pack**. |
| Idempotency | Checkout, pay, refund-request, booking, and Rx-upload writes require `Idempotency-Key` (UUID v7). |
| Time | Store UTC; display timezone from pack or device with pack override. |
| Language | UI strings from i18n packs; clinical content language may differ from UI language. |

**Do not hardcode a launch country.** Technical defaults (currency, timezone, language) live in an empty “launch country TBD” pack until legal fills rules. **LEGAL/COMPLIANCE REVIEW REQUIRED** before enabling any regulated service in a country.

---

## 4. Core objects (customer-facing)

| Object | Customer meaning | Owner module |
| --- | --- | --- |
| **Person** | The human; `user_id` | `identity` / `party` |
| **Organization** | Own pharmacy, vendor, lab, clinic (read-only to customer) | `party` |
| **Location** | Store, warehouse, collection point, customer address pin | `party` |
| **CatalogItem** | Medicine, OTC, device, lab test, package, consult product | `catalog` |
| **Offer** | Item + seller org + serving location + country + price + tax + availability | `catalog` |
| **Cart** | Goods intent only (v1). Not lab/doctor lines. | `order` |
| **Order** | Paid/COD goods order; one seller | `order` |
| **Booking** | Doctor appointment or lab collection | `care` / `diagnostics` |
| **CheckoutSession** | Payment envelope over child Order and/or Booking | `order` + `payment` |
| **PaymentIntent** | Capture attempt | [Payment](12_PAYMENT_PLATFORM.md) |
| **LogisticsJob** | Tracking surface for delivery / collection / report | [Logistics](11_LOGISTICS_PLATFORM.md) |
| **Encounter** | Consult clinical session | [Doctor](08_DOCTOR_PLATFORM.md) |
| **HealthArtifact** | Rx, report, consult note, uploaded doc | [Health Record](16_HEALTH_RECORD.md) |
| **ConsentGrant** | Share artifact with a doctor (or other purpose) | `health` |

---

## 5. CheckoutSession (kernel contract)

This is the **only** customer path that moves money for commerce and care in v1.

### 5.1 Why it exists

Cart, doctor slot, and lab slot are different domain objects. The customer still expects **one pay sheet**. CheckoutSession is the envelope: it snapshots payable children, locks price/tax, creates one **PaymentIntent**, and on success confirms children.

**OPEN DECISION (OD-CUS-01):** Whether the v1 **UI** offers a mixed basket (goods + consult and/or lab in one pay sheet). Kernel **must** support composite sessions. Recommendation: **kernel composite from day one**; v1 UI may keep three entry points (medicine, doctor, lab) that each create a CheckoutSession with one child type, then enable mixed UI behind a country flag.

### 5.2 Shape (logical)

| Field | Rules |
| --- | --- |
| `id` | UUID v7 |
| `customer_id` | Person |
| `country_id` | Session country; immutable after DRAFT leaves |
| `currency` | ISO 4217; all children **must** share it |
| `amount_minor` | Sum of child payable totals (items + fees + tax − discounts). Integer. |
| `status` | See state machine |
| `children[]` | Discriminated: `ORDER` \| `BOOKING_DOCTOR` \| `BOOKING_LAB` |
| `payment_intent_id` | Set when payment starts |
| `idempotency_key` | Client-supplied |
| `expires_at` | Hold TTL (pack: `checkout.session_ttl_seconds`) |
| `fraud_review_id` | Optional hold |

**ASSUMPTION (A-CUS-04):** A CheckoutSession contains **at most one** goods **Order** child. That Order contains **exactly one** seller Organization. Multiple lab and/or doctor Bookings **may** be attached if OD-CUS-01 UI allows and all share currency/country.

### 5.3 State machine

```
                    ┌──────────────┐
                    │    DRAFT     │  children attached, holds optional
                    └──────┬───────┘
                           │ Checkout.StartPayment
                           ▼
                    ┌──────────────┐
           ┌────────│PENDING_PAYMENT│◄──── webhook retry / client poll
           │        └──────┬───────┘
           │               │
     expire/cancel    success│         fail / decline
           │               ▼               │
           ▼        ┌──────────────┐     ▼
     ┌─────────┐    │     PAID     │  ┌──────────┐
     │ EXPIRED │    │ (children     │  │  FAILED  │
     │CANCELLED│    │  confirmed)   │  │          │
     └─────────┘    └──────┬───────┘  └──────────┘
                           │
                           ▼ (rare: child confirm fail after capture)
                    ┌──────────────────┐
                    │ PARTIALLY_FAILED  │  compensate: refund / void / ops
                    └──────────────────┘
```

| From | To | Trigger |
| --- | --- | --- |
| DRAFT | PENDING_PAYMENT | `Checkout.StartPayment` creates PaymentIntent |
| PENDING_PAYMENT | PAID | Payment captured / authorized per method; children confirmed in same unit of work (outbox) |
| PENDING_PAYMENT | FAILED | Decline, fraud hard-fail, gateway error after retries |
| PENDING_PAYMENT | EXPIRED | TTL; release inventory/slot holds |
| DRAFT / PENDING_PAYMENT | CANCELLED | Customer cancel; release holds |
| PAID | PARTIALLY_FAILED | Child Order/Booking confirm failed after money movement |

**RISK:** Payment captured but child confirm fails. Mitigation: transactional outbox + compensation worker; never leave money without a payable or refund instruction. See [Payment](12_PAYMENT_PLATFORM.md) and [Ledger](13_LEDGER_SETTLEMENT.md).

### 5.4 Child confirmation rules

| Child | On PAID | Hold before pay |
| --- | --- | --- |
| Order (OTC / non-Rx) | Order `PENDING_PAYMENT` → `PAID`; inventory hard-allocate | Soft inventory hold |
| Order (Rx) | Order `PAID` → `RX_REVIEW` | Soft hold; hard allocate after Rx verify ([Pharmacy](06_PHARMACY_PLATFORM.md)) |
| Booking doctor | Appointment `CONFIRMED`; slot consumed | Optimistic slot lock |
| Booking lab | Lab booking `CONFIRMED`; slot reserved | Slot lock |

COD: PaymentIntent may be `AUTHORIZE_COD` (no capture). Order still becomes `PAID` in **commercial** language only if policy treats COD as confirmed-to-fulfill; prefer status `PAID` meaning “customer committed” and ledger uses a COD receivable. **OPEN DECISION (OD-CUS-02):** COD order status vocabulary vs prepaid. Recommendation: same fulfillment states; payment_method = COD; ledger uses receivable until rider collects.

### 5.5 Price snapshot

CheckoutSession stores an immutable snapshot: Offer ids, qty, `unit_amount_minor`, tax lines, fees, coupon, membership, loyalty redemption. Later Offer price changes do not mutate a PENDING or PAID session. If a hold expires, customer must re-quote.

---

## 6. Module architecture

Each module below is a **product module** in the customer apps. NestJS implementation maps to kernel directories in [Application Architecture](04_APPLICATION_ARCHITECTURE.md) §6. Logical API names are not HTTP paths.

Shared UX rules for every module:

- **Loading:** skeleton or last-known-good with stale badge; never a white screen.
- **Empty:** one primary CTA; no dead ends.
- **Error:** retry + support entry; payment and clinical errors use dedicated copy (no generic “something went wrong” as the only message).
- **Offline:** read cached orders/reports/catalog; block pay and booking confirm.

---

### 6.1 Auth (`M-CUS-AUTH`)

| | |
| --- | --- |
| **Purpose** | Establish a customer session (`aud=customer`) bound to Person, selected country, device. |
| **Screens / capabilities** | Splash session restore; force-upgrade; device trust; logout all devices; step-up before wallet/refund. |
| **Dependencies** | `identity`, `iam`, `compliance` (session policy) |
| **APIs** | `Auth.RestoreSession`, `Auth.Refresh`, `Auth.Logout`, `Auth.LogoutAll`, `Auth.StepUp` |
| **Events in** | `account.disabled`, `session.revoked` |
| **Events out** | `session.started`, `session.ended`, `session.step_up.completed` |
| **Empty / loading / error** | No session → Registration/Login. Refresh fail → re-auth. Clock skew: show “check device time”. |
| **Country hooks** | `auth.session_ttl`, `auth.mfa_step_up_actions[]`, `auth.max_devices` |

---

### 6.2 Registration (`M-CUS-REG`)

| | |
| --- | --- |
| **Purpose** | Create Person + customer membership + customer profile in a country. |
| **Screens / capabilities** | Phone and/or email capture; age gate; terms/privacy consent; country select (if not geo-forced); optional name later. |
| **Dependencies** | `identity`, `party`, `compliance`, `notification` |
| **APIs** | `Registration.Start`, `Registration.Complete`, `Legal.GetDocuments` |
| **Events in** | — |
| **Events out** | `customer.registered`, `consent.legal.accepted` |
| **Empty / loading / error** | Duplicate phone/email → login merge path. Under-age: block with pack copy. **LEGAL REVIEW** on age of digital consent. |
| **Country hooks** | `registration.identifier` (`phone` \| `email` \| `either`), `registration.min_age`, `registration.kyc_at_signup` (default false) |

**OPEN DECISION (OD-CUS-03):** Guest checkout vs mandatory account before cart. Recommendation: **account required before Checkout.StartPayment**; browse without account allowed.

**OPEN DECISION (OD-CUS-04):** Caregiver / family profiles (ties to OD-RBAC-03). v1: one Person shops/consults as self; “order for someone else” is a delivery name/phone field, not a second clinical identity.

---

### 6.3 Login (`M-CUS-LOGIN`)

| | |
| --- | --- |
| **Purpose** | Return existing customers to a valid session. |
| **Screens / capabilities** | Identifier entry; choose OTP vs (if enabled) password; account lock messaging without leaking existence beyond policy. |
| **Dependencies** | `identity`, `notification` |
| **APIs** | `Login.Start`, `Login.Complete` |
| **Events in** | `account.locked` |
| **Events out** | `session.started` |
| **Empty / loading / error** | Unknown identifier: pack decides enumeration-safe copy. Locked: cooldown. Compromised: force OTP. |
| **Country hooks** | `auth.password_enabled` (customer default **false**), `auth.lockout_policy` |

Professional staff login is **not** this module.

---

### 6.4 OTP (`M-CUS-OTP`)

| | |
| --- | --- |
| **Purpose** | Verify possession of phone/email for registration, login, and step-up. |
| **Screens / capabilities** | Enter code; resend with cooldown; channel switch (SMS/email/WhatsApp if pack allows). |
| **Dependencies** | `identity`, `notification` adapters |
| **APIs** | `Otp.Request`, `Otp.Verify` |
| **Events in** | `otp.dispatched`, `otp.failed_delivery` |
| **Events out** | `otp.verified`, `otp.rate_limited` |
| **Empty / loading / error** | Delay: “may take a minute”. Exhausted: support. Wrong code: remaining attempts. |
| **Country hooks** | `otp.channels[]`, `otp.length`, `otp.ttl_seconds`, `otp.whatsapp_enabled` |

**RISK:** OTP bombing. Rate limit per device, IP, and identifier. No user-visible provider debug.

---

### 6.5 Social login (`M-CUS-SOCIAL`)

| | |
| --- | --- |
| **Purpose** | Optional OIDC/OAuth login, **country-gated**. |
| **Screens / capabilities** | Provider buttons only if pack enables; account link if email/phone already exists (explicit confirm). |
| **Dependencies** | `identity`, `compliance` |
| **APIs** | `Social.Start`, `Social.Callback`, `Social.Link`, `Social.Unlink` |
| **Events in** | — |
| **Events out** | `social.linked`, `social.login.completed` |
| **Empty / loading / error** | Provider down: hide button + “use OTP”. Email mismatch: force OTP bind. |
| **Country hooks** | `auth.social.enabled`, `auth.social.providers[]` (e.g. Google, Apple). **Never** assume a provider exists globally. |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Health-app use of social identity, data sharing with IdP, and children’s accounts.

**OPEN DECISION (OD-CUS-05):** Which providers ship in the first launch pack. Recommendation: none until pack explicitly lists them; Apple Sign-In if iOS listing rules require it **when social is on**.

---

### 6.6 Profile (`M-CUS-PROFILE`)

| | |
| --- | --- |
| **Purpose** | Customer commerce/care profile: name, sex/gender fields as pack allows, DOB, language, emergency contact. |
| **Screens / capabilities** | View/edit profile; avatar; clinical demographics used for lab restrictions; **not** a professional profile. |
| **Dependencies** | `party`, `health` (demographics subset), `compliance` |
| **APIs** | `Profile.Get`, `Profile.Update` |
| **Events in** | — |
| **Events out** | `profile.updated` |
| **Empty / loading / error** | Incomplete profile: banner on Rx/lab/doctor, not a hard block for OTC browse. Validation errors inline. |
| **Country hooks** | `profile.fields[]`, `profile.gender_model`, `profile.national_id_required` (default false; **LEGAL REVIEW** if enabled) |

---

### 6.7 Address (`M-CUS-ADDR`)

| | |
| --- | --- |
| **Purpose** | Saved delivery / collection addresses with geocode, serviceability, and labels (home/work). |
| **Screens / capabilities** | List, add, edit, delete (soft), set default; pin on map; instructions for rider/phlebotomist. |
| **Dependencies** | `party`, `logistics` (serviceability), maps adapter |
| **APIs** | `Address.List`, `Address.Create`, `Address.Update`, `Address.Delete`, `Address.SetDefault`, `Serviceability.Check` |
| **Events in** | `serviceability.updated` |
| **Events out** | `address.changed` |
| **Empty / loading / error** | Empty: add-address CTA. Geocode fail: manual pin. Out of service: still save, block checkout. |
| **Country hooks** | `address.format`, `address.required_fields[]`, `address.postal_required`, maps provider |

**OPEN DECISION (OD-CUS-06):** Maps provider per country (see OD in [Application Architecture](04_APPLICATION_ARCHITECTURE.md)).

---

### 6.8 Location (`M-CUS-LOC`)

| | |
| --- | --- |
| **Purpose** | Session service origin: GPS or selected address, used for Offers, pharmacies, home collection, and ETAs. |
| **Screens / capabilities** | Location permission; “deliver to”; country conflict if GPS ≠ selected country. |
| **Dependencies** | `party`, `catalog` (geo offers), `compliance` (residency) |
| **APIs** | `Location.Resolve`, `Location.SetSessionOrigin` |
| **Events in** | — |
| **Events out** | `session.origin.changed` (analytics) |
| **Empty / loading / error** | Permission denied: manual address. Cross-border GPS: force country confirm, do not silently switch catalog. |
| **Country hooks** | `location.gps_required_for_delivery`, `location.cross_border_behavior` |

---

### 6.9 Home (`M-CUS-HOME`)

| | |
| --- | --- |
| **Purpose** | Country-configured launchpad: search, service tiles, banners, reorder, upcoming bookings, health shortcuts. |
| **Screens / capabilities** | Modular rails (CMS); hide tiles when pack disables service (e.g. telemedicine off). |
| **Dependencies** | `cms`, `search`, `order`, `care`, `diagnostics`, `health` |
| **APIs** | `Home.GetLayout`, `Cms.ListBanners`, `Order.ListRecent`, `Booking.ListUpcoming` |
| **Events in** | `cms.published` |
| **Events out** | `home.viewed` |
| **Empty / loading / error** | New user: discovery rails. CMS fail: static fallback tiles from pack. |
| **Country hooks** | `home.modules[]`, `services.pharmacy`, `services.marketplace`, `services.telemedicine`, `services.labs`, `ads.allowed` **LEGAL REVIEW** for medicine ads |

---

### 6.10 Search (`M-CUS-SEARCH`)

| | |
| --- | --- |
| **Purpose** | One search box across medicines, products, tests, packages, doctors, pharmacies, vendors — ranked by pack. |
| **Screens / capabilities** | Typeahead, recent, trending (non-clinical), filters, “Rx required” badges; no diagnostic advice. |
| **Dependencies** | `search` (OpenSearch), `catalog`, `care`, `compliance` |
| **APIs** | `Search.Suggest`, `Search.Query`, `Search.Click` |
| **Events in** | index updates from catalog/care |
| **Events out** | `search.performed`, `search.result.clicked` |
| **Empty / loading / error** | Empty: spelling + browse categories. Timeout: retry; do not show another country’s hits. |
| **Country hooks** | `search.indexes[]`, `search.synonyms`, `search.rank.own_pharmacy_boost`, `search.blocklist_terms` |

**OPEN DECISION (OD-CUS-07):** Default ranking of owned-pharmacy Offers vs vendor Offers. Recommendation: pack-configurable boost, not hardcoded.

---

### 6.11 Medicines (`M-CUS-MED`)

| | |
| --- | --- |
| **Purpose** | Medicine CatalogItems + Offers (own pharmacy and/or vendors) with Rx flags, substitutes, composition. |
| **Screens / capabilities** | PLP, PDP, strength/form, substitute list, “how to use” CMS (not a diagnosis), Rx upload CTA. |
| **Dependencies** | `catalog`, `inventory` availability projection, `prescription`, `compliance` |
| **APIs** | `Catalog.ListMedicines`, `Catalog.GetItem`, `Offer.ListForItem`, `Catalog.ListSubstitutes` |
| **Events in** | `offer.updated`, `inventory.availability.changed` |
| **Events out** | `catalog.item.viewed` |
| **Empty / loading / error** | No Offer in geo: “unavailable here”. Stale price: re-quote at cart. Never allow add-to-cart on expired Offer snapshot without refresh. |
| **Country hooks** | `catalog.rx_required_rules`, `catalog.controlled_substance_visible`, `catalog.substitute_customer_visible`, advertising rules **LEGAL REVIEW** |

---

### 6.12 Products (`M-CUS-PROD`)

| | |
| --- | --- |
| **Purpose** | Non-medicine CatalogItems (devices, wellness, OTC retail) with lighter Rx rules. |
| **Screens / capabilities** | Same commerce pattern as medicines; category tree; vendor vs own-pharmacy Offers. |
| **Dependencies** | `catalog`, `inventory`, `compliance` (claims) |
| **APIs** | `Catalog.ListProducts`, `Catalog.GetItem`, `Offer.ListForItem` |
| **Events in** | `offer.updated` |
| **Events out** | `catalog.item.viewed` |
| **Empty / loading / error** | Same as medicines. Health claims: CMS only, pack-approved. |
| **Country hooks** | `catalog.product_categories[]`, `catalog.health_claim_review` **LEGAL REVIEW** |

---

### 6.13 Pharmacies (`M-CUS-PHARM-DISC`)

| | |
| --- | --- |
| **Purpose** | Discover first-party pharmacy **Locations** (and optionally branded store pages). Not the staff pharmacy app. |
| **Screens / capabilities** | Nearby stores, hours, services (delivery, Rx), store-scoped catalog if pack allows. |
| **Dependencies** | `party`, `catalog`, `logistics` |
| **APIs** | `Pharmacy.ListLocations`, `Pharmacy.GetLocation` |
| **Events in** | `location.updated` |
| **Events out** | `pharmacy.viewed` |
| **Empty / loading / error** | None nearby: marketplace/vendors or “not in service area”. |
| **Country hooks** | `pharmacy.store_pages_enabled`, `pharmacy.show_unlicensed_locations` (must be false) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Display of licensed pharmacy identity per country.

---

### 6.14 Vendors (`M-CUS-VEND-DISC`)

| | |
| --- | --- |
| **Purpose** | Discover third-party seller storefronts that have **published** Offers in-country. |
| **Screens / capabilities** | Vendor profile (public), ratings, listings; **no** other vendors’ costs, stock internals, or settlements. |
| **Dependencies** | `party`, `catalog`, [Vendor](07_VENDOR_PLATFORM.md) |
| **APIs** | `Vendor.ListPublic`, `Vendor.GetPublicProfile`, `Offer.ListForVendor` |
| **Events in** | `vendor.published`, `offer.updated` |
| **Events out** | `vendor.store.viewed` |
| **Empty / loading / error** | Marketplace disabled: hide module. Unverified vendor: not listed. |
| **Country hooks** | `marketplace.enabled`, `vendor.storefront.enabled` |

Adding a vendor Offer to cart that conflicts with an existing other-seller cart **must** fail with `CART_SELLER_CONFLICT` (A-CUS-02). Client offers: replace cart vs keep current.

---

### 6.15 Cart (`M-CUS-CART`)

| | |
| --- | --- |
| **Purpose** | Mutable goods intent: lines of Offer + qty + Rx linkage. **No** doctor/lab lines. |
| **Screens / capabilities** | Add/update/remove; seller banner; Rx-needed badge; coupon preview (non-authoritative); serviceability; min-order. |
| **Dependencies** | `order`, `catalog`, `inventory`, `prescription`, `compliance` |
| **APIs** | `Cart.Get`, `Cart.AddItem`, `Cart.UpdateQty`, `Cart.RemoveItem`, `Cart.Clear`, `Cart.ApplyCouponPreview` |
| **Events in** | `offer.updated`, `inventory.availability.changed`, `coupon.invalidated` |
| **Events out** | `cart.updated` |
| **Empty / loading / error** | Empty: browse CTA. Line OOS: highlight + qty clamp. Price change: blocking modal before checkout. Duplicate add: merge qty with max. |
| **Country hooks** | `cart.max_lines`, `cart.max_qty_per_line`, `cart.mixed_rx_otc_allowed` (default true), `cart.seller_must_be_single` (v1 **true**) |

**ASSUMPTION (A-CUS-05):** One active Cart per customer per country. Switching country starts a different cart; do not merge currencies.

---

### 6.16 Checkout (`M-CUS-CHECKOUT`)

| | |
| --- | --- |
| **Purpose** | Create CheckoutSession, attach children, collect address/slot, quote fees/tax, start payment. |
| **Screens / capabilities** | Address; delivery slot if required; Rx attachments; fee breakdown; wallet/coupon/loyalty; payment method list; T&C; pay. |
| **Dependencies** | `order`, `care`, `diagnostics`, `payment`, `wallet`, `affiliate`, `compliance` |
| **APIs** | `Checkout.CreateSession`, `Checkout.SetChildren`, `Checkout.SetFulfillment`, `Checkout.Quote`, `Checkout.StartPayment`, `Checkout.Get`, `Checkout.Cancel` |
| **Events in** | `payment.intent.updated`, `slot.released` |
| **Events out** | `checkout.session.created`, `checkout.session.started`, `checkout.session.paid`, `checkout.session.failed`, `checkout.session.expired` |
| **Empty / loading / error** | See §7 failure matrix. Pay button disabled until quote is fresh (`quote_expires_at`). |
| **Country hooks** | `checkout.session_ttl_seconds`, `checkout.cod_enabled`, `checkout.wallet_enabled`, `tax.engine`, `checkout.mixed_children_ui` (OD-CUS-01) |

Quote response uses integer minor units only. Client must not recompute tax.

---

### 6.17 Orders (`M-CUS-ORDERS`)

| | |
| --- | --- |
| **Purpose** | Customer list/detail of goods Orders, including Rx and return entry points. |
| **Screens / capabilities** | History filters; invoice download if issued; cancel (policy); return request; reorder; help. |
| **Dependencies** | `order`, `prescription`, `payment`, `logistics`, `support` |
| **APIs** | `Order.List`, `Order.Get`, `Order.Cancel`, `Order.Reorder`, `Return.CreateRequest` |
| **Events in** | `order.state.changed`, `refund.updated` |
| **Events out** | `order.cancel.requested`, `return.requested` |
| **Empty / loading / error** | Empty: “no orders”. Partial outage: cached list + warning. |
| **Country hooks** | `order.cancel_until_states[]`, `return.window_hours`, `invoice.customer_visible` |

Customer cancel is a **request** after certain states; pharmacy/ops may own accept. See [Pharmacy](06_PHARMACY_PLATFORM.md) state machine.

---

### 6.18 Order tracking (`M-CUS-TRACK`)

| | |
| --- | --- |
| **Purpose** | Healthcare-grade tracking of MEDICINE_DELIVERY (and report delivery when relevant). |
| **Screens / capabilities** | Timeline; map privacy-minimized; ETA; rider contact policy; OTP/POD instructions; reassignment notice. |
| **Dependencies** | `logistics`, `order`, `notification` |
| **APIs** | `Tracking.GetForOrder`, `Tracking.Subscribe` (WS), `Delivery.VerifyOtpCustomerView` (status only) |
| **Events in** | `logistics.job.updated`, `logistics.job.reassigned` |
| **Events out** | — (customer read) |
| **Empty / loading / error** | Pre-dispatch: fulfillment timeline without map. GPS stale: last ping + time. WS fail: poll. |
| **Country hooks** | `tracking.map_enabled`, `tracking.share_rider_phone`, `pod.otp_required`, contactless rules **LEGAL REVIEW** |

Job type: **MEDICINE_DELIVERY** for pharmacy/vendor goods. Report copies use **REPORT_DELIVERY**. Customer UI shares components; copy differs.

---

### 6.19 Prescription upload (`M-CUS-RX-UP`)

| | |
| --- | --- |
| **Purpose** | Capture Rx images/PDF as HealthArtifact + Prescription verification case. |
| **Screens / capabilities** | Camera/gallery/PDF; multi-page; patient-on-Rx confirm; OCR assist (**non-authoritative**); link to cart/order. |
| **Dependencies** | `prescription`, `health`, object storage, `compliance` |
| **APIs** | `Prescription.CreateUpload`, `Prescription.AttachFile`, `Prescription.Submit`, `Prescription.Get` |
| **Events in** | `prescription.verification.updated` |
| **Events out** | `prescription.uploaded`, `prescription.submitted` |
| **Empty / loading / error** | Unreadable: retry tips. Virus/file type reject. Size limits. Duplicate submit: idempotent. |
| **Country hooks** | `rx.upload.enabled`, `rx.allowed_mime[]`, `rx.ocr.enabled`, `rx.identity_match_required`, controlled-drug in-person **LEGAL REVIEW** |

OCR never auto-dispenses. Pharmacist (or policy reviewer) is source of truth. See [Pharmacy](06_PHARMACY_PLATFORM.md).

---

### 6.20 Prescription history (`M-CUS-RX-HIST`)

| | |
| --- | --- |
| **Purpose** | List customer Rx artifacts (uploads + digital Rx from encounters) and “order medicines” entry. |
| **Screens / capabilities** | Filters; open artifact; order-from-Rx; share via ConsentGrant. |
| **Dependencies** | `prescription`, `health`, `catalog` (SKU map) |
| **APIs** | `Prescription.List`, `Prescription.OrderFrom` |
| **Events in** | `health.artifact.created`, `prescription.signed` |
| **Events out** | `prescription.order.started` |
| **Empty / loading / error** | Empty: upload or book doctor. Unmapped drug: partial cart + “ask pharmacist”. |
| **Country hooks** | `rx.validity_days` (do not invent; empty until legal), `rx.reuse_allowed` **LEGAL REVIEW** |

---

### 6.21 Doctor discovery (`M-CUS-DOC-DISC`)

| | |
| --- | --- |
| **Purpose** | Find licensed doctors eligible for the country/policy (specialty, language, fee, mode). |
| **Screens / capabilities** | Filters, availability hint, next slot, fee range; **no** ranking that implies clinical superiority. |
| **Dependencies** | `care`, `search`, `compliance` (license flags) |
| **APIs** | `Doctor.Search`, `Doctor.ListSpecialties` |
| **Events in** | `doctor.profile.published`, `slot.updated` |
| **Events out** | `doctor.search.performed` |
| **Empty / loading / error** | None in geo/specialty: waitlist or “not available in this country”. |
| **Country hooks** | `telemedicine.enabled`, `doctor.discovery.enabled`, specialty taxonomy |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Cross-border telemedicine eligibility.

---

### 6.22 Doctor profile (`M-CUS-DOC-PROF`)

| | |
| --- | --- |
| **Purpose** | Public professional profile: credentials as allowed, languages, fee Offers, reviews summary. |
| **Screens / capabilities** | Bio, registration number **if pack allows display**, slots preview, book CTA. |
| **Dependencies** | `care`, `catalog` (consult products), `compliance` |
| **APIs** | `Doctor.GetPublic`, `Offer.ListConsults` |
| **Events in** | `doctor.profile.updated` |
| **Events out** | `doctor.profile.viewed` |
| **Empty / loading / error** | Unpublished: 404. License suspended: hide book. |
| **Country hooks** | `doctor.show_license_number`, `doctor.reviews.enabled` **LEGAL REVIEW** |

---

### 6.23 Doctor booking (`M-CUS-DOC-BOOK`)

| | |
| --- | --- |
| **Purpose** | Select consult product + slot → Booking child on CheckoutSession. |
| **Screens / capabilities** | Mode (video/audio/chat), slot calendar, reason (optional), pay/hold. |
| **Dependencies** | `care`, `payment`, `checkout` |
| **APIs** | `Slot.List`, `Booking.CreateDoctorDraft`, `Checkout.SetChildren` |
| **Events in** | `slot.held`, `slot.stolen` |
| **Events out** | `booking.doctor.drafted` |
| **Empty / loading / error** | Slot stolen: refresh grid. Ineligible (policy): block with reason code, not a stack trace. |
| **Country hooks** | `consult.modes[]`, `consult.hold_vs_capture`, `consult.prescription_followup_included` |

Fee is an **Offer** (consult product), integer minor units.

---

### 6.24 Appointment (`M-CUS-APPT`)

| | |
| --- | --- |
| **Purpose** | Customer view of doctor Bookings: upcoming, cancel/reschedule policy, join window. |
| **Screens / capabilities** | List/detail; add to calendar; reschedule; cancel; pre-consult questionnaire if pack. |
| **Dependencies** | `care`, `video`, `health` |
| **APIs** | `Appointment.List`, `Appointment.Get`, `Appointment.Cancel`, `Appointment.Reschedule` |
| **Events in** | `appointment.updated`, `encounter.ready` |
| **Events out** | `appointment.cancel.requested` |
| **Empty / loading / error** | Empty: discover doctors. Doctor cancelled: refund path J16 + rebook CTA. |
| **Country hooks** | `appointment.cancel_hours`, `appointment.reschedule_max`, `appointment.no_show_fee` **LEGAL REVIEW** |

State machine owned by [Doctor](08_DOCTOR_PLATFORM.md); customer sees a projection.

---

### 6.25 Video consultation (`M-CUS-VIDEO`)

| | |
| --- | --- |
| **Purpose** | Join LiveKit consult with waiting room, identity check as required, reconnect. |
| **Screens / capabilities** | Waiting room; device permissions; video/audio; timer; end; fallback to audio. **Recording off by default.** |
| **Dependencies** | `video` (LiveKit), `care`, `health` (consent) |
| **APIs** | `Video.GetJoinToken`, `Video.Heartbeat`, `Video.ReportQuality` |
| **Events in** | `video.session.updated`, `encounter.started` |
| **Events out** | `video.join.attempted`, `video.reconnect` |
| **Empty / loading / error** | Permission deny: audio-only CTA. Network: reconnect. Token expire: refresh. Doctor late: wait policy. |
| **Country hooks** | `video.enabled`, `video.recording.allowed`, `video.identity_check`, `video.data_residency` |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Recording, cross-border media, and teleconsult standard of care. Recording requires policy **and** ConsentGrant. Consult continues if recording denied.

---

### 6.26 Chat (`M-CUS-CHAT`)

| | |
| --- | --- |
| **Purpose** | Platform chat as **source of truth** for consult messaging (survives WebRTC drop). Not a social inbox. |
| **Screens / capabilities** | Thread per Encounter; image send if policy; freeze after window; export to artifact if signed. |
| **Dependencies** | `care`, `health`, `notification` |
| **APIs** | `Chat.ListMessages`, `Chat.Send`, `Chat.MarkRead` |
| **Events in** | `chat.message.created` |
| **Events out** | `chat.message.sent` |
| **Empty / loading / error** | Pre-consult: “chat opens at start”. Send fail: retry queue. |
| **Country hooks** | `chat.pre_consult.enabled`, `chat.post_consult_hours`, `chat.media_allowed` |

**OPEN DECISION (OD-CUS-08):** Whether consult chat is retained as a HealthArtifact automatically or only on doctor pin/sign.

---

### 6.27 Digital prescription (`M-CUS-DRX`)

| | |
| --- | --- |
| **Purpose** | Customer receives a signed digital Rx as HealthArtifact and can order mapped SKUs. |
| **Screens / capabilities** | View (verified renderer); download if pack; order medicines; share with pharmacy via platform (not WhatsApp-forward as the clinical path). |
| **Dependencies** | `prescription`, `health`, `catalog`, `order` |
| **APIs** | `DigitalRx.Get`, `DigitalRx.Order` |
| **Events in** | `prescription.signed` |
| **Events out** | `digital_rx.viewed`, `prescription.order.started` |
| **Empty / loading / error** | Unsigned draft: not shown to customer. Render fail: support + retry. |
| **Country hooks** | `rx.digital.enabled`, `rx.customer_download`, e-sign validity **LEGAL REVIEW** |

---

### 6.28 Lab tests (`M-CUS-LAB`)

| | |
| --- | --- |
| **Purpose** | Browse lab CatalogItems (tests) with prep, restrictions, partner labs. |
| **Screens / capabilities** | PLP/PDP; fasting; age/sex restriction; home vs center **if** pack; add to lab booking draft (not medicine Cart). |
| **Dependencies** | `diagnostics`, `catalog`, `compliance` |
| **APIs** | `Lab.ListTests`, `Lab.GetTest` |
| **Events in** | `catalog.item.published` |
| **Events out** | `lab.test.viewed` |
| **Empty / loading / error** | Restricted: explain, do not add. Not in geo: hide or “unavailable”. |
| **Country hooks** | `labs.enabled`, `lab.home_collection_default`, `lab.center_visit.enabled` |

**OPEN DECISION (OD-CUS-09):** Home-first vs center-first (business doc recommends home-first).

---

### 6.29 Packages (`M-CUS-PKG`)

| | |
| --- | --- |
| **Purpose** | Bundled tests (and rarely consult add-ons) as CatalogItems of type package. |
| **Screens / capabilities** | Inclusions, prep union, price, book flow same as tests. |
| **Dependencies** | `diagnostics`, `catalog` |
| **APIs** | `Lab.ListPackages`, `Lab.GetPackage` |
| **Events in** | `catalog.item.published` |
| **Events out** | `lab.package.viewed` |
| **Empty / loading / error** | Partial unavailability of included tests: block package or split **OPEN DECISION (OD-CUS-10)** — recommendation: **block** package, offer individual tests. |
| **Country hooks** | `lab.packages.enabled` |

---

### 6.30 Home collection (`M-CUS-HOMECOL`)

| | |
| --- | --- |
| **Purpose** | Customer-facing home phlebotomy: address, instructions, job tracking of collection LogisticsJob. |
| **Screens / capabilities** | Prep checklist; collect-from address; on-the-way status; reschedule. |
| **Dependencies** | `diagnostics`, `logistics`, `party` |
| **APIs** | `LabBooking.SetCollection`, `Tracking.GetForBooking` |
| **Events in** | `logistics.job.updated` (collection job types) |
| **Events out** | `lab.collection.preference.set` |
| **Empty / loading / error** | Area not serviceable: offer center if enabled. Patient unavailable policy copy. |
| **Country hooks** | `lab.home_collection.enabled`, `lab.collection_job_type` |

---

### 6.31 Slot booking (`M-CUS-SLOT`)

| | |
| --- | --- |
| **Purpose** | Shared slot UX for doctor and lab (different backends, same interaction). |
| **Screens / capabilities** | Calendar; time grid; timezone; conflict with fasting windows. |
| **Dependencies** | `care` or `diagnostics` |
| **APIs** | `Slot.List`, `Slot.Hold` |
| **Events in** | `slot.updated` |
| **Events out** | `slot.hold.created` |
| **Empty / loading / error** | No slots: notify-me. Hold expired: restart. Concurrent hold: first-writer wins. |
| **Country hooks** | `slot.hold_seconds`, `slot.timezone_display`, `slot.min_lead_minutes` |

---

### 6.32 Sample tracking (`M-CUS-SAMPLE`)

| | |
| --- | --- |
| **Purpose** | Non-technical timeline: collected → in transit → at lab → processing → reported. No chain-of-custody internals. |
| **Screens / capabilities** | Status, SLA hint, delay notice; **not** barcode values. |
| **Dependencies** | `diagnostics`, `logistics` |
| **APIs** | `Sample.GetCustomerView` |
| **Events in** | `sample.state.changed`, `report.released` |
| **Events out** | — |
| **Empty / loading / error** | Pre-collection: appointment card. Lost sample: support + rebook policy. |
| **Country hooks** | `lab.sample_tracking.customer_granularity` |

---

### 6.33 Reports (`M-CUS-REP`)

| | |
| --- | --- |
| **Purpose** | Digital lab reports as HealthArtifacts; view, download, share with doctor via consent. |
| **Screens / capabilities** | PDF/HTML viewer; trend if structured; share; print request CTA. |
| **Dependencies** | `diagnostics`, `health`, `notification` |
| **APIs** | `Report.List`, `Report.Get`, `Consent.Grant` |
| **Events in** | `report.released`, `report.amended` |
| **Events out** | `report.viewed`, `consent.granted` |
| **Empty / loading / error** | Empty: book test. Amended: banner. Notification fail: report still listed. |
| **Country hooks** | `report.customer_download`, `report.share_expiry_hours`, panic-value display **LEGAL REVIEW** |

Support must **not** see full clinical payload by default (OD-RBAC-02).

---

### 6.34 Physical report delivery (`M-CUS-REP-PHYS`)

| | |
| --- | --- |
| **Purpose** | Optional hard-copy: fee Offer → print → REPORT_DELIVERY job → OTP. |
| **Screens / capabilities** | Request copy; address; pay if fee; track like a parcel. |
| **Dependencies** | `diagnostics`, `payment`, `logistics` |
| **APIs** | `Report.RequestHardCopy`, `Checkout.CreateSession` (fee-only Order or Booking per [Lab](09_LAB_PLATFORM.md)) |
| **Events in** | `report.print.updated`, `logistics.job.updated` |
| **Events out** | `report.hardcopy.requested` |
| **Empty / loading / error** | Print fail: retry. Lost package: re-print policy. |
| **Country hooks** | `report.physical.enabled`, `report.physical.fee` |

**OPEN DECISION (OD-CUS-11):** Re-print at no charge vs paid (also flagged in J14).

---

### 6.35 Health records (`M-CUS-EHR`)

| | |
| --- | --- |
| **Purpose** | Unified HealthArtifact library with consent management. Commerce objects are **not** stored here. |
| **Screens / capabilities** | Upload (customer docs), list by type, viewer, revoke consent, export **if** pack. |
| **Dependencies** | `health`, `compliance` |
| **APIs** | `Health.ListArtifacts`, `Health.GetArtifact`, `Health.Upload`, `Consent.List`, `Consent.Grant`, `Consent.Revoke` |
| **Events in** | `health.artifact.created` |
| **Events out** | `consent.granted`, `consent.revoked` |
| **Empty / loading / error** | Empty: explain sources (Rx, reports, consult). Upload virus/type fail. |
| **Country hooks** | `health.customer_upload.enabled`, `health.export.enabled`, residency, retention **LEGAL REVIEW** |

Family access without ConsentGrant is forbidden. See OD-CUS-04.

---

### 6.36 Health timeline (`M-CUS-TIMELINE`)

| | |
| --- | --- |
| **Purpose** | Chronological merge of artifacts and care events (orders as **links**, not clinical facts). |
| **Screens / capabilities** | Infinite scroll; filters; jump to order/booking/artifact. |
| **Dependencies** | `health`, `order`, `care`, `diagnostics` |
| **APIs** | `Timeline.List` |
| **Events in** | multiple domain events |
| **Events out** | — |
| **Empty / loading / error** | Empty state education. Partial source fail: show available + warning. |
| **Country hooks** | `timeline.include_commerce_links` (default true) |

---

### 6.37 Wallet (`M-CUS-WALLET`)

| | |
| --- | --- |
| **Purpose** | Country-gated **stored value**, not a bank. Balance in minor units of pack currency. |
| **Screens / capabilities** | Balance, holds, history, top-up (if allowed), pay-from-wallet at checkout, refund-to-wallet. |
| **Dependencies** | `wallet`, `payment`, `ledger` |
| **APIs** | `Wallet.Get`, `Wallet.ListTx`, `Wallet.TopUp` (if enabled) |
| **Events in** | `wallet.updated`, `refund.completed` |
| **Events out** | `wallet.topup.started` |
| **Empty / loading / error** | Disabled: hide module. Pending hold: explain. Top-up fail: PaymentIntent fail UX. |
| **Country hooks** | `wallet.enabled`, `wallet.topup.enabled`, `wallet.max_balance_minor`, KYC thresholds **LEGAL REVIEW** |

**ASSUMPTION (A-BIZ-03):** Wallet is stored value, country-gated. No cross-country wallet merge.

---

### 6.38 Payments (`M-CUS-PAY`)

| | |
| --- | --- |
| **Purpose** | Method selection and PaymentIntent UX. No gateway SDK business logic in the app. |
| **Screens / capabilities** | Methods from pack (cards, local APMs, COD, wallet); 3DS/redirect; status poll. |
| **Dependencies** | [Payment](12_PAYMENT_PLATFORM.md) adapters |
| **APIs** | `Payment.ListMethods`, `Payment.GetIntent`, `Payment.ClientComplete` |
| **Events in** | `payment.intent.updated` |
| **Events out** | — (kernel produces payment events) |
| **Empty / loading / error** | No methods: block checkout. Redirect abandon: PENDING until expire. Duplicate pay: same intent. |
| **Country hooks** | `payments.methods[]`, `payments.gateways[]`, `payments.3ds`, `payments.cod` |

Never send PAN through World Pharma servers if the adapter uses hosted fields. **LEGAL/COMPLIANCE REVIEW REQUIRED** per acquiring country.

---

### 6.39 Refunds (`M-CUS-REFUND`)

| | |
| --- | --- |
| **Purpose** | Customer-visible refund status for Order/Booking cancellations, returns, failed collection. |
| **Screens / capabilities** | Request (where allowed); status; destination (original vs wallet). |
| **Dependencies** | `payment`, `ledger`, `order`, `care`, `diagnostics` |
| **APIs** | `Refund.List`, `Refund.Get`, `Refund.Request` |
| **Events in** | `refund.updated` |
| **Events out** | `refund.requested` |
| **Empty / loading / error** | Gateway fail: “processing” + ticket. COD cash: reverse logistics copy. FX: original currency first. |
| **Country hooks** | `refund.destinations[]`, `refund.sla_hours`, `refund.wallet_default` |

Customer cannot post ledger entries. Finance/system only. See J16.

---

### 6.40 Membership (`M-CUS-MEM`)

| | |
| --- | --- |
| **Purpose** | Optional paid/earned membership affecting fees, delivery, or consult discounts. |
| **Screens / capabilities** | Benefits, subscribe, cancel, status. |
| **Dependencies** | `catalog` (membership product), `payment`, `compliance` |
| **APIs** | `Membership.Get`, `Membership.Subscribe`, `Membership.Cancel` |
| **Events in** | `membership.updated` |
| **Events out** | `membership.subscribed` |
| **Empty / loading / error** | Disabled: hide. Payment fail: standard. |
| **Country hooks** | `membership.enabled`, `membership.benefits[]` |

**OPEN DECISION (OD-CUS-12):** Paid vs earn vs hybrid; clinical-fee discounts may be inducement. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

### 6.41 Loyalty (`M-CUS-LOYAL`)

| | |
| --- | --- |
| **Purpose** | Points/stamps/cashback **as integer units**, never float, country-scoped. |
| **Screens / capabilities** | Balance, earn rules (CMS), redeem at checkout if eligible. |
| **Dependencies** | `wallet` or loyalty subledger, `compliance` |
| **APIs** | `Loyalty.Get`, `Loyalty.PreviewRedemption` |
| **Events in** | `loyalty.updated` |
| **Events out** | `loyalty.redeemed` |
| **Empty / loading / error** | Zero balance: earn explainer. Ineligible SKUs: line-level. |
| **Country hooks** | `loyalty.enabled`, `loyalty.earn_on[]`, `loyalty.rx_eligible` **LEGAL REVIEW** |

**OPEN DECISION (OD-CUS-13):** Points vs cashback vs stamps; whether loyalty is a wallet sub-account.

---

### 6.42 Coupons (`M-CUS-COUPON`)

| | |
| --- | --- |
| **Purpose** | Customer-entered codes; server-authoritative discount on CheckoutSession quote. |
| **Screens / capabilities** | Apply/remove; ineligible reason codes (not “invalid” only). |
| **Dependencies** | `order`, `compliance`, `affiliate` (stacking) |
| **APIs** | `Coupon.Preview`, `Checkout.ApplyCoupon` |
| **Events in** | `coupon.invalidated` |
| **Events out** | `coupon.applied` |
| **Empty / loading / error** | Not found / expired / min-ticket / first-order / stacking / geo. |
| **Country hooks** | `coupons.enabled`, `coupons.stacking_policy`, `coupons.clinical_services_allowed` **LEGAL REVIEW** |

---

### 6.43 Offers (`M-CUS-OFFERS`)

| | |
| --- | --- |
| **Purpose** | Browse marketed Offer campaigns (not the Offer entity editor). Banner → filtered catalog. |
| **Screens / capabilities** | Deal rails, timers, T&C. |
| **Dependencies** | `cms`, `catalog` |
| **APIs** | `Campaign.ListOffers` |
| **Events in** | `cms.published` |
| **Events out** | `offer.campaign.viewed` |
| **Empty / loading / error** | None: hide rail. Expired: remove from home. |
| **Country hooks** | `promotions.enabled`, medicine advertising **LEGAL REVIEW** |

---

### 6.44 Affiliate / referral (`M-CUS-AFF`)

| | |
| --- | --- |
| **Purpose** | Customer as **referee** (code at signup/checkout) and optional **referrer** if pack allows customer-share links. |
| **Screens / capabilities** | Enter code; share link; status of rewards. Not the affiliate ops portal. |
| **Dependencies** | [Affiliate](14_AFFILIATE_PLATFORM.md) |
| **APIs** | `Referral.Attach`, `Referral.GetMyCode` |
| **Events in** | `affiliate.attribution.updated` |
| **Events out** | `referral.code.applied` |
| **Empty / loading / error** | Self-referral: reject. Clinical inducement block: hide share for consults if pack forbids. |
| **Country hooks** | `affiliate.customer_referral.enabled`, `affiliate.eligible_services[]` **LEGAL REVIEW** |

---

### 6.45 Notifications (`M-CUS-NOTIF`)

| | |
| --- | --- |
| **Purpose** | In-app inbox + preference center for templates (order, consult, report, promo). |
| **Screens / capabilities** | Inbox, deep links, channel prefs (push/SMS/email/WhatsApp). |
| **Dependencies** | [Notifications](23_NOTIFICATION_ARCHITECTURE.md) |
| **APIs** | `Notification.List`, `Notification.MarkRead`, `Notification.UpdatePrefs` |
| **Events in** | `notification.dispatched` |
| **Events out** | `notification.pref.updated` |
| **Empty / loading / error** | Empty inbox OK. Push denied: still in-app. Promo vs transactional hard-split. |
| **Country hooks** | `notify.channels[]`, `notify.whatsapp`, `notify.promo.opt_in_default` **LEGAL REVIEW** |

Transactional messages are not fully suppressible (safety-critical: panic workflow may still notify). Exact rules: **LEGAL REVIEW**.

---

### 6.46 Support (`M-CUS-SUPPORT`)

| | |
| --- | --- |
| **Purpose** | Help center + contact paths. Does not mutate orders except via ticket workflows. |
| **Screens / capabilities** | FAQ (CMS), order-contextual help, call/chat later. |
| **Dependencies** | `cms`, [CRM](15_CRM_PLATFORM.md) |
| **APIs** | `Help.Search`, `Support.GetChannels` |
| **Events in** | — |
| **Events out** | `help.article.viewed` |
| **Empty / loading / error** | CMS down: emergency phone from pack if any. |
| **Country hooks** | `support.channels[]`, `support.hours`, language |

---

### 6.47 Tickets (`M-CUS-TICKET`)

| | |
| --- | --- |
| **Purpose** | Create/track support tickets linked to Order, Booking, or PaymentIntent. |
| **Screens / capabilities** | Create, list, message, close; attach screenshots (not a second Rx pipeline). |
| **Dependencies** | `support` |
| **APIs** | `Ticket.Create`, `Ticket.List`, `Ticket.Get`, `Ticket.Reply` |
| **Events in** | `ticket.updated` |
| **Events out** | `ticket.created` |
| **Empty / loading / error** | Empty: create CTA. PII: customer sees own; agent sees masked clinical. |
| **Country hooks** | `ticket.categories[]`, `ticket.sla_hours` |

State machine: [CRM](15_CRM_PLATFORM.md).

---

### 6.48 Reviews (`M-CUS-REV`)

| | |
| --- | --- |
| **Purpose** | Ratings for fulfilled Order, completed Encounter, lab Booking — never for unverified clinical quality claims. |
| **Screens / capabilities** | Prompt after complete; edit window; report abuse. |
| **Dependencies** | `order`, `care`, `diagnostics`, `compliance` |
| **APIs** | `Review.Create`, `Review.Update`, `Review.ListForEntity` |
| **Events in** | `order.delivered`, `encounter.completed`, `report.released` |
| **Events out** | `review.created` |
| **Empty / loading / error** | Too early: hidden. Duplicate: update. Moderation hold: “under review”. |
| **Country hooks** | `reviews.enabled`, `reviews.doctor.enabled` **LEGAL REVIEW**, `reviews.medicine.enabled` |

---

### 6.49 Settings (`M-CUS-SET`)

| | |
| --- | --- |
| **Purpose** | Country, language, notifications, devices, legal docs, delete/export requests. **Same Person** may use permitted services while travelling: switch `country_id` explicitly; **do not** merge wallets/carts; **do not** silently enable teleconsult/Rx/lab because GPS moved. |
| **Screens / capabilities** | Change country (warns cart/wallet isolation; shows which services the destination pack allows); privacy; delete account request. |
| **Dependencies** | `identity`, `compliance`, `notification` |
| **APIs** | `Settings.Get`, `Settings.Update`, `Account.RequestExport`, `Account.RequestDelete` |
| **Events in** | — |
| **Events out** | `account.deletion.requested`, `country.switched` |
| **Empty / loading / error** | Delete not instant: queued, legal retention. |
| **Country hooks** | `privacy.deletion_process`, `i18n.locales[]` **LEGAL REVIEW** |

---

## 7. Failure cases (customer + kernel)

All of these must have **reason codes**, customer copy keys, and ops runbooks. Money paths must be idempotent.

| ID | Failure | Detection | Customer UX | Kernel action |
| --- | --- | --- | --- | --- |
| F-PAY | Payment fail / decline | Gateway + intent status | Reason if safe; retry same CheckoutSession if unexpired | Intent FAILED; session FAILED or stay PENDING per adapter |
| F-NET | Network drop mid-pay | Client timeout | “Don’t pay again”; poll `Checkout.Get` | Idempotent StartPayment |
| F-DUP | Duplicate checkout | Same idempotency key / cart hash window | Return existing session | No second capture |
| F-TMO | Session/hold timeout | `expires_at` | Re-quote; rebuild children | Release inventory/slots; EXPIRED |
| F-OOS | Out of stock after pay | Allocate fail | Refund or substitute offer | PARTIALLY_FAILED / cancel line; ledger refund |
| F-RX | Rx reject | Pharmacist reject | Reason + re-upload / consult CTA | Release stock; refund policy |
| F-ADR | Address invalid / unserviceable | Serviceability | Fix pin or change address | Block StartPayment |
| F-FRD | Fraud hold | Risk engine | “Under review”; no extra docs unless policy | Session hold; no fulfill |
| F-SLOT | Slot stolen | Optimistic lock | Pick new slot | New hold |
| F-VID | Video connect fail | LiveKit + client | Audio fallback, retry, reschedule | Encounter remains; no auto-refund until policy |
| F-COD | COD collect fail | Rider | Reattempt / cancel | Ledger + reverse logistics |

**OPEN DECISION (OD-CUS-14):** OOS after pay: auto-refund vs customer-accept substitute (also J01). Recommendation: **auto-refund** unless customer explicitly accepts a substitute Offer in-app.

**RISK:** Double capture on client retry. Mitigation: PaymentIntent uniqueness per CheckoutSession.

---

## 8. User journeys (customer perspective)

Full business text: [Business Architecture](02_BUSINESS_ARCHITECTURE.md) §6. Below is the **customer-app** mapping only (J01–J16).

| ID | Journey | Primary modules | Happy path (customer) | Customer-visible failures |
| --- | --- | --- | --- | --- |
| J01 | Buy medicine (OTC) | Search, Medicines, Cart, Checkout, Payments, Orders, Tracking | Search → PDP → Offer → cart → address → pay → track → OTP | F-PAY, F-OOS, F-ADR, F-DUP, F-FRD, rider fail |
| J02 | Upload prescription | Rx upload, history, Cart, Checkout | Upload → submitted → notified verified → confirm items → pay | Unreadable, reject, controlled-drug block **LEGAL REVIEW**, identity mismatch |
| J03 | Order from vendor | Vendors, Cart, Checkout, Orders | Pick vendor Offer → same as J01 with vendor seller | Vendor timeout auto-cancel, reject, **no multi-vendor split** |
| J04 | Track medicine delivery | Order tracking | Live status → ETA → OTP | GPS stale, reassignment, OTP fail, contactless rules **LEGAL REVIEW** |
| J05 | Book doctor | Discovery, profile, booking, Checkout | Slot → pay/hold → confirmed | Slot stolen, pay fail, ineligible teleconsult |
| J06 | Video consultation | Appointment, Video, Chat | Waiting room → join → consult | Network, permissions, no-show, reconnect, recording denied |
| J07 | Doctor creates Rx | Digital Rx *(customer receive)* | Notification → artifact | Unsigned not shown; incomplete fields are doctor-side |
| J08 | Order prescribed medicine | Digital Rx / history, Cart, Checkout | Order medicines → mapped SKUs → J01/J02 | Unmapped drug, strength mismatch, partial fill |
| J09 | Book lab test | Lab tests, Packages, Slot, Home collection, Checkout | Prep → slot → address → pay | Fasting conflict, slot full, age/gender, geo |
| J10 | Sample collected | Home collection, Sample tracking | Job arriving → verify → collected | Unavailable, consent fail, insufficient sample (lab notifies) |
| J11 | Sample at lab | Sample tracking | Status “at lab” / processing | Delay SLA copy; lost sample → support |
| J12 | Pathologist approves | Reports *(wait)* | (no customer action) | Delay messaging; panic workflow **LEGAL REVIEW** |
| J13 | Digital report | Reports, Health records, Timeline | Push → open → share via consent | Notify fail (still in records); no unauthorized family access |
| J14 | Hard copy request | Physical report, Checkout, Tracking | Pay fee if any → track REPORT_DELIVERY | Print fail, address, re-delivery, lost pack (OD-CUS-11) |
| J15 | Hard copy delivered | Tracking | OTP/POD complete | Same as logistics POD failures |
| J16 | Refund | Refunds, Wallet, Orders | Eligible cancel/return → status → money back | Gateway refund fail, partial, COD cash handling, FX |

J17–J21 are supply-side / finance; customer may only see resulting refunds or referral rewards.

---

## 9. RBAC — customer self scope

| Item | Rule |
| --- | --- |
| Role | `customer` |
| Scope | `self` only |
| Typical permissions | `order:create`, `order:read` (own), `order:cancel` (policy), `lab_booking:create`, `appointment:manage` (own), `health_artifact:read` (own), `consent:grant`, `consent:revoke`, `ticket` create own |
| Forbidden | Any other customer’s PII/clinical data; other vendors’ internals; ledger write; `prescription:verify`; `report:sign`; `inventory:adjust` |
| Health | Doctors need a valid **ConsentGrant**; customer grants/revokes. Support: no clinical payload by default. |
| Membership context | JWT `membership_id` = customer membership; `country_id` selected. |

Caregiver dual-control is **not** v1 (OD-CUS-04 / OD-RBAC-03).

---

## 10. Event catalog (customer-relevant)

Produced for outbox → notification, search, analytics, CRM. Names are logical.

| Event | When |
| --- | --- |
| `customer.registered` | Registration complete |
| `checkout.session.paid` | Envelope PAID |
| `order.state.changed` | Any order transition |
| `booking.state.changed` | Appointment/lab booking |
| `prescription.uploaded` / `prescription.verification.updated` | Rx desk |
| `health.artifact.created` | Rx/report/note |
| `consent.granted` / `consent.revoked` | Share |
| `refund.updated` | Refund machine |
| `logistics.job.updated` | Tracking |

Consumers: notification templates, timeline indexer, CRM 360. Customer app uses WS/poll projections, not raw Kafka.

---

## 11. Country Policy Pack hooks (index)

| Key (illustrative) | Modules |
| --- | --- |
| `auth.*`, `otp.*`, `auth.social.*` | Auth cluster |
| `wallet.enabled` | Wallet, checkout |
| `payments.methods[]` | Payments |
| `services.telemedicine` / `labs` / `marketplace` | Home, discovery |
| `rx.*` | Medicines, Rx |
| `tracking.*`, `pod.*` | Tracking |
| `membership.enabled`, `loyalty.enabled` | Growth |
| `affiliate.customer_referral.enabled` | Referral |
| Currency, locale, address format, tax display | All money UX |

Filling legal values is **out of engineering invention**. **LEGAL/COMPLIANCE REVIEW REQUIRED.**

---

## 12. Implementation notes for engineers

1. Customer APIs are the same modular monolith, scoped by `aud` + `self`.
2. Do not duplicate pricing, tax, Rx eligibility, or slot locking in RN/Next.
3. CheckoutSession confirmation and ledger posting are **not** client responsibilities.
4. Feature flags = Country Policy Pack + runtime flags.
5. Observability: funnel events for J01–J16; never log Rx image bytes or PAN.

Phase sequencing: [Development Roadmap](33_DEVELOPMENT_ROADMAP.md).

---

## 13. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-CUS-01 | Mixed-basket UI (goods + booking) in v1? | Kernel yes; UI later via pack flag |
| OD-CUS-02 | COD vs prepaid status vocabulary | Same fulfillment states; method = COD |
| OD-CUS-03 | Guest checkout? | Account before pay |
| OD-CUS-04 | Caregiver accounts in customer app | Not v1; delivery “on behalf of” fields only |
| OD-CUS-05 | Social providers in first pack | Empty until pack lists; Apple if social+iOS requires |
| OD-CUS-06 | Maps provider | Per-country adapter |
| OD-CUS-07 | Own-pharmacy vs vendor search boost | Pack-configurable |
| OD-CUS-08 | Chat auto-saved as HealthArtifact? | Only if doctor signs/pins |
| OD-CUS-09 | Lab home-first vs center-first | Home-first where pack enables collection |
| OD-CUS-10 | Package with unavailable inclusion | Block package |
| OD-CUS-11 | Physical report reprint fee | Pack; do not invent |
| OD-CUS-12 | Membership design | Flag inducement; legal first |
| OD-CUS-13 | Loyalty unit model | Integer points as subledger |
| OD-CUS-14 | OOS after pay | Auto-refund unless substitute accepted |

---

## 14. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-CUS-01 | ASSUMPTION | Mobile and web share contracts |
| A-CUS-02 | ASSUMPTION | No multi-vendor goods Order in v1 |
| A-CUS-03 | ASSUMPTION | CheckoutSession pays Order and/or Booking |
| A-CUS-04 | ASSUMPTION | At most one Order child per session |
| A-CUS-05 | ASSUMPTION | One cart per customer per country |
| | RISK | Privilege confusion with staff tokens |
| | RISK | Double capture; OTP bombing; payment-captured/child-fail |
| | LEGAL | Social login, Rx validity, telemedicine, ads, wallet, membership, reviews, deletion |

See also A-BIZ-01–05 in [Business Architecture](02_BUSINESS_ARCHITECTURE.md).
