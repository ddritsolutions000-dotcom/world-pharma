# Sprint 64 — Managed PITR restore drill (template)

Sprint 63 targets: **RPO ≤ 15m**, **RTO ≤ 4h** (`TARGET_DEFINED`).
Achievement remains **RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED** until a real managed restore is performed.

## Preconditions

- Managed Postgres with WAL/PITR **or** approved backup source identified
- Disposable restore target (never production)
- API build that matches backup schema era

## Steps

1. **Identify source** — PITR timestamp or backup artifact id (record name/id only; no secrets).
2. **Restore disposable target** — cloud console / vendor procedure (EXTERNAL).
3. **Verify schema** — `pnpm prisma:migrate:status` against disposable URL.
4. **Verify critical data** — counts for countries, orders sample, outbox pending (no PHI dumps).
5. **Application compatibility** — point a throwaway API at disposable DB; `GET /health/ready`.
6. **Integrity** — spot-check payment/order consistency; outbox occurrenceKey uniqueness.
7. **Record duration** — wall clock from disaster declare → ready.
8. **Record RPO/RTO result** — actual data-loss window vs 15m; restore time vs 4h.
9. **Failure/retry** — document failures; do not mark drill passed on partial restore.

## Local sandbox only (AVAILABLE NOW)

```bash
pnpm db:backup
pnpm db:restore   # disposable DB only
pnpm db:recovery-drill
```

These do **not** prove managed production PITR.

## Result classification

| Outcome | Status |
|---------|--------|
| No managed PITR in environment | `EXTERNAL_GATED` |
| Disposable restore succeeded | `RESTORE_DRILL_PASS` (infra still must be production-class) |
| Failed / incomplete | `NOT_VERIFIED` |

Do not simulate a successful managed restore.
