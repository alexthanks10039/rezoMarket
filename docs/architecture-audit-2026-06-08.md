# Архитектурный аудит 2026-06-08

## Что проверено

- Docker stack: PostgreSQL/pgvector, Redis, OpenSearch, Vendure server/worker, backend "Свет", RAG API, frontend.
- Backend "Свет": Express routes, shop fallback store, OpenSearch integration, Vendure sync, analytics, selection requests, RAG routes.
- Vendure: конфигурация, worker/server, package dependencies, Redis queue/cache, PostgreSQL connection.
- RAG: ChromaDB API, ingest/query scripts, Docker health.
- Frontend: текущая роль как статического SPA над backend API.

## Исправлено сейчас

- RAG API больше не падает с 500 из-за недопустимого имени Chroma collection. Имя переведено в ASCII: `mir_salnikov_project_knowledge`.
- `/health` RAG теперь показывает реальное состояние индекса: готов, пустой, отсутствует или повреждён.
- `/query` RAG возвращает управляемый JSON-ответ при неготовом индексе, а не аварийный exception.
- OpenSearch reindex теперь сначала пересоздаёт индекс `catalog_products`, поэтому удалённые товары не остаются в поисковой выдаче.
- Для single-node OpenSearch выставлен `number_of_replicas: 0`.
- Vendure product sync теперь использует общий rebuild индекса, а не поштучную запись без очистки.
- Backend получил `/health/deep` для проверки OpenSearch, Vendure и RAG.
- Docker services получили `restart: unless-stopped`; backend и RAG получили healthcheck; frontend/Vendure ждут healthy backend.
- Убран неиспользуемый `@vendure/email-plugin`; npm audit Vendure снизился с 43 проблем до 10.

## Слабые места

1. Runtime магазина всё ещё частично in-memory.
   Каталог, корзина, заказы, analytics events, selection requests и sync logs живут в `BOT TG/backend/src/shop/store.js` и смежных in-memory модулях. PostgreSQL/Prisma schema уже подготовлены, но repositories ещё не подключены к runtime routes.

2. Vendure не является единственным source of truth.
   Vendure поднят и готов, но frontend и backend search пока используют локальный seed/fallback каталог. Storefront API и checkout Vendure ещё не стали основным путём.

3. RAG индекс не собирается автоматически при старте.
   API теперь корректно сообщает `collection_missing` или `index_empty`, но нужен отдельный job/command для ingest и обновления знаний по товарам.

4. Dev secrets оставлены как fallback только для локального запуска.
   Перед внешним доступом нужно заменить `SUPERADMIN_PASSWORD`, `ADMIN_KEY`, `COOKIE_SECRET`, `APP_SECRET`, `VENDURE_WEBHOOK_SECRET`, включить нормальную security-схему OpenSearch.

5. Vendure dependency audit остаётся неидеальным.
   После удаления email-плагина осталось 10 npm audit findings: в основном транзитивные `@apollo/server`, `@nestjs/graphql`, `lodash`, `ws`, `file-type` внутри Vendure/Nest/Apollo stack. Автоматический `npm audit fix --force` предлагает некорректные major/downgrade-изменения, поэтому чинить это нужно через плановое обновление Vendure/Nest, а не force.

## Рекомендуемый следующий этап

1. Перевести `shop/store.js`, analytics, selection requests и sync logs на Prisma repositories.
2. Импортировать текущий seed-каталог в Vendure и сделать Vendure source of truth для товаров, остатков и заказов.
3. Переключить frontend-каталог, корзину и оформление заказа на Vendure Storefront API.
4. Добавить RAG ingest job: docs + product knowledge snapshots + совместимости/аналоги.
5. Подготовить production profile Docker: секреты без default fallback, OpenSearch security, backup policy PostgreSQL/OpenSearch/Chroma.
