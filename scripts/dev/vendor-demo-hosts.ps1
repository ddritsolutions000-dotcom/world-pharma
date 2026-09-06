# Adds vendor.demo.com -> 127.0.0.1 for local seller portal (run PowerShell as Administrator).
$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$entry = "127.0.0.1 vendor.demo.com"
$text = Get-Content $hostsPath -Raw
if ($text -match '(?m)^\s*127\.0\.0\.1\s+vendor\.demo\.com\s*$') {
  Write-Host "hosts entry already present: vendor.demo.com"
  exit 0
}
Add-Content -Path $hostsPath -Value "`n$entry"
Write-Host "Added: $entry"
Write-Host "Open http://vendor.demo.com:3004 after starting: pnpm --filter @world-pharma/web-vendor dev:demo"
