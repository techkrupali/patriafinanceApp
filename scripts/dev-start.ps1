# Patriai dev environment starter
# Starts: PostgreSQL 17 -> Matrix Banking sandbox (:8000) -> Patriai Laravel API (:8001)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$php = "$env:LOCALAPPDATA\Programs\php84\php.exe"
$pg = "$env:LOCALAPPDATA\Programs\pgsql17"
$pgData = "$env:LOCALAPPDATA\Programs\pgdata17"

Write-Host "== PostgreSQL ==" -ForegroundColor Cyan
& "$pg\bin\pg_ctl.exe" -D $pgData status 2>$null
if ($LASTEXITCODE -ne 0) {
    & "$pg\bin\pg_ctl.exe" -D $pgData -l "$pgData\pg.log" -w start
    Write-Host "PostgreSQL started"
} else {
    Write-Host "PostgreSQL already running"
}

Write-Host "== Matrix Banking sandbox (:8000) ==" -ForegroundColor Cyan
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port 8000 already in use - skipping"
} else {
    Start-Process node -ArgumentList 'src/server.js' -WorkingDirectory "$root\backend" -WindowStyle Minimized
    Write-Host "Sandbox started"
}

Write-Host "== Patriai API (:8001) ==" -ForegroundColor Cyan
if (Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port 8001 already in use - skipping"
} else {
    Start-Process $php -ArgumentList 'artisan', 'serve', '--host=0.0.0.0', '--port=8001' -WorkingDirectory "$root\patriai-api" -WindowStyle Minimized
    Write-Host "Laravel API started"
}

Write-Host ""
Write-Host "Ready:" -ForegroundColor Green
Write-Host "  Banking sandbox : http://localhost:8000"
Write-Host "  Patriai API     : http://localhost:8001/api/v1"
Write-Host "  Admin panel     : cd admin  && npm run dev   (http://localhost:3000)"
Write-Host "  Mobile app      : cd mobile && npx expo start"
