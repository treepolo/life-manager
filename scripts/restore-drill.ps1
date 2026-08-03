param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$wranglerConfigPath = Join-Path $workspacePath '.wrangler\xdg'
New-Item -ItemType Directory -Path $wranglerConfigPath -Force | Out-Null
$env:XDG_CONFIG_HOME = $wranglerConfigPath
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if (-not $resolvedBackup.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Restore drill accepts only backup files inside this workspace.'
}
$hashPath = "$resolvedBackup.sha256"
if (Test-Path -LiteralPath $hashPath) {
  $expectedHash = ((Get-Content -LiteralPath $hashPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw 'Backup SHA-256 mismatch. Restore drill stopped.' }
}
$drillRoot = Join-Path $workspacePath ('.tmp\restore-drill\' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $drillRoot -Force | Out-Null
$resolvedDrillRoot = (Resolve-Path -LiteralPath $drillRoot).Path
if (-not $resolvedDrillRoot.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Restore drill temporary path is outside this workspace.'
}
Push-Location $workspacePath
try {
  npx wrangler d1 execute LIFE_DB --local --persist-to $resolvedDrillRoot --file $resolvedBackup
  if ($LASTEXITCODE -ne 0) { throw "Wrangler D1 restore failed with exit code $LASTEXITCODE." }
  npx wrangler d1 execute LIFE_DB --local --persist-to $resolvedDrillRoot --command "SELECT key, value FROM schema_metadata ORDER BY key; SELECT (SELECT COUNT(*) FROM areas) AS areas, (SELECT COUNT(*) FROM task_definitions) AS task_definitions, (SELECT COUNT(*) FROM financial_transactions) AS financial_transactions, (SELECT COUNT(*) FROM metric_observations) AS metric_observations, (SELECT COUNT(*) FROM platform_posts) AS platform_posts, (SELECT COUNT(*) FROM deadline_items) AS deadline_items, (SELECT COUNT(*) FROM sync_change_log) AS sync_change_log;"
  if ($LASTEXITCODE -ne 0) { throw "Restored D1 verification query failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item -LiteralPath $resolvedDrillRoot -Recurse -Force
}
