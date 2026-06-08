# Vendure + Свет: архитектура магазина

## Что найдено в проекте

- Frontend: статический SPA на `index.html`, `src/app.js`, `src/api.js`.
- Backend "Свет": `BOT TG/backend`, Node.js + Express, package manager `npm`.
- Существующие backend-модули: leads, Telegram, shop API, analytics fallback, AI/RAG endpoint.
- Prisma до интеграции не использовалась; добавлена подготовленная schema для `svet_ai_db`.
- Текущий каталог и корзина остаются in-memory fallback, чтобы старый запуск не сломался.

## Размещение Vendure

Vendure вынесен в отдельный сервис `vendure-svet`.

- `vendure-svet/src/vendure-config.ts` - конфиг Vendure 3.6.4.
- `vendure-svet/src/plugins/svet-webhook.plugin.ts` - отправка событий Vendure в backend "Свет".
- `vendure-svet/src/seed/salniki-products.json` - стартовые товары и коллекции.
- `vendure-svet/Dockerfile` - контейнер Vendure server/worker.

Vendure управляет commerce-данными самостоятельно через `vendure_db`.

## Базы данных

В `infra/docker-compose.yml` используется один PostgreSQL/pgvector контейнер с двумя логическими базами:

- `vendure_db` - база Vendure.
- `svet_ai_db` - база backend "Свет" для интеграций, RAG, analytics, selection requests и sync logs.

Инициализация: `infra/postgres/initdb/01-create-databases.sql`.

Prisma schema backend "Свет": `BOT TG/backend/prisma/schema.prisma`.

Модели:

- `VendureSyncLog`
- `ShopAnalyticsEvent`
- `SelectionRequest`
- `ProductKnowledgeSnapshot`
- `KnowledgeDocument`
- `KnowledgeChunk` с `vector(1536)`

## Redis

Redis подключён в compose как `redis`.

Использование:

- Vendure job queue через `BullMQJobQueuePlugin`.
- Vendure cache через `RedisCachePlugin`.
- backend "Свет" получает `REDIS_URL` для будущего кеша поиска/rate limit.

## OpenSearch

OpenSearch подключён сервисом `opensearch`.

Backend "Свет" добавляет индекс `catalog_products` и fallback:

- если OpenSearch доступен, поиск идёт через индекс;
- если недоступен, `/api/shop/search` возвращает результаты из текущего локального каталога.

Модули:

- `BOT TG/backend/src/modules/search/opensearch.client.js`
- `BOT TG/backend/src/modules/search/opensearch.service.js`
- `BOT TG/backend/src/modules/search/search.routes.js`

## Backend "Свет" modules

Добавлены:

- `src/modules/integrations/vendure/*`
- `src/modules/search/*`
- `src/modules/shop-analytics/*`
- `src/modules/selection/*`
- `src/modules/shared/admin-auth.js`

Не удалялись существующие `leads`, `telegram`, `shop`, `rag`.

## Endpoints

Vendure integration:

- `POST /api/integrations/vendure/webhook`
- `POST /api/admin/integrations/vendure/sync-products`
- `POST /api/admin/integrations/vendure/sync-orders`
- `GET /api/admin/integrations/vendure/sync-logs`

Search:

- `GET /api/shop/search`
- `POST /api/admin/shop/search/reindex`

Analytics:

- `POST /api/shop/analytics`
- `POST /api/shop/analytics/event`
- `GET /api/admin/shop/analytics/summary`
- `GET /api/admin/shop/analytics/searches`
- `GET /api/admin/shop/analytics/products`

Selection:

- `POST /api/shop/selection-request`
- `GET /api/admin/shop/selection-requests`
- `PATCH /api/admin/shop/selection-requests/:id/status`

AI/RAG:

- `POST /api/rag/ask`
- `POST /api/shop/assistant/ask`
- `POST /api/admin/shop/rag/rebuild`
- `GET /api/admin/shop/rag/snapshots`

## Vendure custom fields

Product:

- `sku`
- `size`
- `innerDiameter`
- `outerDiameter`
- `width`
- `material`
- `brand`
- `applianceType`
- `applianceBrand`
- `applianceModel`
- `compatibility`
- `analogs`
- `supplierCode`
- `isPopular`
- `searchKeywords`
- `metaTitle`
- `metaDescription`

ProductVariant:

- `size`
- `innerDiameter`
- `outerDiameter`
- `width`
- `material`
- `brand`
- `applianceType`
- `applianceBrand`
- `applianceModel`
- `compatibility`
- `analogs`
- `supplierCode`
- `isPopular`
- `searchKeywords`
- `metaTitle`
- `metaDescription`

Variant SKU используется нативным полем Vendure `sku`.

## Env

Основные примеры:

- `infra/.env.example`
- `vendure-svet/.env.example`
- `BOT TG/backend/.env.example`

Секреты в код не добавлены.

## Запуск

Из корня проекта:

```powershell
Copy-Item infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d --build
```

URL:

- Frontend: `http://127.0.0.1:4173`
- Backend "Свет": `http://127.0.0.1:3000/health`
- Vendure Shop API: `http://127.0.0.1:3002/shop-api`
- Vendure Admin API: `http://127.0.0.1:3002/admin-api`
- Vendure Admin UI: `http://127.0.0.1:3003/admin`
- OpenSearch: `http://127.0.0.1:9201`
- RAG API: `http://127.0.0.1:8010/health`
- OpenSearch Dashboards: `docker compose -f infra/docker-compose.yml --profile tools up -d opensearch-dashboards`

Если порт `3000` занят локальным backend, остановить его перед full compose.

## Проверка

Health:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:8010/health
```

Поиск:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/shop/search?q=35x62x10"
Invoke-RestMethod "http://127.0.0.1:3000/api/shop/search?q=6204"
```

Reindex:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/admin/shop/search/reindex -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

Vendure sync:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/admin/integrations/vendure/sync-products -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

AI/RAG:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/shop/assistant/ask -ContentType application/json -Body '{"question":"Нужен сальник 35x62x10","context":"shop"}'
```

Analytics:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/shop/analytics -ContentType application/json -Body '{"eventType":"search_used","searchQuery":"6204","meta":{"total":1}}'
Invoke-RestMethod http://127.0.0.1:3000/api/admin/shop/analytics/summary -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

Telegram:

1. Заполнить `TG_KEY`/`OWNER_ID` или aliases в `infra/.env`.
2. Создать тестовый заказ на frontend или принять webhook `order.created`.
3. Проверить сообщение менеджеру.

## Риски и следующий этап

- Docker был установлен уже после старта работы; контейнеры нужно фактически поднять и проверить на машине.
- Vendure seed пока подготовлен как JSON и ручная инструкция импорта. Следующим этапом лучше добавить безопасный importer через Admin API.
- Backend "Свет" получил Prisma schema, но runtime ещё использует in-memory fallback. Следующий этап - подключить Prisma repositories без ломки текущих routes.
- Frontend подготовлен к Vendure через `src/vendure-client.js`, но каталог пока не переключён на Storefront API. Следующий этап - миграция каталога, корзины и checkout на Vendure GraphQL.
- Нужно заменить dev secrets в `infra/.env` перед внешним доступом.

