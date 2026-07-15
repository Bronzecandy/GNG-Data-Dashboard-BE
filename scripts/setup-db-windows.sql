-- Chay bang superuser postgres: psql -U postgres -f scripts/setup-db-windows.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dashboard') THEN
    CREATE ROLE dashboard WITH LOGIN PASSWORD 'dashboard_dev' CREATEDB;
  ELSE
    ALTER ROLE dashboard WITH PASSWORD 'dashboard_dev' CREATEDB;
  END IF;
END
$$;
