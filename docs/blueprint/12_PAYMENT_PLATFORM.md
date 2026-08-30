# 12 — Payment Platform

**Status:** Blueprint  
**Audience:** Product, architecture, engineering, finance, compliance  
**Requirement IDs:** REQ-PAY, REQ-FX, REQ-WAL  
**Journeys:** J01, J03, J05, J09, J14 (print fee), **J16** (refund), plus all paid flows  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Ledger & settlement](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

**Audit confirmation (REQ-PAY-001 / REQ-PAY-002):** this architecture already specifies **multiple gateway adapters, routing, fallback, retries, refunds/partial refunds, reconciliation, settlement handoff, ledger posting, affiliate/vendor/doctor/lab/rider payables, and original-currency retention**. The platform is **not** coupled to a single PSP. Details in §2–§15.

The payment platform is the **global orchestration kernel** for collecting, authorizing, capturing, verifying, refunding, and reconciling customer money. It is **not** an in-house acquirer and **not** the accounting ledger.

It exists so that pharmacy, marketplace, doctor, lab, membership, wallet, and logistics fee flows share one money pipeline with:

- Multiple licensed gateways behind **adapters**
- Routing by country, currency, method, amount, and risk
- Fallback and controlled retry
- Multi-currency objects that **never destroy the original transaction currency**
- Idempotent money mutations
- Verified, at-least-once webhooks with idempotent consumers
- A payment-domain transaction log that **emits** events for [13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md)

**ASSUMPTION (A-PAY-01):** The platform orchestrates licensed payment service providers (PSPs). It does not become a bank, e-money issuer, or card acquirer unless a future country legal entity obtains those licenses. Wallet is stored value and country-gated. See **LEGAL/COMPLIANCE REVIEW REQUIRED**.

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| CheckoutSession, PaymentIntent, Capture, Refund, Dispute/chargeback cases (ops objects) | Journal posting rules, chart of accounts, payout batches (those are ledger) |
| Gateway adapters, routing, fallback, webhook ingest | Participant settlement cycles |
| Payment-domain transaction log (attempts, gateway events, balances on an intent) | Vendor/doctor/lab/rider/affiliate payables as accounting truth |
| Customer wallet **balances and holds** (ops) | Wallet **liability** recognition in the books (ledger) |
| Method catalogs per country policy pack | Tax calculation source of truth (tax engine; payment stores the resulting tax amount) |
| Fraud/risk scores that **gate payment** | Affiliate fraud (affiliate module owns attribution fraud; payment may share device signals) |
| FX **quote snapshot** attached to a payment | Corporate FX hedging |

**Rule:** Payment may say “this capture succeeded for amount X in currency C at rate R.” Ledger decides how that splits across Platform, Pharmacy, Vendor, Doctor, Lab, Delivery partner, and Affiliate.

---

## 3. Design principles

1. **Adapter pattern, no provider coupling.** Domain services call `PaymentGatewayPort`. Stripe, Adyen, Razorpay, and local/regional PSPs are config-selected implementations. UI and domain modules must not import a gateway SDK.
2. **Country is first-class.** Methods, KYC for wallet, SCA/3-D Secure style step-up, COD, and payout rails are Country Policy Pack flags. Do not hardcode a launch country or a single domestic method as the default worldwide.
3. **Money POSTs are idempotent.** Every create/confirm/capture/refund/wallet credit/debit/payout initiation requires an `Idempotency-Key`.
4. **Original currency is sacred.** Display, order, payment, settlement, and accounting currencies may differ. The row that moved money always retains `payment_currency` + `payment_amount` + `fx_snapshot_id`.
5. **At-least-once webhooks, exactly-once business effect.** Consumers key on provider event id + intent id + event type.
6. **Authorize and capture are distinct.** Checkout creates intent; capture/authorize is an explicit later or immediate step, never implied by a second unguarded call.
7. **Wallet is not a bank.** **LEGAL/COMPLIANCE REVIEW REQUIRED** per country before enablement.
8. **Do not invent law.** SCA, stored-value, marketplace facilitator, and medicine-payment rules are encoded only after legal review.

---

## 4. Canonical money object

Every monetary value on this platform is a **Money** plus optional **FxSnapshot**. Never store a “converted only” amount without the source.

| Field | Meaning |
| --- | --- |
| `amount_minor` | Integer in currency minor units (or documented zero-decimal currencies) |
| `currency` | ISO 4217 code |
| `exponent` | Decimal places for that currency (from currency table, not guessed in code) |
| `rounding_mode` | Applied when converting **into** this amount |

**FxSnapshot** (immutable once attached to a committed payment):

| Field | Meaning |
| --- | --- |
| `fx_snapshot_id` | Stable id |
| `base_currency` / `quote_currency` | Pair |
| `rate` | Quoted rate |
| `rate_source` | Provider or treasury table |
| `quoted_at` | Timestamp |
| `lock_policy` | `QUOTE_LOCK` / `CAPTURE_LOCK` / `SETTLEMENT_DAY` — **OD-FX-02** |
| `inverse_rate` | Stored to support refund reconstruction |

**RISK:** Currency rounding on convert-then-sum vs sum-then-convert produces recon breaks. Policy: convert **each line** with documented rounding, persist both original and converted, and never re-convert historical rows with a new rate.

### 4.1 Five currency roles (must all be modeled)

| Role | Definition | Typical source |
| --- | --- | --- |
| **Customer display currency** | What the UI shows | Customer preference ∩ country allowed list |
| **Order currency** | Currency of catalog/offer prices for that checkout | Offer / country default |
| **Payment currency** | Currency actually charged on the instrument | Routing + method + PSP capability |
| **Settlement currency** | Currency the PSP settles into the platform merchant account | Merchant account config per gateway × country |
| **Accounting currency** | Books of the legal entity | Legal entity / country pack — **OD-FX-04** |

A single CheckoutSession stores all five (nullable only if identical and explicitly collapsed in a view). **NEVER** overwrite `payment_currency` after capture.

**ASSUMPTION (A-PAY-02):** v1 allows display currency ≠ payment currency only when the country pack and PSP both support it. If not supported, UI displays **order currency** and does not fake a converted price as the charged amount.

### 4.2 Refund conversion rules

| Case | Rule |
| --- | --- |
| Refund to original instrument | Refund in **original payment currency** for the captured amount (or remaining refundable). Do not convert unless the PSP requires it; if it requires it, persist both amounts. |
| Partial refund | Refundable remaining is tracked in **payment currency**. Line-level refunds keep original line currency. |
| Wallet credit instead of instrument | Credit wallet in a country-pack currency (**OD-FX-06**). Persist original payment money + conversion snapshot used for the credit. |
| COD already collected | Instrument refund is impossible; use reverse logistics + cash/wallet policy. Payment records `REFUND_UNAVAILABLE_COD`; ledger creates a payable/receivable. See J16. |
| FX movement between capture and refund | **OD-FX-01** who bears the difference (customer vs platform P&L). Until decided, **do not** silently take FX gain from the customer. Default engineering behavior: refund **original payment-currency amount**; FX delta posts to a platform FX P&L account in ledger. |

**OPEN DECISION (OD-FX-01):** Who bears FX on refund when settlement/accounting currencies moved.  
**OPEN DECISION (OD-FX-02):** Rate lock timing — checkout quote vs capture vs PSP settlement day.  
**OPEN DECISION (OD-FX-03):** Whether the customer may choose a payment currency different from order currency.  
**OPEN DECISION (OD-FX-04):** Accounting currency per legal entity vs per country vs per store.  
**OPEN DECISION (OD-FX-05):** Rounding mode per currency (half-up vs banker’s vs PSP-mandated). Default until decided: **half-up to currency exponent**, and **follow PSP rounding when the PSP is source of truth for that capture**.  
**OPEN DECISION (OD-FX-06):** Whether wallet top-up or refund-to-wallet may occur in a currency other than the wallet’s country currency.

---

## 5. Core objects and lifecycle

### 5.1 CheckoutSession

Commercial umbrella for one customer payment act. Aligns with [02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md) §4: **one payment may cover multiple domain children**.

| Field (logical) | Meaning |
| --- | --- |
| `checkout_session_id` | Stable id |
| `customer_id` / `country_id` | Actor and policy pack |
| `children[]` | Order ids, lab booking ids, appointment ids, membership ids, print-report ids |
| `amount_order` | Sum in order currency (with tax/fees breakdown) |
| `amount_display` | Display money |
| `selected_method` | From country-allowed catalog |
| `routing_plan_id` | Chosen gateway chain |
| `expires_at` | Hard expiry; inventory/slot holds must not outlive this without explicit extension |
| `status` | See state machine |
| `idempotency_key` | Client key for create |

**ASSUMPTION (A-PAY-03 / A-BIZ-02):** v1 does not mix multiple **vendors** in one goods order. A CheckoutSession **may** still pay multiple **fulfillment types** (e.g. medicines + lab) if product enables it.

**OPEN DECISION (OD-PAY-03):** Super checkout mixing medicines + lab + consult in one payment (also noted in 02). Recommendation: **allow one CheckoutSession with child documents**; fail the whole session if any child cannot be reserved; do not capture then orphan a child without a compensating refund.

State machine (CheckoutSession):

| Status | Meaning |
| --- | --- |
| `CREATED` | Holds placed (stock/slot) as required by child modules |
| `REQUIRES_PAYMENT` | Ready for PaymentIntent |
| `PAYMENT_IN_PROGRESS` | Intent created |
| `PAID` | Capture or authorized-per-policy succeeded; children confirmed |
| `FAILED` | Terminal fail; holds released |
| `EXPIRED` | Timeout; holds released |
| `CANCELLED` | Customer or system abort before money movement |
| `PARTIALLY_REFUNDED` / `REFUNDED` | Driven by refunds on intents |

### 5.2 PaymentIntent

A single attempt chain to move money for a CheckoutSession (or a retry that is a **new** intent with a new id, linked via `supersedes_intent_id`).

| Field (logical) | Meaning |
| --- | --- |
| `payment_intent_id` | Stable id |
| `checkout_session_id` | Parent |
| `capture_mode` | `AUTHORIZE` or `CAPTURE` (immediate) |
| `amount` / `payment_currency` | Charged money |
| `fx_snapshot_id` | Locked pair used for this intent |
| `gateway_id` / `merchant_account_id` | Routed destination |
| `provider_intent_ref` | PSP id (nullable until created) |
| `status` | See below |
| `next_action` | Redirect, OTP, 3-D Secure-style challenge, UPI collect wait, bank reference |
| `risk_decision` | `ALLOW` / `REVIEW` / `DENY` |
| `idempotency_key` | Required |

State machine (PaymentIntent):

| Status | Meaning |
| --- | --- |
| `CREATED` | Internal only |
| `REQUIRES_ACTION` | Customer must complete PSP flow |
| `AUTHORIZED` | Hold on instrument; not captured |
| `CAPTURED` | Money captured |
| `FAILED` | Terminal for this intent |
| `CANCELLED` | Auth voided or abandoned |
| `EXPIRED` | Auth window lapsed |
| `DISPUTED` | Chargeback opened (may overlap captured) |

**OPEN DECISION (OD-PAY-02):** Default capture mode per category (goods vs consult vs lab). Recommendation: **goods and lab: CAPTURE on success**; **consult: AUTHORIZE at booking, capture on encounter start or complete** — must not violate consumer-cancellation rules (**LEGAL/COMPLIANCE REVIEW REQUIRED**).

**OPEN DECISION (OD-PAY-08):** Whether partial capture is allowed (e.g. partial fill of Rx). Recommendation: **yes for goods**, with remaining auth voided; lab/consult default full capture.

### 5.3 Capture and Authorize

| Object | Rule |
| --- | --- |
| **Authorize** | Places a hold. Does not recognize revenue. Ledger may post a memo; settlement does not treat it as captured cash. |
| **Capture** | Converts authorized amount (or immediate charge) to captured. **Cannot exceed remaining authorized.** Second capture of the same remainder is a no-op if idempotent, error if a new key tries to over-capture. |
| **Void** | Releases unused authorization. |

**RISK: double capture.** Mitigations: remaining-amount column, unique constraint on `(payment_intent_id, capture_seq)` plus idempotency key unique to actor+route, and PSP-side idempotency forwarded when the adapter supports it.

### 5.4 Refund

| Field (logical) | Meaning |
| --- | --- |
| `refund_id` | Stable id |
| `payment_intent_id` | Source capture |
| `amount` / `payment_currency` | Always original payment currency for instrument refunds |
| `reason_code` | Policy engine (cancel, failed collection, quality, duplicate, goodwill) |
| `target` | `ORIGINAL_INSTRUMENT` / `WALLET` / `MANUAL_PAYABLE` |
| `status` | `PENDING` / `SUCCEEDED` / `FAILED` / `QUEUED_GATEWAY` |
| `idempotency_key` | Required |

Partial refunds decrement `refundable_remaining` in payment currency. Over-refund is rejected.

J16 happy path: eligible cancel/return/failed collection → refund policy engine → Payment Refund and/or wallet credit → **ledger reversing/compensating entries** (see 13). Failures: gateway refund fail (queue as platform payable to customer), FX rules, partial refund, COD cash handling.

### 5.5 Payment-domain transaction log (not the ledger)

Operational tables (logical):

| Object | Role |
| --- | --- |
| `PaymentAttempt` | Each confirm/redirect/retry against a PSP |
| `GatewayEvent` | Normalized webhook or poll result |
| `PaymentCapture` / `PaymentRefund` | Money-out/in-back records |
| `IntentBalance` | Authorized, captured, refunded, remaining — in **payment currency** |
| `ReconItem` | Matched or break vs PSP settlement file |

This log is the source for **what the PSP did**. [13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md) is the source for **who is owed what**.

---

## 6. Adapter pattern

### 6.1 Ports (logical operations)

Every gateway adapter implements the same port. Missing PSP features return `UNSUPPORTED` so routing can skip that adapter for that method.

| Operation | Notes |
| --- | --- |
| `create_intent` | Maps CheckoutSession to PSP session |
| `confirm` / `start_next_action` | Customer authentication |
| `authorize` | If distinct from create |
| `capture` | Full or remaining; pass platform idempotency |
| `void` | Unused auth |
| `refund` | Full/partial |
| `verify_webhook_signature` | Mandatory; reject unsigned |
| `parse_webhook` | Normalize to GatewayEvent |
| `fetch_transaction` | Pull-based truth for recon and missed webhooks |
| `list_settlement_items` | Settlement/payout files from PSP |
| `health` | Used by routing to demote a PSP |

Payout to participants is a **PayoutPort** (may be the same vendor or a bank/payout specialist). Do not assume acquiring adapter = payout adapter. **OD-PAY-06**.

### 6.2 Configuration, not code forks

Per country × environment:

| Config | Example use |
| --- | --- |
| Enabled `gateway_id` list | Weighted or priority |
| Merchant accounts | Per currency / per entity |
| Method catalog | Cards, bank, UPI-where-available, wallets, local methods, COD |
| Webhook secrets | Rotated; dual-secret window during rotation |
| Statement descriptor rules | Country pack |
| Min/max amounts per method | PSP and policy |

**Forbidden:** compiling a single PSP as “the” processor; putting publishable keys in a domain module other than the adapter; assuming one domestic real-time payment scheme exists everywhere.

---

## 7. Routing, fallback, retry

### 7.1 Routing inputs

- Country, order currency, payment currency, amount band
- Method
- Customer risk score, velocity, device reputation
- PSP health (success rate, latency, webhook delay)
- Cost (optional optimizer — **OD-PAY-09**)
- Regulatory/method mandates in the country pack (e.g. a local method **where the pack enables it**)
- BIN/issuer country when available (cards)

Output: **ordered chain** of `{gateway_id, merchant_account_id, method}`.

### 7.2 Fallback

If create/confirm fails with a **retryable PSP error** (timeout, 5xx, explicit routing error), try the next hop **only if no money could have been captured**. If the first hop is **unknown** (timeout after create), **do not** create a second intent until `fetch_transaction` or a webhook resolves the first.

**RISK:** Fallback after an unknown capture causes double charge.

### 7.3 Retry

| Layer | Policy |
| --- | --- |
| Customer retry | New PaymentIntent, new id, linked; CheckoutSession remains |
| Adapter retry | Same idempotency key to same PSP; bounded attempts |
| Webhook handler retry | Exponential backoff; poison queue after N |
| Refund retry | Queue `QUEUED_GATEWAY`; do not create duplicate refund ids |

**OPEN DECISION (OD-PAY-10):** Customer-visible failure vs silent retry window length. Recommendation: surface failure after first non-retryable error; retryable errors wait on the session expiry, not indefinitely.

**OPEN DECISION (OD-PAY-09):** Optimize routing for success rate, cost, or local-method preference. Recommendation: **success rate first**, cost second, explicit country-pack mandates override both.

---

## 8. Methods by country (configurable catalog)

The platform ships a **method taxonomy**. Country Policy Packs enable members of the taxonomy. There is no global default of a single domestic scheme.

| Method family | When it appears | Notes |
| --- | --- | --- |
| `CARD` | If pack + PSP support | Includes SCA/3-D Secure-style `REQUIRES_ACTION` |
| `BANK` | Bank transfer, debit, or “pay by bank” | Reconciliation may be delayed; CheckoutSession stays `PAYMENT_IN_PROGRESS` |
| `UPI` | **Only where the country pack enables it** | Treat as a local real-time method family, not a worldwide default |
| `WALLET_THIRD_PARTY` | Apple Pay, Google Pay, regional wallets | Via PSP token, not raw PAN in our vault |
| `WALLET_PLATFORM` | Platform stored value | See §11 |
| `COD` | If pack allows for that category | Capture is cash at door; payment intent status `AUTHORIZED_COD` until POD |
| `LOCAL_METHOD` | Plugin slot | Name, PSP, and UX from pack |
| `BNPL` | Not assumed in v1 | **OD-PAY-13** |

**OPEN DECISION (OD-PAY-13):** BNPL in 24-month roadmap.  
**OPEN DECISION (OD-PAY-11):** Split tender (wallet + card) in v1. Recommendation: **allow wallet partial + remainder on instrument** with two logical legs under one CheckoutSession, each with its own intent or a composed intent, both idempotent.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** COD for prescription medicines, card-not-present rules, and storing credentials-on-file.

---

## 9. Verification (customer and instrument)

“Verification” is any step that proves the payer controls the instrument or that the payment is complete.

| Mechanism | Trigger |
| --- | --- |
| Redirect / challenge (3-D Secure-style or local equivalent) | Country pack `sca_policy` + amount + risk |
| OTP / collect confirmation (real-time methods) | Method family |
| Bank reference matching | Delayed bank methods |
| Webhook + pull fetch | Always; webhook is not the only truth |
| Step-up auth on wallet spend | [03](03_USER_ROLES_AND_PERMISSIONS.md) MFA for wallet |

**OPEN DECISION (OD-PAY-07):** SCA/step-up policy by country and amount. Encode only after legal review. Engineering default: **follow PSP-required next_action**; do not skip challenges in software.

---

## 10. Idempotency

Applies to **all money POSTs**: create checkout, create intent, confirm, capture, void, refund, wallet credit, wallet debit, payout initiation, manual finance adjustments that move money.

| Rule | Detail |
| --- | --- |
| Header | `Idempotency-Key` (client-generated UUID or ULID) |
| Scope | `actor_id` + HTTP route + key |
| Replay | Same key + same payload hash → return original result |
| Conflict | Same key + different payload → `409 IDEMPOTENCY_CONFLICT` |
| TTL | **OD-PAY-14** (recommendation: 24–72 h stored; keys never reused for a different intent) |
| Storage | Persist request hash, response, and resulting object ids |

GET is naturally idempotent. Webhook POST uses **provider event id**, not the client idempotency key.

**OPEN DECISION (OD-PAY-14):** Idempotency key retention TTL.

---

## 11. Wallet (stored value)

| Rule | Detail |
| --- | --- |
| Nature | Platform stored value for convenience refunds, promotions, and optional top-up |
| Not | A bank account, interest-bearing deposit, or P2P payment rail |
| Country-gated | `wallet.enabled` in country pack; default **off** until legal review |
| Currency | One wallet currency per customer × country (**OD-FX-06** for exceptions) |
| Holds | Checkout may hold wallet balance; expiry releases hold |
| Credits | Refunds, goodwill (finance dual control), promo (ledger-funded) |
| Debits | Checkout tender; never silent |
| Transfer | Customer-to-customer **off** unless a future pack + license says otherwise |
| KYC | Thresholds in country pack; above threshold block spend/credit |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Stored-value / e-money / prepaid instrument licensing, expiry of balances, unclaimed property, and whether promotional credit is “money.”

**OPEN DECISION (OD-PAY-05):** Wallet product per country (off / promo-only / customer top-up).  
**ASSUMPTION (A-PAY-04 / A-BIZ-03):** Wallet is stored value, not a bank.

Ledger: wallet balance is a **liability** of the platform entity (see 13). Payment module is the operational balance; nightly (or event-driven) recon must match.

---

## 12. Webhooks

| Requirement | Detail |
| --- | --- |
| Signature | Verify with current secret (and previous during rotation). Reject if invalid. |
| Timestamp window | Reject stale events outside a configured skew (replay window). |
| At-least-once | PSP will retry; we must tolerate duplicates |
| Idempotent consumer | Unique `(gateway_id, provider_event_id)` |
| Ordering | Do not assume order. Apply events with **monotonic intent version** or last-write with fetch-to-confirm |
| Dual truth | On ambiguity, `fetch_transaction` wins over a single webhook |
| P95 | Directional: webhook processing < 10 s p95 ([04](04_APPLICATION_ARCHITECTURE.md) §11) |
| Outbox | After handling, emit domain events (`PaymentCaptured`, `PaymentFailed`, `RefundSucceeded`) via outbox for order/ledger/CRM |

**RISK: webhook replay.** An attacker who obtains a valid historical payload could replay it if signature+timestamp are not checked. Mitigations: signature, timestamp window, event-id uniqueness, never trust webhook to **increase** captured amount without fetch confirmation.

**RISK:** Treating webhook as the only capture signal. Always be able to poll.

---

## 13. Fraud and risk (payment)

Payment risk is a **gate**, not a complete fraud platform.

Signals (illustrative, not exhaustive): velocity of intents, distinct cards per customer, BIN country vs shipping country, disposable email, device reuse across accounts, COD abuse, refund velocity, stolen-instrument patterns from PSP `risk_score`.

Decisions: `ALLOW` / `REVIEW` (capture hold or delay fulfillment) / `DENY`.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Automated denial and profiling laws in the operating country.

Shared signals may be read by [14_AFFILIATE_PLATFORM.md](14_AFFILIATE_PLATFORM.md) (self-referral) and [15_CRM_PLATFORM.md](15_CRM_PLATFORM.md) (abuse tickets) without copying PAN or full instrument data.

**Never** store raw PAN/CVV. Tokens stay in PSP vault. PCI scope minimization is a security control — see [27_SECURITY_ARCHITECTURE.md](27_SECURITY_ARCHITECTURE.md).

---

## 14. Disputes and chargebacks

| Stage | Payment module | Ledger |
| --- | --- | --- |
| Opened | `DISPUTED` on intent; notify order/booking | Contingent liability / reserve |
| Evidence | Fulfillment POD, consult logs (non-clinical where possible), delivery OTP | — |
| Lost | Reduce captured; may claw back participant payables | Reversing entries |
| Won | Clear dispute flag | Release reserve |

**OPEN DECISION (OD-PAY-12):** Marketplace chargeback ownership (platform vs vendor) per country and merchant-of-record model.

**OPEN DECISION (OD-PAY-01):** Merchant of record vs marketplace facilitator vs vendor-as-seller (also in 02). This decision drives who the PSP customer is and who handles chargebacks.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Marketplace operator vs facilitator vs pharmacy marketplace licensing per country.

---

## 15. Reconciliation (payment side)

Daily (or per PSP file):

1. Import PSP settlement / payout file (`list_settlement_items`).
2. Match to `PaymentCapture` / `PaymentRefund` on `provider_intent_ref` + amount + currency.
3. Record fees in **fee currency** as given by PSP (often settlement currency).
4. Produce `MATCHED` / `AMOUNT_BREAK` / `MISSING_INTERNAL` / `MISSING_PSP` / `FX_BREAK`.
5. Emit `PaymentReconCompleted` for ledger to post gateway fees and cash-at-gateway movements.

**Never** “fix” a break by rewriting historical `payment_currency` or captured amounts. Adjust with new recon entries.

Finance UI: [17_ADMIN_ERP.md](17_ADMIN_ERP.md) / APP-FIN. Permission `ledger:read` does not imply `payment:refund`.

---

## 16. COD and cash

If country pack enables COD for a category:

- PaymentIntent is `AUTHORIZED_COD` (no PSP capture).
- Logistics POD + cash collected amount updates intent to `CAPTURED_COD` or `COD_SHORT` / `COD_FAILED`.
- Refunds cannot go to “original instrument”; J16 uses wallet or manual payable.

**RISK:** Fake POD + uncollected cash. Delivery module owns POD integrity; payment trusts POD events but finance recon of cash-in vs rider remittance is ledger + logistics.

---

## 17. Country Policy Pack keys (payment)

Illustrative keys — values filled per legal review, not invented here:

| Key | Purpose |
| --- | --- |
| `payments.gateways[]` | Enabled adapters |
| `payments.methods[]` | Enabled method families including `UPI` only if applicable |
| `payments.wallet.enabled` | Stored value |
| `payments.cod.enabled` + category allowlist | COD |
| `payments.sca_policy` | Step-up |
| `payments.currencies.display[]` / `order` / `settlement` | Currency roles |
| `payments.refund.window_days` | Commerce policy (not a statute unless legal encodes it) |
| `payments.fx.customer_choice` | OD-FX-03 |

---

## 18. Permissions and clients

From [03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md):

| Permission | Typical |
| --- | --- |
| `payment:refund` | finance; system policy engine |
| `wallet:credit` | system; finance manual with dual control |
| Customer pay | customer self, via checkout APIs |

Support **requests** refunds via tickets ([15](15_CRM_PLATFORM.md)); they do not call capture APIs. Clients never talk to PSP SDKs except via officially hosted PSP drop-in **inside the adapter-controlled checkout**, with tokens posted to our API.

Step-up MFA for wallet and refund: 03 §7.

---

## 19. Events emitted (for other modules)

| Event | Consumers |
| --- | --- |
| `CheckoutSessionPaid` | Order, Care, Diagnostics, Inventory, Affiliate attribution freeze, CRM |
| `PaymentCaptured` | Ledger, CRM 360, notifications |
| `PaymentFailed` | Order release holds, CRM abandoned-payment |
| `RefundSucceeded` / `RefundFailed` | Ledger, Order, Affiliate reverse, CRM |
| `WalletBalanceChanged` | Ledger liability, CRM |
| `DisputeOpened` / `DisputeClosed` | Ledger, Order, Vendor |

Modules must not post ledger entries inside the payment adapter.

---

## 20. Traceability to journeys

| Journey | Payment behavior |
| --- | --- |
| J01/J03 | CheckoutSession → Intent → Capture (or COD) |
| J05 | Pay or hold (OD-PAY-02) |
| J09 | Pay booking |
| J14 | Optional print fee |
| **J16** | Refund policy engine → instrument and/or wallet; FX and partial; COD exception |
| J17–J21 | Payment does not pay affiliates/vendors; it may run **PayoutPort** on ledger instruction |

---

## 21. Risks (register)

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-PAY-01 | **Webhook replay** | Signature, timestamp window, event-id uniqueness, fetch-to-confirm on amount increases |
| R-PAY-02 | **Currency rounding** | Persist original + snapshot; convert per line; never revalue history |
| R-PAY-03 | **Double capture** | Remaining amount, capture seq, idempotency, no fallback on unknown state |
| R-PAY-04 | Double charge on retry/fallback | Fetch before new intent |
| R-PAY-05 | Wallet treated as a bank | Country gate + legal review; no P2P |
| R-PAY-06 | PCI scope creep | No PAN storage; adapter isolation |
| R-PAY-07 | COD cash leakage | POD + rider remittance recon in ledger |
| R-PAY-08 | Privilege confusion | Customer tokens cannot hit finance refund APIs (03 `aud`) |

---

## 22. Assumptions

| ID | Statement |
| --- | --- |
| A-PAY-01 | Orchestrate licensed PSPs; no in-house acquiring in v1 |
| A-PAY-02 | Display ≠ payment currency only when pack + PSP support |
| A-PAY-03 | CheckoutSession may have multiple child documents; v1 no multi-vendor goods order |
| A-PAY-04 | Wallet is stored value, country-gated, not a bank |
| A-PAY-05 | Payment-domain log ≠ accounting journal |

---

## 23. Open decisions

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-PAY-01 | Merchant of record vs facilitator vs vendor-as-seller | Do not hardcode; country pack after legal |
| OD-PAY-02 | Default AUTHORIZE vs CAPTURE per category | Goods/lab capture on success; consult auth-then-capture |
| OD-PAY-03 | Super checkout mix of domains | One session, multiple children; all-or-nothing capture |
| OD-PAY-04 | COD remittance SLA and cash-over/short | Operations policy per country |
| OD-PAY-05 | Wallet enablement model | Off until legal; then promo-only vs top-up |
| OD-PAY-06 | Acquiring vs payout same vendor | Separate ports; config may use one vendor |
| OD-PAY-07 | SCA/step-up thresholds | Follow PSP required actions; legal encodes mandates |
| OD-PAY-08 | Partial capture | Yes for goods |
| OD-PAY-09 | Routing objective | Success rate, then cost, mandates override |
| OD-PAY-10 | Retry vs customer-visible fail | Non-retryable = fail immediately |
| OD-PAY-11 | Split tender wallet+instrument | Allow in v1 if wallet on |
| OD-PAY-12 | Chargeback ownership marketplace | Follow MoR model (OD-PAY-01) |
| OD-PAY-13 | BNPL | Out of v1 |
| OD-PAY-14 | Idempotency TTL | 24–72 h |
| OD-FX-01 | Who bears refund FX delta | Refund original payment-currency amount; delta to platform FX P&L |
| OD-FX-02 | FX lock timing | Capture lock for captured txs; quote shown as estimate if different |
| OD-FX-03 | Customer chooses payment currency | Off unless pack + PSP |
| OD-FX-04 | Accounting currency grain | One per legal entity |
| OD-FX-05 | Rounding mode | Half-up to exponent unless PSP mandates |
| OD-FX-06 | Cross-currency wallet | No; one wallet currency per customer×country |

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country launch: payments, stored value, marketplace money flow, consumer refund rights, and advertising of payment for medicines. Do not treat this document as legal advice.
