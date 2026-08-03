$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$wranglerConfigPath = Join-Path $workspacePath '.wrangler\xdg'
New-Item -ItemType Directory -Path $wranglerConfigPath -Force | Out-Null
$env:XDG_CONFIG_HOME = $wranglerConfigPath
$backupPath = Join-Path $workspacePath 'backups'
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputPath = Join-Path $backupPath "life-manager-local-$stamp.sql"
Push-Location $workspacePath
try {
  npx wrangler d1 export LIFE_DB --local --output $outputPath
  if ($LASTEXITCODE -ne 0) { throw "Wrangler D1 export failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $outputPath)) { throw 'Wrangler did not create the backup file.' }
  $hash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $hashPath = "$outputPath.sha256"
  "$hash  $([IO.Path]::GetFileName($outputPath))" | Set-Content -LiteralPath $hashPath -Encoding ascii
  [pscustomobject]@{ backupPath = $outputPath; sha256Path = $hashPath; sha256 = $hash; byteLength = (Get-Item -LiteralPath $outputPath).Length } | ConvertTo-Json -Compress
} finally {
  Pop-Location
}
