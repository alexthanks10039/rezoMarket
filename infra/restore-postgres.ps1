param(
  [Parameter(Mandatory = $true)]
  [string]$InputFile
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $InputFile)) {
  throw "Backup file not found: $InputFile"
}

Get-Content $InputFile | docker exec -i rezomarket-postgres sh -c 'psql -U "$POSTGRES_USER"'

Write-Host "PostgreSQL restore completed from $InputFile"
