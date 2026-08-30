# 41 — Country Policy Pack Implementation Notes

**Status:** Phase 0 Task 3 — implemented foundation  
**Canonical model:** [18](18_GLOBALIZATION.md), [20](20_DATABASE_ARCHITECTURE.md), [21](21_API_ARCHITECTURE.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

This note records what shipped. It does not replace the blueprint.

---

## Policy model

```
PartnerType (global catalog)
Country 1──N PolicyPack (versioned JSON)
```

- `PartnerType` is catalog only. It does **not** mean join is open.
- `Country` holds ISO codes, display names, technical defaults, and a pointer to the published pack.
- `PolicyPack` versions: `DRAFT` → `PUBLISHED` → `SUPERSEDED`. Published rows are not mutated; a new version is created.

Phase 0 seed country is **XX / XXX** — a technical placeholder (`TBD`). Not India, not US. Currency default is ISO **XXX** (no currency). Timezone is **UTC**. Phone prefix is null.

---

## Document shape

JSON evaluated at runtime (no country `if` in controllers):

- `identity` — phone/email flags (technical, not legal)
- `i18n` — default locale + locales
- `currency` / `timezone` / `datetime`
- `services.*` — all **false** in the empty pack
- `payments` — `enabled: false`, empty methods, empty `gateway_refs` (ids only; **no secrets**)
- `partner_types.{CODE}` — `enabled: false`, `join_public: false`
- `legal.review_required: true` — **LEGAL/COMPLIANCE REVIEW REQUIRED**

`join_public: true` is invalid while `enabled: false`. Payments cannot be enabled without `gateway_refs`.

---

## Resolver

`PolicyResolver.resolvePublished(isoAlpha2)`:

1. Redis cache `policy:published:{ISO}` (60s, versioned payload)
2. Else Postgres: `Country.status = ACTIVE` + latest `PUBLISHED` pack
3. Document must pass schema validation
4. Any miss → **null** (fail closed)

Helpers: `canUseService`, `canPartnerJoinPublic`, `isPartnerTypeEnabled`, `getCurrency`, `getLocales`.

Unknown service keys deny. Redis down → skip cache, load DB. DB miss → deny. Redis is not the source of truth.

---

## Versioning

- Create draft (`POST /api/v1/admin/policy-packs`) — JWT + `policy:publish`
- Publish — supersedes previous PUBLISHED, invalidates cache
- Retire — clears `published_policy_pack_id`
- Rollback — new draft from last SUPERSEDED, then publish

Public routes never return DRAFT packs.

---

## Seed

- All 11 partner type codes
- Country `XX` ACTIVE with empty published pack v1
- No live gateways, API keys, or legal document lists

---

## APIs

Public (safe subset):

- `GET /api/v1/countries`
- `GET /api/v1/countries/:code`
- `GET /api/v1/countries/:code/policy`
- `GET /api/v1/countries/:code/services`
- `GET /api/v1/countries/:code/partner-types`

Admin (JWT + permission): list/create/publish/retire/rollback.

---

## Security

- Unpublished packs are not on public GET
- Admin mutations require `policy:publish`
- Events: `COUNTRY_POLICY_*` via `security_events`
- RLS enabled on country tables (permissive policy until Task 4/country packs tighten it)

---

## Deferred

| Item | Why |
| --- | --- |
| Real ISO launch country | OD-COUNTRY-01 |
| Legal document lists / KYC | LEGAL/COMPLIANCE REVIEW REQUIRED |
| Payment secrets / PSP | Task later; pack holds refs only |
| Public Join APIs/UI | `join_public` remains false |
| FORCE RLS + `app.country_id` | Later |
| Partner/org dark model | **Task 4** |

**Next task:** Phase 0 Task 4 — Partner / Organization dark model. Do not start it from this note.
