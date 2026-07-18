# Data Dashboard API Server

Express + Prisma/Postgres backend for GNG dashboard auth, Bean ingestion, and tab data API.

Located in `be/` — sibling to `fe/` (frontend).

**Không Docker:** PostgreSQL Windows port 5432 — [`docs/local-setup-windows-postgres.md`](docs/local-setup-windows-postgres.md).

## Setup

1. Tạo database (nhập mật khẩu `postgres`):
   ```bash
   npm run setup:db:windows
   ```

2. Copy env và fill secrets:
   ```bash
   cp .env.example .env
   ```
   Required: `DATABASE_URL`, `AUTH_JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BEAN_*`

3. Migrate & seed:
   ```bash
   npm install
   npm run prisma:migrate:deploy
   npm run seed:auth
   ```

4. Dev server (port 3001):
   ```bash
   npm run dev
   ```

Seed JSON fallback reads from `be/seed-data/` (override with `FE_PUBLIC_DATA_DIR`).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Express + ingest cron every 2h (Asia/Ho_Chi_Minh): today each run; yesterday also at 02:00 & 04:00 |
| `npm run bean:smoke` | Test Bean API (`SELECT 1`) |
| `npm run ingest:backfill` | Full historical backfill |
| `npm run ingest:daily` | Incremental since watermark |
| `npm run seed:auth` | Bootstrap admin on first login |

Force re-ingest a date window (ignore watermark):

```bash
BEAN_BACKFILL_RESUME=0 npm run ingest:backfill -- 2026-07-07 2026-07-10 hero.balance
```

## API

- `GET /health`
- `GET /api/auth/google` — OAuth login
- `GET /api/auth/me` — current user
- `GET /api/tabs` — allowed tabs
- `GET /api/tabs/:tabId` — tab data (DB facts or `seed-data/` fallback)
- `GET/PATCH /api/admin/users` — user management
- `GET /api/reports` — report history
- `GET /api/reports/:id` — report detail (HTML + payload)
- `POST /api/reports/hero-balance` — start Hero Balance daily/weekly AI report

## Create Report (AI)

Env required for generation: `OPENAI_API_KEY`, `OPENAI_BASE_URL=https://compass.llm.shopee.io/compass-api/v1`, `OPENAI_MODEL=gpt-5.4`, `CRAWLY_TOKEN`, optional `CRAWLY_GAME` / `CRAWLY_REGION` / `CRAWLY_BASE_URL`.
