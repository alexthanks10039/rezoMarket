#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

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

for url in "${urls[@]}"; do
  echo "Checking $url"
  start_time=$(date +%s)
  timeout=120
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
EOF
