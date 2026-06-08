#!/usr/bin/env bash
set -euo pipefail

: "${VENDURE_DB_NAME:=vendure_db}"
: "${VENDURE_DB_USER:=vendure}"
: "${VENDURE_DB_PASSWORD:=vendure}"
: "${SVET_DB_NAME:=svet_ai_db}"
: "${SVET_DB_USER:=svet}"
: "${SVET_DB_PASSWORD:=svet}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v vendure_db="$VENDURE_DB_NAME" \
  -v vendure_user="$VENDURE_DB_USER" \
  -v vendure_password="$VENDURE_DB_PASSWORD" \
  -v svet_db="$SVET_DB_NAME" \
  -v svet_user="$SVET_DB_USER" \
  -v svet_password="$SVET_DB_PASSWORD" <<'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'vendure_user', :'vendure_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'vendure_user')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'vendure_db', :'vendure_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'vendure_db')\gexec

SELECT format('CREATE USER %I WITH PASSWORD %L', :'svet_user', :'svet_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'svet_user')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'svet_db', :'svet_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'svet_db')\gexec

\connect :svet_db
CREATE EXTENSION IF NOT EXISTS vector;
SQL
