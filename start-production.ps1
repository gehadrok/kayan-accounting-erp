# KAYAN ERP 2026 — Production Launcher (Windows PowerShell)
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".\dist\index.html")) {
  Write-Host "Building production frontend bundle..." -ForegroundColor Cyan
  npm run build
}

$env:NODE_ENV = "production"
if (-not $env:PORT) { $env:PORT = "3000" }

if (-not $env:KAYAN_SESSION_SECRET) {
  $secretFile = ".\.kayan-session-secret"
  if (Test-Path $secretFile) {
    $env:KAYAN_SESSION_SECRET = (Get-Content $secretFile -Raw).Trim()
  } else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    Set-Content -Path $secretFile -Value $secret -NoNewline
    $env:KAYAN_SESSION_SECRET = $secret
    Write-Host "Generated persistent session secret in .kayan-session-secret" -ForegroundColor Yellow
  }
}

Write-Host "Starting KAYAN ERP 2026 in PRODUCTION mode on http://localhost:$($env:PORT)" -ForegroundColor Green
npx tsx server.ts
