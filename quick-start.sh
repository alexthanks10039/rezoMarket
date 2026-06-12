#!/usr/bin/env bash
set -Eeuo pipefail

# rezoMarket / "Мир Сальников" bootstrap script.
#
# Local dev:
#   ./quick-start.sh
#
# Server/prod-like:
#   ./quick-start.sh --mode server --env-file infra/.env.production --with-deploy-override
#
# Useful flags:
#   --skip-build       Do not pass --build to docker compose up.
#   --skip-seed        Do not import Vendure seed catalog.
#   --skip-sync        Do not run OpenSearch product sync.
#   --tools            Enable compose profile "tools" such as OpenSearch Dashboards.
#   --pull             Pull images before starting.
#   --status           Print current compose service status and exit.
#   --logs             Follow compose logs after startup.
#   --down             Stop stack without deleting volumes.
#   --reset-volumes    Stop stack and delete volumes. Requires --yes.
#   --yes              Allow destructive/confirmation-gated actions.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="local"
ENV_FILE=""
WITH_DEPLOY_OVERRIDE=0
WITH_TOOLS=0
SKIP_BUILD=0
SKIP_SEED=0
SKIP_SYNC=0
PULL_IMAGES=0
SHOW_LOGS=0
STATUS_ONLY=0
DOWN_ONLY=0
RESET_VOLUMES=0
ASSUME_YES=0
HEALTH_TIMEOUT=180
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rezomarket-svet}"

usage() {
  cat <<'EOF'
Usage:
  ./quick-start.sh [options]

Modes:
  --mode local                  Local Docker dev stack. Default.
  --mode server                 Server/prod-like stack checks.

Env:
  --env-file PATH               Env file to use. Defaults:
                               local  -> infra/.env
                               server -> infra/.env.production
  --with-deploy-override        Add infra/docker-compose.deploy.yml.

Actions:
  --skip-build                  Start without rebuilding images.
  --skip-seed                   Skip Vendure seed import.
  --skip-sync                   Skip OpenSearch sync.
  --tools                       Enable compose profile "tools".
  --pull                        Pull images before up.
  --status                      Show docker compose ps and exit.
  --logs                        Follow logs after startup.
  --down                        Stop containers, keep volumes.
  --reset-volumes               Stop containers and delete volumes. Requires --yes.
  --yes                         Allow destructive/confirmation-gated actions.

Tuning:
  --health-timeout SECONDS      Default: 180.
  -h, --help                    Show this help.

Examples:
  ./quick-start.sh
  ./quick-start.sh --tools
  ./quick-start.sh --skip-build --skip-seed
  ./quick-start.sh --mode server --env-file infra/.env.production --with-deploy-override
  ./quick-start.sh --down
EOF
}

log() {
  printf '\033[1;34m==>\033[0m %s\n' "$*"
}

ok() {
  printf '\033[1;32mOK\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33mWARN\033[0m %s\n' "$*" >&2
}

fail() {
  printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2
  exit 1
}

on_error() {
  local line="$1"
  local compose_hint="${COMPOSE_ARGS[*]-}"
  if [[ -n "$compose_hint" ]]; then
    fail "Bootstrap failed near line ${line}. Run: docker compose ${compose_hint} logs --tail=120"
  fi
  fail "Bootstrap failed near line ${line}"
}
trap 'on_error $LINENO' ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      shift
      ;;
    --with-deploy-override)
      WITH_DEPLOY_OVERRIDE=1
      shift
      ;;
    --tools)
      WITH_TOOLS=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-seed)
      SKIP_SEED=1
      shift
      ;;
    --skip-sync)
      SKIP_SYNC=1
      shift
      ;;
    --pull)
      PULL_IMAGES=1
      shift
      ;;
    --logs)
      SHOW_LOGS=1
      shift
      ;;
    --status)
      STATUS_ONLY=1
      shift
      ;;
    --down)
      DOWN_ONLY=1
      shift
      ;;
    --reset-volumes)
      RESET_VOLUMES=1
      shift
      ;;
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    --health-timeout)
      HEALTH_TIMEOUT="${2:-}"
      shift 2
      ;;
    --health-timeout=*)
      HEALTH_TIMEOUT="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "server" ]] || fail "--mode must be local or server"
[[ "$HEALTH_TIMEOUT" =~ ^[0-9]+$ ]] || fail "--health-timeout must be a positive number"

if [[ -z "$ENV_FILE" ]]; then
  if [[ "$MODE" == "server" ]]; then
    ENV_FILE="infra/.env.production"
  else
    ENV_FILE="infra/.env"
  fi
fi

TEMPLATE_FILE="infra/.env.example"
if [[ "$MODE" == "server" ]]; then
  TEMPLATE_FILE="infra/.env.production.example"
  WITH_DEPLOY_OVERRIDE=1
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but was not found in PATH"
}

