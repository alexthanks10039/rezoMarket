param(
  [string]$OutputDir = "$PSScriptRoot\backups"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path $OutputDir "postgres-$timestamp.sql"

docker exec rezomarket-postgres sh -c 'pg_dumpall -U "$POSTGRES_USER"' > $output

Write-Host "PostgreSQL backup written to $output"
