# Object storage ops

## Current implementation

`LocalPrivateObjectStore` under `var/private-objects`, wrapped by `GatedPrivateObjectStore`.

- Paths are never public HTTP URLs.
- Retrieval requires application authorization **before** `objects.get` (e.g. KYC document read).
- Keys and prefixes reject path traversal (`..`, absolute paths).
- Missing objects raise `object_not_found` without leaking filesystem paths.
- Access tickets from `signAccess` are in-process only (lost on restart) — not public signed cloud URLs.
- Content-type is stored in a sidecar `.meta.json` next to the object bytes.
- When `OBJECT_STORAGE_ENVIRONMENT=production`, puts/gets fail closed (`NO_PRODUCTION_STORAGE_ADAPTER`). Local disk is never used as a silent production fallback.

## Private healthcare documents

Prescriptions, lab reports, imaging, licence evidence, KYC, and POD photos use the same private store. Object bytes are not stored in Postgres. Document contents must not appear in normal logs.

## Production migration requirements (EXTERNAL_GATED)

| Capability | Status |
|------------|--------|
| S3-compatible object storage | Required for production — not integrated |
| KMS / encryption at rest | Required — not integrated |
| Retention policies | Policy-dependent — not automated on local store |
| Legal hold | Required — not implemented |
| Backup of private objects | Required separately from SQL dumps |
| Malware scanning before trust | Production scanner adapter not registered |

Do not expose `var/private-objects` via static file servers.
