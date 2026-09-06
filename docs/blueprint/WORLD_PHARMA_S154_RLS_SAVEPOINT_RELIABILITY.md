# WORLD_PHARMA S154 — RLS Savepoint Reliability (LAB / IMAGING Lists)

**Sprint:** 154  
**Master backlog:** #451  
**Status:** SOFTWARE COMPLETE (reliability fix)  
**CAN_PRODUCTION_LAUNCH:** NO

## Observed failure (S153)

Intermittent **HTTP 500** on customer:

- `GET /api/v1/me/lab/bookings`
- `GET /api/v1/me/imaging/bookings`

PostgreSQL / Prisma error:

```text
Raw query failed. Code: `3B001`.
Message: ERROR: savepoint "rls_ctx_…" does not exist
```

## Affected endpoints

| Endpoint | Handler | Present path |
| --- | --- | --- |
| `GET /api/v1/me/lab/bookings` | `LabBookingService.listCustomerBookings` | `Promise.all(presentCustomer)` → nested `runWithTenant(worker…)` for org display name |
| `GET /api/v1/me/imaging/bookings` | `ImagingBookingService.listCustomerBookings` | same pattern (+ nested location lookup) |

Request path:

customer → controller → service `findMany` (request tenant tx) → `presentCustomer` × N → nested `runWithTenant(workerTenantContext)` → `SAVEPOINT rls_ctx_*` on **same** interactive transaction → response.

Outer transaction is established by `TenantContextInterceptor` → `PrismaService.runWithTenant`.

## Root cause

**Application bug** (not external infrastructure).

PostgreSQL savepoints are a **stack** on a single connection. Nested `runWithTenant` (when ALS already has a request transaction) does:

1. `SAVEPOINT rls_ctx_*`
2. apply tenant GUCs
3. work
4. `RELEASE SAVEPOINT` / on error `ROLLBACK TO SAVEPOINT`

`listCustomerBookings` used `Promise.all(rows.map(presentCustomer))`, so **multiple nested SAVEPOINT sections ran concurrently on the same transaction client**.

Race example:

1. A: `SAVEPOINT a`
2. B: `SAVEPOINT b` (after `a`)
3. A: `RELEASE a` → also destroys `b`
4. B: `RELEASE b` / `ROLLBACK TO b` → **3B001 savepoint does not exist**

Intermittent because it depends on booking count (>1 worsens it), imaging dual nested lookups, and scheduling of concurrent promises. Empty/`data` missing on 500 responses looked like “empty list” in probes.

Connection pool reuse / stale GUC was **not** the primary cause; the failure is concurrent savepoint lifecycle on one interactive tx.

## Exact fix

1. **`withTenantNestLock`** on `TenantStore` — serializes nested SAVEPOINT sections per request transaction (`tenant-als.ts` + `runWithTenant` + nested `$transaction` proxy).
2. **Safe `ROLLBACK TO SAVEPOINT`** when the savepoint is already gone (defense in depth; does not mask success paths).
3. **Sequential `presentCustomer`** in lab/imaging `listCustomerBookings` (stops concurrent nested worker switches on the list hot path).

RLS is **not** disabled. Worker nested context still uses GUCs + `SET LOCAL ROLE worldpharma_app`. No unrestricted queries. No public endpoints.

## Security implications

| Property | Status |
| --- | --- |
| Customer ownership filters | Preserved (`customerPersonId`) |
| Tenant GUCs / RLS policies | Preserved |
| Nested worker elevation for org display names | Preserved, now serialized |
| Cross-customer visibility | Still denied (app filter + RLS) |
| Unauthorized list | Still 401 |

## Tests

`apps/api/src/app/s154-rls-savepoint-reliability.spec.ts`:

- nest lock serialization
- concurrent nested `runWithTenant` (24-way) without 3B001
- nested failure does not poison subsequent nested/outer queries
- actorKind/personId restored after nested worker section

Regression: `rls.tenancy`, `s136-lab`, `s139-imaging` (passed).

## Runtime results

`npx tsx scripts/s154-rls-list-hammer.ts` after API restart with fix:

| Probe | Result |
| --- | --- |
| LAB sequential ×50 | **50/50 HTTP 200**, fail 0 |
| IMAGING sequential ×50 | **50/50 HTTP 200**, fail 0 |
| LAB concurrent ×8 | **8/8 HTTP 200** |
| IMAGING concurrent ×8 | **8/8 HTTP 200** |
| Unauth list | **401** |
| Fixture customer lists | lab_rows=2, imaging_rows=2 (owned data present) |
| TOTAL_FAIL | **0** |

## Browser results

`AUTHENTICATED_BROWSER_CLICKTHROUGH = NOT_COMPLETED` unless an OTP UI session was fully click-through validated in this sprint.

## Remaining limitations

- Other call sites may still use `Promise.all` around nested `runWithTenant`; the nest mutex makes them safe, but sequential presentation remains preferred for clarity.
- Invalid UUID path params may still 500 (pre-existing Prisma UUID parse) — out of S154 scope.
- HL7/FHIR and live provider activations remain EXTERNAL_GATED.
- **`CAN_PRODUCTION_LAUNCH = NO`**

## Intentionally not done

- No RLS architecture rebuild
- No authorization weakening / RLS bypass
- No HL7/FHIR
- No lab/imaging engine rebuild
- No arbitrary retry masking of 3B001