dotenv_get() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  awk -F= -v k="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == k {
      sub(/^[^=]*=/, "", $0)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      gsub(/^"|"$/, "", $0)
      gsub(/^'\''|'\''$/, "", $0)
      print $0
      exit
    }
  ' "$ENV_FILE"
}

assert_strong_env() {
  local key="$1"
  local min_length="$2"
  local value
  value="$(dotenv_get "$key")"
  [[ -n "$value" ]] || fail "$key is required in $ENV_FILE"
  if [[ "$value" =~ change_me|replace_with|dev_|superadmin ]]; then
    fail "$key still looks like a placeholder in $ENV_FILE"
  fi
  if (( ${#value} < min_length )); then
    fail "$key must be at least ${min_length} characters"
  fi
}

require_command docker
require_command curl
require_command awk
require_command date
require_command grep
require_command mktemp
require_command sed

docker compose version >/dev/null 2>&1 || fail "docker compose is not available"

if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f "$TEMPLATE_FILE" ]] || fail "Env file not found: $ENV_FILE, template not found: $TEMPLATE_FILE"
  mkdir -p "$(dirname "$ENV_FILE")"
  cp "$TEMPLATE_FILE" "$ENV_FILE"
  ok "Created $ENV_FILE from $TEMPLATE_FILE"
  if [[ "$MODE" == "server" ]]; then
    fail "Edit $ENV_FILE and replace all production placeholders, then rerun this script"
  fi
fi

[[ -f "$ENV_FILE" ]] || fail "Env file not found: $ENV_FILE"

if [[ "$MODE" == "server" ]]; then
  log "Running server/prod-like env preflight"
  assert_strong_env ADMIN_KEY 24
  assert_strong_env COOKIE_SECRET 24
  assert_strong_env APP_SECRET 24
  assert_strong_env VENDURE_WEBHOOK_SECRET 24
  assert_strong_env SUPERADMIN_PASSWORD 16
  assert_strong_env VENDURE_DB_PASSWORD 16
  assert_strong_env SVET_DB_PASSWORD 16
  assert_strong_env POSTGRES_PASSWORD 16
  assert_strong_env OPENSEARCH_INITIAL_ADMIN_PASSWORD 16

  [[ "$(dotenv_get NODE_ENV)" == "production" ]] || fail "NODE_ENV must be production in server mode"
  [[ "$(dotenv_get VENDURE_DB_SYNCHRONIZE)" == "false" ]] || fail "VENDURE_DB_SYNCHRONIZE must be false in server mode"
  [[ "$(dotenv_get SITE_ORIGIN)" == https://* ]] || fail "SITE_ORIGIN must start with https:// in server mode"
  [[ "$(dotenv_get VENDURE_CORS_ORIGIN)" == *https://* ]] || fail "VENDURE_CORS_ORIGIN must contain https:// in server mode"
else
  log "Running local/dev bootstrap"
  if [[ "$(dotenv_get ADMIN_KEY)" =~ ^$|change_me ]]; then
    warn "Using dev ADMIN_KEY from $ENV_FILE. This is fine locally, not for a public server."
  fi
fi

COMPOSE_ARGS=(--env-file "$ENV_FILE" -f infra/docker-compose.yml)
if (( WITH_DEPLOY_OVERRIDE )); then
  COMPOSE_ARGS+=(-f infra/docker-compose.deploy.yml)
fi
if (( WITH_TOOLS )); then
  COMPOSE_ARGS+=(--profile tools)
fi

log "Validating docker compose config"
docker compose "${COMPOSE_ARGS[@]}" config --quiet

if (( STATUS_ONLY )); then
  docker compose "${COMPOSE_ARGS[@]}" ps
  exit 0
fi

if (( RESET_VOLUMES )); then
  (( ASSUME_YES )) || fail "--reset-volumes deletes PostgreSQL/Redis/OpenSearch/RAG volumes. Rerun with --yes if intentional."
  log "Stopping stack and deleting volumes"
  docker compose "${COMPOSE_ARGS[@]}" down -v --remove-orphans
  ok "Stack stopped and volumes removed"
  exit 0
fi

if (( DOWN_ONLY )); then
  log "Stopping stack, keeping volumes"
  docker compose "${COMPOSE_ARGS[@]}" down --remove-orphans
  ok "Stack stopped"
  exit 0
fi

if (( PULL_IMAGES )); then
  log "Pulling compose images"
  docker compose "${COMPOSE_ARGS[@]}" pull --ignore-buildable || warn "Some images could not be pulled; continuing with local build"
fi

UP_ARGS=(up -d)
if (( ! SKIP_BUILD )); then
  UP_ARGS+=(--build)
fi

log "Starting Docker stack"
docker compose "${COMPOSE_ARGS[@]}" "${UP_ARGS[@]}"

wait_for_url() {
  local name="$1"
  local url="$2"
  local timeout="$3"
  local start_time
  local now
  start_time="$(date +%s)"
  printf 'Waiting for %-18s %s\n' "$name" "$url"
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    now="$(date +%s)"
    if (( now - start_time >= timeout )); then
      echo
      docker compose "${COMPOSE_ARGS[@]}" ps || true
      fail "$name did not become healthy within ${timeout}s: $url"
    fi
    printf '.'
    sleep 5
  done
  echo
  ok "$name is ready"
}

wait_for_json_success() {
  local name="$1"
  local url="$2"
  local timeout="$3"
  local start_time
  local now
  start_time="$(date +%s)"
  printf 'Waiting for %-18s %s\n' "$name" "$url"
  until curl -fsS --max-time 8 "$url" | grep -E '"ok"[[:space:]]*:[[:space:]]*true|"status"[[:space:]]*:[[:space:]]*"ok"' >/dev/null 2>&1; do
    now="$(date +%s)"
    if (( now - start_time >= timeout )); then
      echo
      warn "$name did not return expected JSON success within ${timeout}s"
      return 1
    fi
    printf '.'
    sleep 5
  done
  echo
  ok "$name returned healthy JSON"
}

log "Waiting for core services"
FRONTEND_HEALTH_URL="http://127.0.0.1:4173/"
if (( WITH_DEPLOY_OVERRIDE )); then
  FRONTEND_HEALTH_URL="http://127.0.0.1/"
fi
wait_for_url "Vendure" "http://127.0.0.1:3002/health" "$HEALTH_TIMEOUT"
wait_for_url "Backend" "http://127.0.0.1:3000/health" "$HEALTH_TIMEOUT"
wait_for_url "Frontend" "$FRONTEND_HEALTH_URL" "$HEALTH_TIMEOUT"
wait_for_url "RAG API" "http://127.0.0.1:8010/health" "$HEALTH_TIMEOUT"
wait_for_url "OpenSearch" "http://127.0.0.1:9201/_cluster/health" "$HEALTH_TIMEOUT"
wait_for_json_success "Backend deep health" "http://127.0.0.1:3000/health/deep" "$HEALTH_TIMEOUT" || true

ADMIN_KEY_VALUE="$(dotenv_get ADMIN_KEY)"

post_admin_action() {
  local label="$1"
  local url="$2"
  [[ -n "$ADMIN_KEY_VALUE" ]] || {
    warn "ADMIN_KEY is empty; skipping $label"
    return 0
  }
  log "$label"
  local response_file
  response_file="$(mktemp)"
  local http_code
  http_code="$(
    curl -sS -o "$response_file" -w '%{http_code}' \
      -X POST \
      -H "x-admin-key: $ADMIN_KEY_VALUE" \
      -H "Content-Type: application/json" \
      "$url" || true
  )"
  if [[ "$http_code" =~ ^2 ]]; then
    ok "$label completed"
  else
    warn "$label returned HTTP $http_code"
    sed -n '1,20p' "$response_file" >&2 || true
  fi
  rm -f "$response_file"
}

if (( ! SKIP_SEED )); then
  post_admin_action "Importing Vendure seed catalog" "http://127.0.0.1:3000/api/admin/integrations/vendure/import-seed"
else
  warn "Skipping Vendure seed import"
fi

if (( ! SKIP_SYNC )); then
  post_admin_action "Syncing products to OpenSearch" "http://127.0.0.1:3000/api/admin/integrations/vendure/sync-products"
else
  warn "Skipping OpenSearch sync"
fi

log "Final service status"
docker compose "${COMPOSE_ARGS[@]}" ps

cat <<EOF

Local stack is ready.

Open:
- Frontend:          http://127.0.0.1:4173
- Catalog:           http://127.0.0.1:4173/#/catalog
- Cart:              http://127.0.0.1:4173/#/cart
- Assistant:         http://127.0.0.1:4173/#/assistant
- Backend health:    http://127.0.0.1:3000/health/deep
- Vendure Admin UI:  http://127.0.0.1:3002/admin/
- Vendure Shop API:  http://127.0.0.1:3002/shop-api
- Vendure Admin API: http://127.0.0.1:3002/admin-api
- OpenSearch:        http://127.0.0.1:9201
- RAG health:        http://127.0.0.1:8010/health

Dev Vendure login:
- username: $(dotenv_get SUPERADMIN_USERNAME || true)
- password: $(dotenv_get SUPERADMIN_PASSWORD || true)

Useful commands:
- docker compose ${COMPOSE_ARGS[*]} ps
- docker compose ${COMPOSE_ARGS[*]} logs -f
- docker compose ${COMPOSE_ARGS[*]} logs --tail=150 backend-svet
- docker compose ${COMPOSE_ARGS[*]} logs --tail=150 vendure-server
- ./quick-start.sh --status
- ./quick-start.sh --down

Server/prod-like example:
- ./quick-start.sh --mode server --env-file infra/.env.production --with-deploy-override
EOF

if (( SHOW_LOGS )); then
  log "Following logs"
  docker compose "${COMPOSE_ARGS[@]}" logs -f
fi
