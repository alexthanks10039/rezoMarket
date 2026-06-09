#!/usr/bin/env bash
set -euo pipefail

# Quick-start launcher for rezoMarket
#
# Этот скрипт делает всё, что нужно для быстрого старта локального стека:
# - создаёт infra/.env из infra/.env.example
# - запускает Docker Compose по файлу infra/docker-compose.yml
# - дожидается доступности основных health-эндпоинтов
#
# Услуги и порты:
#   Frontend: http://127.0.0.1:4173
#   Vendure Admin UI: http://127.0.0.1:3002/admin/
#   Vendure Shop API: http://127.0.0.1:3002/shop-api
#   Vendure Admin API: http://127.0.0.1:3002/admin-api
#   Backend "Свет": http://127.0.0.1:3000/
#   Backend health: http://127.0.0.1:3000/health
#   OpenSearch: http://127.0.0.1:9201
#   OpenSearch Dashboards: http://127.0.0.1:5602 (profile tools)
#
# Основные значения из infra/.env.example:
#   ADMIN_KEY=change_me_admin_key
#   COOKIE_SECRET=change_me_cookie_secret
#   APP_SECRET=change_me_app_secret
#   VENDURE_WEBHOOK_SECRET=change_me_vendure_webhook_secret
#   SUPERADMIN_USERNAME=superadmin
#   SUPERADMIN_PASSWORD=superadmin
#   VENDURE_DB_NAME=vendure_db
#   VENDURE_DB_USER=vendure
#   VENDURE_DB_PASSWORD=vendure
#   VENDURE_DB_SYNCHRONIZE=true
#   VENDURE_CORS_ORIGIN=http://127.0.0.1:4173,http://localhost:4173
#   SITE_ORIGIN=http://127.0.0.1:4173
#   OPENSEARCH_INITIAL_ADMIN_PASSWORD=OpenSearch_123!
#
# Быстрые команды:
#   ./quick-start.sh
#   docker compose -f infra/docker-compose.yml ps
#   docker compose -f infra/docker-compose.yml logs -f
#   docker compose -f infra/docker-compose.yml down

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not found in PATH"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available. Use Docker Engine with Compose support."
  exit 1
fi

if [ ! -f infra/.env ] && [ -f infra/.env.example ]; then
  cp infra/.env.example infra/.env
  echo "Created infra/.env from .env.example"
fi

echo "Starting local stack with Docker Compose..."
docker compose -f infra/docker-compose.yml up -d --build

echo "Waiting for core services to become available..."
urls=(
  "http://127.0.0.1:3002/health"
  "http://127.0.0.1:3000/health"
  "http://127.0.0.1:4173/"
)

timeout=120

for url in "${urls[@]}"; do
  echo "Checking $url"
  start_time=$(date +%s)
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    now=$(date +%s)
    if (( now - start_time >= timeout )); then
      echo "WARNING: $url did not become available within ${timeout}s"
      break
    fi
    sleep 5
  done
  echo "  -> $url ready"
done

cat <<'EOF'
Local stack startup requested.
Open the services:
- Frontend: http://127.0.0.1:4173
- Vendure Admin UI: http://127.0.0.1:3002/admin/
- Vendure Shop API: http://127.0.0.1:3002/shop-api
- Vendure Admin API: http://127.0.0.1:3002/admin-api
- Backend "Свет": http://127.0.0.1:3000/
- Backend health: http://127.0.0.1:3000/health
- OpenSearch: http://127.0.0.1:9201
- OpenSearch Dashboards: http://127.0.0.1:5602

Useful commands:
- docker compose -f infra/docker-compose.yml ps
- docker compose -f infra/docker-compose.yml logs -f
- docker compose -f infra/docker-compose.yml down
EOF
