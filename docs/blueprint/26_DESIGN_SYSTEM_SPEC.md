# 26 — Design System Spec

**Status:** Blueprint (specification for a **future** design system)  
**Audience:** Design, frontend, mobile, accessibility, brand  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [UI/UX architecture](25_UI_UX_ARCHITECTURE.md) · [Globalization](18_GLOBALIZATION.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md)

This is **not** an implementation, not a component library, and **not** a finished brand. It defines **token architecture**, semantic names, component **roles**, and accessibility so `packages/ui-kit` can be built later ([04](04_APPLICATION_ARCHITECTURE.md)).

**Do not invent a full color palette as final brand.**  
**OPEN DECISION (OD-DS-01): Brand identity** (logo, brand hues, illustration, voice). Until then, use **placeholder semantic tokens** below. Engineering may map them to a neutral interim theme; product must not treat interim hex as brand.

No UI code, CSS, or React/RN components in this document.

---

## 1. Goals

| Goal | Meaning |
| --- | --- |
| Shared web + mobile | One token set and component **semantics**; platform **conventions** (Material 3 / Apple HIG) for navigation, gestures, typography metrics |
| Healthcare trust | Calm surfaces, readable density, obvious clinical vs commerce |
| Config over screenshot | Country/language/currency/RTL from pack, not per-screen hex |
| AA by default | Target **WCAG 2.2 Level AA** |
| Role density | Consumer comfortable; admin/pharmacy **compact** density mode |

**OPEN DECISION (OD-DS-07):** Density modes. Recommendation: `comfortable` (customer), `compact` (admin, pharmacy web, lab portal).

---

## 2. Token architecture

Three layers. Screens consume **semantic** tokens only. Never raw hex per screen.

```
Brand / primitive (OD-DS-01)     →  Semantic (this spec)  →  Component roles
e.g. palette.blue.600 (later)        color.fg.danger           button.primary
                                     color.status.rx
```

| Layer | Who changes it | Example |
| --- | --- | --- |
| Primitive | Brand (later) | `ref.color.neutral.100`, `ref.space.4` |
| Semantic | Product + a11y | `color.surface.canvas`, `color.fg.muted`, `color.border.focus` |
| Component | DS maintainers | `button.primary.bg` → semantic `color.action.primary` |

**ASSUMPTION (A-DS-01):** Tokens are published as JSON/Style Dictionary-style names shared by Next.js and React Native. Platform adapters map elevation and type **metrics** to HIG/Material.

**OPEN DECISION (OD-DS-02):** Dark mode as a second semantic set (`color.surface.canvas` dark). Do not ship until contrast is audited for panic/Rx/COD.

**OPEN DECISION (OD-DS-06):** Typeface licensing. Placeholder: system UI stack (SF, Roboto, Segoe) until licensed webfonts. Clinical tabular numbers: `font.family.tabular` (system mono or tabular-nums).

---

## 3. Color (semantic, placeholder)

Replace `ref.*` when OD-DS-01 closes. Contrast: text vs surface ≥ **4.5:1** (AA); large text ≥ 3:1; UI components/graphics ≥ 3:1 (WCAG 2.2).

### 3.1 Surfaces and text

| Token | Role |
| --- | --- |
| `color.surface.canvas` | App background |
| `color.surface.raised` | Cards, sheets |
| `color.surface.sunken` | Inset wells, code/accession |
| `color.surface.overlay` | Modal scrim |
| `color.fg.default` | Primary text |
| `color.fg.muted` | Secondary |
| `color.fg.inverse` | On primary action / inverse surfaces |
| `color.fg.disabled` | Disabled; not the only disabled cue |
| `color.border.default` | Hairline |
| `color.border.focus` | Focus ring (3:1 against adjacent) |
| `color.action.primary` | Primary buttons, key links |
| `color.action.secondary` | Secondary |
| `color.action.tertiary` | Ghost / text buttons |
| `color.link.default` | Links; not the only affordance |

### 3.2 Status (not random per screen)

| Token | Role | Healthcare note |
| --- | --- | --- |
| `color.status.success` | Success, delivered, verified | Not for clinical “normal” lab range |
| `color.status.warning` | Warning, delay, substitution | |
| `color.status.danger` | Error, reject, identity mismatch | |
| `color.status.info` | Informational | |
| `color.status.neutral` | Neutral chip | |

### 3.3 Healthcare-specific semantics

