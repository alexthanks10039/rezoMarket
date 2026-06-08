# Теоретический деплой проекта

## Что готово

- Docker Compose stack: frontend, backend "Свет", Vendure server, Vendure worker, PostgreSQL/pgvector, Redis, OpenSearch, RAG API.
- Production env template: `infra/.env.production.example`.
- Compose override для production-поведения: `infra/docker-compose.deploy.yml`.
- Preflight-проверка секретов и compose config: `infra/preflight-deploy.ps1`.
- PostgreSQL backup/restore scripts: `infra/backup-postgres.ps1`, `infra/restore-postgres.ps1`.
- Env-driven initdb для `vendure_db` и `svet_ai_db`: `infra/postgres/initdb/01-create-databases.sh`.
- Health endpoints:
  - backend: `/health`, `/health/deep`
  - Vendure: `/health`
  - RAG: `/health`

## Минимальный порядок деплоя

1. Скопировать env:

```powershell
Copy-Item infra/.env.production.example infra/.env.production
```

2. Заменить все placeholder-секреты.

3. Прогнать preflight:

```powershell
powershell -ExecutionPolicy Bypass -File infra/preflight-deploy.ps1 -EnvFile infra/.env.production
```

4. Собрать и поднять stack:

```powershell
docker compose --env-file infra/.env.production -f infra/docker-compose.yml -f infra/docker-compose.deploy.yml up -d --build
```

5. Импортировать seed-каталог в Vendure. Импорт создаёт facets, collections, продукты, варианты, базовые tax/shipping/payment настройки и сразу синхронизирует OpenSearch:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3000/api/admin/integrations/vendure/import-seed `
  -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

6. При изменениях каталога в Vendure запустить ручную синхронизацию OpenSearch:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3000/api/admin/integrations/vendure/sync-products `
  -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

7. Проверить сервисы:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/deep
Invoke-RestMethod http://127.0.0.1:3002/health
Invoke-RestMethod http://127.0.0.1:8010/health
```

## Перед реальным production

- Поставить reverse proxy с HTTPS.
- Не публиковать наружу PostgreSQL, Redis, OpenSearch и внутренний backend без необходимости.
- Заменить dev OpenSearch mode на защищённую схему или вынести OpenSearch в managed/private network.
- Подключить реальные миграции Vendure вместо `VENDURE_DB_SYNCHRONIZE=true`; в production должно быть `false`.
- Настроить регулярный backup PostgreSQL.
- OpenSearch и RAG можно восстановить переиндексацией, но для быстрого disaster recovery лучше делать volume snapshots.
- Подключить мониторинг `/health` и `/health/deep`.

## Vendure notes из официальной документации

- Каталог строится вокруг `Product` и `ProductVariant`; цена, SKU и остатки принадлежат варианту.
- Категории storefront лучше моделировать через `Collection`, а фильтрацию через facets.
- Корзина в Vendure — это `activeOrder`; товары добавляются по `ProductVariant`.
- Checkout требует customer, shipping address, shipping method, payment и transition order state.
- Для production нужны environment variables, сильные superadmin credentials, healthchecks, server+worker, Redis/BullMQ или другой persistent job queue.
