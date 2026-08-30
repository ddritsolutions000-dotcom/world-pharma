# @world-pharma/shared

Shared TypeScript types for the modular monolith.

Task 1: no domain models. Future entities will use:

- UUID v7 primary keys
- money as integer minor units + ISO 4217 currency
- `country_id` on tenant-scoped rows
- RLS enabled (never globally disabled)
- audit via append-only logs