| Token | Role | Rules |
| --- | --- | --- |
| `color.trust.verified` | License verified, accredited badge | Not a ranking “best doctor” |
| `color.clinical.rx` | Rx required / Rx warning | **Must not** equal promo or success. Distinct shape + text, not color-only |
| `color.clinical.rx.fg` / `.bg` | On-badge contrast AA | |
| `color.clinical.panic` | Panic / critical lab | **Must not** equal generic danger toast. Persistent, high urgency. Never promotional |
| `color.clinical.controlled` | Controlled medicine (if pack shows) | LEGAL copy; not decorative |
| `color.commerce.cod` | COD amount | High prominence at checkout and rider collect |
| `color.consent.emphasis` | Consent screens primary actions | Accept/revoke equally visible; no “trick” contrast |

Placeholder mapping until brand: neutrals for canvas/fg; a **single** reserved hue for action; **separate** hues for `rx`, `panic`, `cod` so they cannot collapse. Exact hex is **not** brand.

**RISK:** Using red for both form error and panic. Panic needs **icon + label + placement** (banner), not color alone.

---

## 4. Typography

| Token | Role | Notes |
| --- | --- | --- |
| `font.family.ui` | UI | System until OD-DS-06 |
| `font.family.tabular` | Accession, money, OTP, sample ids | Tabular lining figures |
| `font.size.display` | Rare marketing/home | |
| `font.size.title.lg` / `.md` / `.sm` | Screen titles | |
| `font.size.body.lg` / `.md` / `.sm` | Body | Body.sm ≥ 14px equivalent on mobile |
| `font.size.label` | Form labels, badges | |
| `font.size.caption` | Helper, legal footnotes | Caption not the only legal text |
| `font.weight.regular` / `.medium` / `.semibold` | | Avoid ultra-light on clinical |
| `font.line.tight` / `.normal` / `.relaxed` | | Body ≥ 1.4 |

Money: never use proportional figures for amounts. Currency from pack; **do not** hardcode symbol position.

RTL: mirroring of nav and chevrons; accession/IDs do not reverse character order.

---

## 5. Spacing, grid, breakpoints, radius, elevation

### 5.1 Spacing

Base **4**. Scale: `space.0, 1(4), 2(8), 3(12), 4(16), 5(24), 6(32), 8(48), 10(64)`.

Screen padding: mobile `space.4`; tablet+ `space.6`. Compact density: `space.3` gutters.

### 5.2 Grid

| Context | Columns | Gutter |
| --- | --- | --- |
| Mobile | 4 | `space.4` |
| Tablet | 8 | `space.4` |
| Desktop | 12 | `space.4` |
| Admin wide | 12, max content width **OPEN DECISION (OD-DS-08)** e.g. 1280–1440 |

### 5.3 Breakpoints (placeholder)

**OPEN DECISION (OD-DS-09)** exact values. Placeholder:

| Token | Min width |
| --- | --- |
| `bp.sm` | 640 |
| `bp.md` | 768 |
| `bp.lg` | 1024 |
| `bp.xl` | 1280 |
| `bp.2xl` | 1536 |

RN: use window size + tablet flag; do not pretend desktop nav on a phone.

### 5.4 Radius

| Token | Use |
| --- | --- |
| `radius.none` | Tables, admin dense |
| `radius.sm` | Inputs, chips |
| `radius.md` | Cards, buttons |
| `radius.lg` | Sheets, modals |
| `radius.full` | Avatars, OTP pips |

### 5.5 Shadows / elevation

| Token | Use |
| --- | --- |
| `elev.0` | Flat (admin tables) |
| `elev.1` | Cards |
| `elev.2` | Dropdowns |
| `elev.3` | Modals, FAB (if used) |

Material/HIG: map `elev.*` to platform shadow/tonal elevation. Prefer **border + elev.1** over heavy shadow (trust, not retail flash).

---

## 6. Motion

| Token | Role |
| --- | --- |
| `motion.duration.fast` / `.base` / `.slow` | |
| `motion.easing.standard` | |
| `motion.reduce` | Honor `prefers-reduced-motion` / OS setting |

**OPEN DECISION (OD-DS-05):** Motion defaults. Recommendation: **subtle**; no confetti on report ready; no looping on panic.

---

## 7. Component roles (spec, not widgets)

Each role lists purpose, states, a11y. Implementation chooses RN/Material/HIG primitives that **match the role**.

