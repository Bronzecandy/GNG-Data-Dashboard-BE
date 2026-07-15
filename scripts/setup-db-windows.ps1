# Tao DB local tren PostgreSQL Windows (khong Docker).
# Chay tu thu muc be: npm run setup:db:windows

param(
  [string]$PostgresUser = "postgres",
  [string]$DbHost = "localhost",
  [int]$Port = 5432
)

$ErrorActionPreference = "Stop"
$sqlRole = Join-Path $PSScriptRoot "setup-db-windows.sql"

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $roots = @(
    ${env:ProgramFiles},
    ${env:ProgramFiles(x86)}
  ) | Where-Object { $_ }

  foreach ($root in $roots) {
    $pgRoot = Join-Path $root "PostgreSQL"
    if (-not (Test-Path $pgRoot)) { continue }
    $bins = @(Get-ChildItem -Path $pgRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
      Where-Object { Test-Path $_ })
    if ($bins.Count -gt 0) { return $bins[0] }
  }
  return $null
}

$psqlRaw = Find-Psql
if (-not $psqlRaw) {
  Write-Host "Khong tim thay psql." -ForegroundColor Yellow
  Write-Host "PostgreSQL thuong o:" -ForegroundColor Yellow
  Write-Host "  C:\Program Files\PostgreSQL\18\bin" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Them thu muc bin vao PATH, mo PowerShell moi, hoac chay:" -ForegroundColor Yellow
  Write-Host '  $env:Path += ";C:\Program Files\PostgreSQL\18\bin"' -ForegroundColor White
  Write-Host "Chi tiet: docs/local-setup-windows-postgres.md" -ForegroundColor Yellow
  exit 1
}

Write-Host "Dung psql: $psqlRaw" -ForegroundColor DarkGray

Write-Host "Nhap mat khau PostgreSQL superuser ($PostgresUser)..." -ForegroundColor Cyan
$secure = Read-Host "Password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
$env:PGPASSWORD = $plain

function Invoke-Psql {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & "$psqlRaw" @Args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Tao role dashboard..." -ForegroundColor Cyan
Invoke-Psql -f $sqlRole -h $DbHost -p $Port -U $PostgresUser
Invoke-Psql -c "ALTER ROLE dashboard CREATEDB" -h $DbHost -p $Port -U $PostgresUser

Write-Host "Kiem tra database dashboard_local..." -ForegroundColor Cyan
$existsOut = & "$psqlRaw" -h $DbHost -p $Port -U $PostgresUser -tAc "SELECT 1 FROM pg_database WHERE datname='dashboard_local'" 2>&1
$existsCode = $LASTEXITCODE
$existsStr = if ($null -eq $existsOut) { "" } else { ("$existsOut").Trim() }

if ($existsCode -ne 0) {
  Write-Host "Loi khi kiem tra database (exit $existsCode):" -ForegroundColor Red
  Write-Host $existsOut -ForegroundColor Red
  exit $existsCode
}

if ($existsStr -ne "1") {
  Write-Host "Tao database dashboard_local..." -ForegroundColor Cyan
  Invoke-Psql -c "CREATE DATABASE dashboard_local OWNER dashboard" -h $DbHost -p $Port -U $PostgresUser
} else {
  Write-Host "Database dashboard_local da ton tai, bo qua." -ForegroundColor Yellow
}

Write-Host "Cap quyen schema..." -ForegroundColor Cyan
Invoke-Psql -d dashboard_local -c "GRANT ALL ON SCHEMA public TO dashboard; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dashboard; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dashboard;" -h $DbHost -p $Port -U $PostgresUser

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "OK. DATABASE_URL trong .env (port $Port):" -ForegroundColor Green
Write-Host "  postgresql://dashboard:dashboard_dev@localhost:$Port/dashboard_local" -ForegroundColor White
Write-Host "Tiep theo:" -ForegroundColor Cyan
Write-Host "  npm run prisma:migrate:deploy" -ForegroundColor White
Write-Host "  npm run seed:auth" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
