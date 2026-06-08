param(
  [string]$EnvFile = "$PSScriptRoot\.env.production",
  [switch]$SkipDockerConfig
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)
  if (!(Test-Path $Path)) {
    throw "Env file not found: $Path"
  }

  $envMap = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $envMap[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
  }
  return $envMap
}

function Assert-StrongValue {
  param(
    [hashtable]$EnvMap,
    [string]$Key,
    [int]$MinLength = 16
  )

  $value = $EnvMap[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Key is required"
  }
  if ($value -match "change_me|replace_with|dev_|superadmin") {
    throw "$Key still looks like a placeholder"
  }
  if ($value.Length -lt $MinLength) {
    throw "$Key must be at least $MinLength characters"
  }
}

$envMap = Read-DotEnv $EnvFile

Assert-StrongValue $envMap "ADMIN_KEY" 24
Assert-StrongValue $envMap "COOKIE_SECRET" 24
Assert-StrongValue $envMap "APP_SECRET" 24
Assert-StrongValue $envMap "VENDURE_WEBHOOK_SECRET" 24
Assert-StrongValue $envMap "SUPERADMIN_PASSWORD" 16
Assert-StrongValue $envMap "VENDURE_DB_PASSWORD" 16
Assert-StrongValue $envMap "SVET_DB_PASSWORD" 16
Assert-StrongValue $envMap "POSTGRES_PASSWORD" 16
Assert-StrongValue $envMap "OPENSEARCH_INITIAL_ADMIN_PASSWORD" 16

if ($envMap["NODE_ENV"] -ne "production") {
  throw "NODE_ENV must be production"
}
if ($envMap["VENDURE_DB_SYNCHRONIZE"] -ne "false") {
  throw "VENDURE_DB_SYNCHRONIZE must be false for deploy"
}
if (!$envMap["SITE_ORIGIN"].StartsWith("https://")) {
  throw "SITE_ORIGIN must be https://..."
}
if (!$envMap["VENDURE_CORS_ORIGIN"].Contains("https://")) {
  throw "VENDURE_CORS_ORIGIN must contain https origins"
}
if ($envMap["SUPERADMIN_USERNAME"] -eq "superadmin" -and $envMap["SUPERADMIN_PASSWORD"] -eq "superadmin") {
  throw "Default superadmin credentials are forbidden"
}

if (!$SkipDockerConfig) {
  docker compose --env-file $EnvFile -f "$PSScriptRoot\docker-compose.yml" -f "$PSScriptRoot\docker-compose.deploy.yml" config --quiet
}

Write-Host "Deploy preflight passed for $EnvFile"
