# Start Kayan ERP dev server on port 3000
Set-Location "F:\KAYAN_ERP2026"
$env:PGLITE_BOOTSTRAP = "1"
$env:SESSION_SECRET = "dev-secret-key-for-testing"
npx tsx server.ts