### 7.1 Buttons

| Role | Use |
| --- | --- |
| `button.primary` | One primary per view |
| `button.secondary` | Alternative |
| `button.tertiary` | Low emphasis |
| `button.danger` | Destructive (cancel order, revoke consent) — confirm |
| `button.cod` | COD confirm collect (rider) — uses `color.commerce.cod` |

States: default, hover (web), pressed, disabled, loading (spinner **and** disabled + `aria-busy`). Min height **44×44** css px equivalent (WCAG 2.2 target size). Icon-only: accessible name.

Consent: primary “Agree” and secondary “Not now / Revoke” **equal discoverability**.

### 7.2 Inputs

Text, textarea, select, combobox, date/time, money, OTP, phone (E.164 display), scan-affordance.

States: empty, filled, focus, error, disabled, read-only (accession). Error: text + `aria-invalid` + `aria-describedby`, not color-only.

OTP: one field or segmented; numeric; autocomplete `one-time-code` where platform supports.

### 7.3 Forms

Layout: label above input (RTL mirrored). Helper vs error. Required indicator not color-only. Grouping: fieldset legends (address, KYC). Inline validation after blur, not on each keystroke for OTP.

Money: integer minor units in API; display formatted by pack.

### 7.4 Cards

`card.commerce` (PDP/offer), `card.job` (queue), `card.clinical` (report summary **without** analytes on lock screen widgets — **no** widgets with results). Elevation `elev.1`. Rx badge slot uses `color.clinical.rx`.

### 7.5 Tables (web / admin)

Sticky header, row hover, sortable columns **with** sort `aria-sort`. Numeric columns tabular + right aligned. Compact density. Empty: table empty state, not a card. Horizontal scroll with caption. Do not put raw PHI in CSV export without permission.

### 7.6 Modals / sheets

Modal: trap focus, ESC, restore focus, labelled title. Sheets (mobile): drag handle + close. **Panic and identity mismatch are not dismiss-only toasts** — use modal/sheet or dedicated full screen.

### 7.7 Navigation

| Platform | Convention |
| --- | --- |
| Customer RN | Bottom tabs (OD-UX-03) + stack |
| Field RN | Bottom tabs + job full-screen |
| Customer web | Top nav + search |
| Portals / admin | Side nav + top bar (org/country switcher) |

HIG: large titles optional on customer; **not** on pharmacy pack list. Material: nav bar, not a custom unique tab metaphor.

Active nav: not color-only (icon + label + selected state).

### 7.8 Status badges

| Badge | Token |
| --- | --- |
| Success / delivered | `color.status.success` |
| Pending / SLA | `color.status.warning` |
| Failed / rejected | `color.status.danger` |
| Rx | `color.clinical.rx` |
| Panic | `color.clinical.panic` |
| COD | `color.commerce.cod` |
| Verified | `color.trust.verified` |

Always include **text**. Icon optional.

### 7.9 Alerts (inline)

Page-level banners: info/warning/danger/success/clinical. Panic banner **non-dismissible** until acknowledged in role workflow (pathologist/ops). Customer report-ready: info, not panic.

### 7.10 Toasts

Transient, non-critical (copied id, “saved”). Timeout + pause on hover/focus. **Forbidden as sole channel** for: payment failure, identity mismatch, panic, consent, COD shortage.

### 7.11 Charts

Admin/ops/finance/vendor dashboards. **OPEN DECISION (OD-DS-03):** chart library. Spec regardless of library:

- Color-blind-safe series (not panic red vs success green as only two series)
- Tooltip + table alternative
- No PHI in chart titles
- Empty: empty state, not a flat line of zeros that looks like data

### 7.12 Empty states

Illustration **optional** (brand OD-DS-01). Required: title, explanation, one primary CTA ([25](25_UI_UX_ARCHITECTURE.md)). Do not use cute copy that implies clinical advice.

### 7.13 Skeletons

Match layout geometry. Shimmer **respects reduced motion** (static placeholder). No skeleton that looks like a real price (avoid layout shift on money).

---

## 8. Icons and illustration

**OPEN DECISION (OD-DS-04):** Icon set (e.g. a single licensed set). Rules: one set; 24px default; 2px optical; medical icons **not** decorative crosses on commerce. Panic: dedicated icon. Rx: distinct from “document.”

---

## 9. Accessibility (WCAG 2.2 AA target)

