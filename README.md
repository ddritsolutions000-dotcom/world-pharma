# World Pharma

Global Healthcare Super Platform.

**Blueprint (source of truth):** [docs/blueprint/00_MASTER_INDEX.md](docs/blueprint/00_MASTER_INDEX.md)

This repository currently has **Phase 0 Task 4**: identity kernel, empty Country Policy Pack, and a **dark partner/organization/KYC model** (no public Join).

## Local development

Prerequisites: Node.js 22, pnpm 10.15.1, Docker Desktop.

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm dev
```

Health check:

```bash
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

Identity (local OTP is printed as `dev_code` when `AUTH_DEV_REVEAL_OTP=true`):

```bash
curl -X POST http://localhost:4000/api/v1/auth/otp/request \
  -H "content-type: application/json" \
  -d "{\"identifier\":\"dev@example.com\",\"purpose\":\"REGISTER\"}"
```

See [docs/blueprint/40_IDENTITY_IMPLEMENTATION_NOTES.md](docs/blueprint/40_IDENTITY_IMPLEMENTATION_NOTES.md), [docs/blueprint/41_COUNTRY_POLICY_IMPLEMENTATION_NOTES.md](docs/blueprint/41_COUNTRY_POLICY_IMPLEMENTATION_NOTES.md), and [docs/blueprint/42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md](docs/blueprint/42_PARTNER_MODEL_IMPLEMENTATION_NOTES.md).

Quality:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not implement Country Policy Packs or domain features until the corresponding Phase 0 task is authorized.
