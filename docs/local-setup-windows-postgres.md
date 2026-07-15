# App DB trên Windows — PostgreSQL cài sẵn (không Docker)

Giống cách setup project **Sourcing** (`be/docs/auth-local-setup-windows-postgres.md`).

## Bước 1 — PostgreSQL đang chạy

- Cài PostgreSQL **16+** từ https://www.postgresql.org/download/windows/
- Cổng mặc định: **5432**
- Service **postgresql-x64-*** phải đang **Running**

Thêm `psql` vào PATH nếu cần:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql --version
```

Script `npm run setup:db:windows` **tự tìm** `psql` trong `C:\Program Files\PostgreSQL\*\bin`.

## Bước 2 — Tạo database

Từ thư mục `be`:

```powershell
cd be
npm run setup:db:windows
```

Nhập mật khẩu user **`postgres`** khi được hỏi.

**Hoặc thủ công (pgAdmin):** chạy [`scripts/setup-db-windows.sql`](../scripts/setup-db-windows.sql) rồi tạo DB:

```sql
CREATE DATABASE dashboard_local OWNER dashboard;
```

Kết quả:

- User: `dashboard` / password: `dashboard_dev`
- Database: `dashboard_local`
- Port: `5432`

## Bước 3 — `.env`

```env
DATABASE_URL=postgresql://dashboard:dashboard_dev@localhost:5432/dashboard_local
```

(Các biến Google OAuth, `AUTH_JWT_SECRET`, v.v. giữ như `.env.example`.)

## Bước 4 — Migrate

```powershell
npm run prisma:migrate:deploy
npm run seed:auth
```

## Bước 5 — Chạy

```powershell
# Terminal 1 — BE
npm run dev

# Terminal 2 — FE (từ repo root)
npm run dev
```

Google OAuth redirect URI: `http://localhost:3001/api/auth/google/callback`

## Sửa lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| `ECONNREFUSED` port 5434 | Đổi `DATABASE_URL` sang port **5432**, không dùng Docker |
| `password authentication failed` | Sai mật khẩu `postgres` hoặc chưa chạy `setup:db:windows` |
| `database "dashboard_local" does not exist` | Chạy lại `npm run setup:db:windows` |
| `Can't reach database server` | Services → PostgreSQL → Start |

## Docker (tùy chọn)

`docker-compose.yml` ở repo root chỉ dùng khi có Docker Desktop. Không bắt buộc nếu đã có Postgres Windows.
