# 46 — Design System Implementation Notes

**Status:** Phase 0 Task 7 — implemented  
**Canonical:** [25](25_UI_UX_ARCHITECTURE.md), [26](26_DESIGN_SYSTEM_SPEC.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

Shared foundation for future customer, partner, admin, and clinical surfaces. **No product screens.**

The UI architecture filename in the Master Index is `25_UI_UX_ARCHITECTURE.md`. The design-system spec is `26_DESIGN_SYSTEM_SPEC.md`.

---

## Principles

Calm clinical trust. One semantic language across web and React Native. Screens consume **semantic tokens only**. Status is never color-only (icon + label). Honor `prefers-reduced-motion`. Do not treat interim hex as brand (**OD-DS-01** still open).

---

## Packages

| Path | Role |
| --- | --- |
| `packages/ui-kit` | Tokens + web primitives + RN primitives |
| `apps/ds-web` | Next.js playground only (`pnpm --filter @world-pharma/ds-web dev`) |

Web and native **share tokens and API names**, not DOM/Yoga implementations.

---

## Tokens

Layers: primitive (`colorRef`, `space`, `radius`, …) → semantic (`lightColor` / `darkColor`) → CSS variables / RN style objects.

Semantic color groups: `background`, `text`, `action`, `status`, `border`, `clinical` (rx / panic), `commerce` (COD), `trust`.

Spacing is 4px. Touch min **44px**. Breakpoints: 640 / 768 / 1024 / 1280 / 1536. Page max **1440** (OD-DS-08 placeholder). Typeface is **system UI** until OD-DS-06. Tabular figures for money and IDs.

Themes: `light` | `dark` | `system`. Dark is an interim second semantic set (OD-DS-02 still requires AA audit before product default).

---

## Components (foundation only)

Button, IconButton, Text, Heading, Display, Input, TextArea, Select, Checkbox, Radio, Switch, FormField, Label, HelperText, ErrorText, Badge, Chip, Avatar, Card, Divider, Tooltip, Popover, Dropdown, Modal, BottomSheet, Tabs, SegmentedControl, Toast, Alert, Banner, Skeleton, Spinner, Progress, Empty/Error/Loading/Network/Permission/Session states, Table, List, KeyValue, Stat, StatusDot, HeaderBar, Sidebar, BottomNav, Breadcrumbs.

Healthcare **visual** kinds on Badge/StatusDot: rx, verified, pending, unavailable, restricted, expired, urgent, confidential, panic, COD. No business logic.

**Not included:** MedicineCard, DoctorCard, LabTestCard, VendorCard, ProductCard, OrderCard, store/admin/join screens.

---

## Accessibility

- Visible focus (`--wp-color-border-focus`)
- Labels + `aria-invalid` + `aria-describedby` on fields
- Button loading sets `disabled` + `aria-busy` (blocks double submit)
- Modal: focus first control, Escape closes
- Toasts are polite and **not** for payment/clinical confirmation
- Reduced motion disables spinner/skeleton animation

---

## Performance

- CSS variables, no runtime CSS-in-JS
- Tree-shakeable module entrypoints (`/web`, `/native`, `/tokens`)
- Lucide icons imported by name
- Playground is a separate Next app so the API bundle stays free of UI
- List virtualization is **not** in the kit yet (use when product lists ship)

---

## Icons

One set: **Lucide**. OD-DS-04 remains open for a licensed medical set. Do not mix libraries.

---

## Security

Components do not log values. Password fields are native `type="password"`. No PHI storage. No auth bypass. Playground uses synthetic copy only.

---

## Visual QA checklist

See `packages/ui-kit/src/qa/checklist.ts`. Spacing, type, color, radius, elevation, icon size, focus, loading, errors, empty states — no raw hex in component files.

---

## Verification (this task)

- Token contrast tests (AA body + primary action)
- Web component tests (button loading, field error association, theme switch)
- Native TypeScript compile (RN types stubbed until a mobile app exists)
- Playground `next build` when dependencies are installed

---

## Deferred

- OD-DS-01 legal brand / logo
- OD-DS-02 dark as product default
- OD-DS-03 charts
- OD-DS-04 licensed icon pack
- OD-DS-06 licensed typeface
- Customer / admin Next **product** shells and RN app hello (P0 DoD shells) — **not** this task
- Storybook
- iOS/Android Metro runtime (types only here)

**Next:** Phase 0 Task 8 — CI/CD + production-readiness foundation. Not started.
