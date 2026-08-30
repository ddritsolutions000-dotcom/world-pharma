# Phase 0 Task 1 — repository foundation notes

**Node:** 22 LTS (`.nvmrc`). Chosen as current Node LTS at implementation time; not specified numerically in the blueprint.

**API port:** `4000` by default so local Next.js and common tools can keep `3000`.

**UUID v7:** not generated yet (no tables). Future Prisma models will use `String @id @db.Uuid` populated in the application with UUID v7.

**Money:** integer minor units (`BigInt` / `DECIMAL` never JS `number` for money).

**Country:** future rows carry `country_id`. RLS will be added with policies; do not `DISABLE ROW LEVEL SECURITY` at database role level.

**Audit:** future `audit_log` / transactional outbox; not in this task.

**Partner join:** not implemented. `join_public` remains a future pack flag defaulting false.