| Topic | Spec |
| --- | --- |
| Contrast | §3 |
| Target size | 24×24 CSS px minimum (2.2); **prefer 44×44** for primary clinical/pay/OTP |
| Focus | Visible `color.border.focus`; never `outline: none` without replacement |
| Keyboard | All web actions reachable; no keyboard trap except modal |
| Screen readers | Roles, names, live regions for queue SLA and waiting room |
| Captions | Video consult: platform captions if pack; recording off by default |
| Language | `lang` on web; RN per locale |
| Zoom | Web 200% without loss of function |
| Motion | §6 |
| Forms | Labels; errors associated |
| Status | Not color-only (Rx, panic, COD, success) |
| Authentication | OTP usable with paste and password managers |

**RISK:** Custom consult UI that breaks VoiceOver/TalkBack. Use platform video chrome where possible; our chrome must still name buttons.

Healthcare literacy: short sentences; avoid Latin-only drug names without generic when pack has both.

---

## 10. Platform mapping

| Concern | Web (Next) | React Native |
| --- | --- | --- |
| Nav | App header / sidebar | OS tabs / stacks |
| Typography | CSS tokens | RN text variants mapped to same semantic sizes |
| Input | Native + PSP drop-in | OS keyboard types |
| Date/time | Pack timezone | Same |
| Haptics | N/A | Success/error on OTP/POD **subtle**; none on panic (avoid alarm haptics unless pack safety) |
| Safe area | N/A | Required |
| Dark | OD-DS-02 | Follow OS when enabled |

Do not fork a “Material app” and a “Fluent admin” with different **semantics**. Admin may be denser but same tokens.

---

## 11. Healthcare-specific screens (spec)

### 10.1 Trust

Show: license/accreditation **only after** compliance publish; secure checkout indicators; “verified pharmacist review” as process, not a medical claim.

### 10.2 Rx warning

Placement: cart line, PDP, checkout. Pattern: badge + one sentence + CTA (upload/attach). Cannot be a seasonal promo color.

### 10.3 Panic values

Pathologist/lab: banner + worklist sort. Customer: generic “needs attention” unless legal pack requires more. **Never** toast-only. Never SMS values ([23](23_NOTIFICATION_ARCHITECTURE.md)).

### 10.4 COD

Checkout: method tile + **amount due on delivery** in tabular figures. Rider: collect screen with amount, tender, shortage. Receipt.

### 10.5 Consent

Full screen or modal: who, purpose, artifacts, expiry, withdraw how. Primary/secondary equal. Logs of grant/revoke are not shown as marketing checkboxes.

### 10.6 Identity mismatch (phlebotomist)

Full stop pattern: no collect controls, danger + explanation, job fail reason. Not a snackbar.

---

## 12. i18n, RTL, currency

- All copy via keys; no concatenated sentences that break grammar.
- Pseudo-loc in QA.
- Currency and date from country pack.
- Address forms: pack field order ([05](05_CUSTOMER_PLATFORM.md)).

---

## 13. What this spec does not do

- Pick final brand colors or mascots (OD-DS-01)
- Implement Storybook
- Override HIG/Material navigation with a unique tab bar just for “healthcare feel”
- Encode clinical decision colors for “high/low lab bars” as medical advice — reference ranges are **data**, displayed with accessible tables, not traffic-light diagnoses

---

## 14. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| **OD-DS-01** | Brand identity | Placeholder semantics until brand |
| **OD-DS-02** | Dark mode | After AA audit |
| **OD-DS-03** | Chart library | Accessible series + table alt |
| **OD-DS-04** | Icon set | One licensed set |
| **OD-DS-05** | Motion | Subtle; reduced-motion first |
| **OD-DS-06** | Typeface licensing | System UI until licensed |
| **OD-DS-07** | Density modes | comfortable vs compact |
| **OD-DS-08** | Admin max width | 1280–1440 |
| **OD-DS-09** | Exact breakpoints | Placeholder §5.3 |

---

## 15. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-DS-01 | ASSUMPTION | Shared token JSON for web + RN |
| | RISK | Color-only Rx/panic/COD |
| | RISK | Toast-only clinical failure |
| | RISK | Interim hex becoming “the brand” |
| | LEGAL | Accreditation marks, medicine promo styling, consent dark patterns |

Build `packages/ui-kit` only after OD-DS-01 direction or an explicit **interim theme** decision. Screen IA: [25](25_UI_UX_ARCHITECTURE.md).
