# Changelog проекта Мир Сальников

## 2026-06-12 - Фиксация архитектуры и commerce-flow

- Добавлен интеграционный smoke test текущего commerce-flow без изменения бизнес-логики.
- Зафиксированы проверки каталога, поиска, Vendure quote, создания заказа, связи `localOrderId`, сохранения Vendure code/state и синхронизации OpenSearch.
- Тестовый прогон завершён: 7 из 7 проверок пройдены.
- После полного перезапуска Docker создан заказ `order_1781215127962_dk7jl2`, связанный с Vendure order `LXWY4WQPG4EQ3L76` в состоянии `Draft`.
- Заказ визуально проверен в Vendure Admin UI.
- Проверены frontend, backend, Vendure, PostgreSQL, Redis, OpenSearch и RAG health endpoints.
- Созданы документы текущего состояния:
  - `docs/architecture-current.md`;
  - `docs/api-contracts-current.md`;
  - `docs/testing-strategy.md`;
  - `docs/adr/0001-service-data-ownership.md`.
- Зафиксировано, что RAG API доступен, но Chroma collection пока отсутствует (`indexReady=false`).
- Изменения базы данных и commerce business logic на этом этапе не выполнялись.

## 2026-06-09 - Vendure commerce и проверка заказов

- Vendure commerce доведён до manager-ready контура: сайт создаёт локальный заказ и связанный Vendure Draft Order.
- Backend пересчитывает заказ через Vendure quote и сохраняет `vendureOrderId`, `vendureOrderCode`, `vendureOrderState`, `vendureCurrencyCode`, `vendureTotalWithTax`.
- Добавлены и проверены admin commerce endpoints для просмотра и действий над связанным Vendure order.
- Исправлены последние commerce-фиксы по fulfillment/cart behavior.
- Vendure Admin UI переведён на русский язык через `AdminUiPlugin` config.
- GitHub push приведён к обычному fast-forward push через rebase без force-push.
- В браузере оформлен тестовый заказ `order_1781019396957_nwh9uc`; в Vendure создан order `FWGMFLYQ7CFEBPQ8`.
- Заказ визуально отображается в Vendure Admin UI в `Продажи -> Заказы`.
- Зафиксированы открытые вопросы:
  - KZT в Vendure Admin UI отображается как `3.50` вместо `350`;
  - Draft Orders не отображаются в стандартном виджете `Последние заказы` на Dashboard.

Подробности:

- `docs/daily-report-2026-06-09.md`;
- `docs/bug-status-2026-06-09.md`.

## 2026-06-10 - Быстрое развёртывание

- Добавлен большой bootstrap-скрипт `quick-start.sh` для локального и server/prod-like запуска.
- `start.sh` превращён в тонкий алиас на `quick-start.sh`, чтобы не было двух разных логик запуска.
- Скрипт проверяет Docker, Compose, curl и базовые shell-утилиты.
- Скрипт создаёт env из шаблона, валидирует compose config, поднимает stack, ждёт health endpoints, импортирует Vendure seed-каталог и синхронизирует OpenSearch.
- Для server mode добавлены проверки production-секретов, HTTPS origin и `VENDURE_DB_SYNCHRONIZE=false`.
- Добавлен документ `docs/quick-deploy-prompt.md` с промтом, анализом и принципами дальнейшего развития bootstrap.

## Магазинная структура

- Проект приведён к контексту интернет-магазина “Мир Сальников”.
- Frontend работает как static SPA для каталога, товара, корзины, поиска, AI-помощника и запроса подбора.
- Backend расширен до shop API, Telegram CRM, leads, analytics и RAG endpoint.
- Каталог seed-данных обновлён под сальники, подшипники, ремни, манжеты, прокладки и запчасти бытовой техники.

## Backend

- `BOT TG/backend/src/shop/seed-data.js` содержит актуальные категории и товары магазина.
- `BOT TG/backend/src/shop/routes.js` предоставляет public и admin endpoints.
- Заказ из `/api/shop/orders` создаёт order, lead и Telegram-уведомление.
- Запрос подбора из `/api/shop/selection-request` создаёт selection request, lead и Telegram-уведомление.
- Telegram CRM поддерживает меню, статистику, список заявок, сотрудников и действия по заявке.

## RAG

- `rag/` содержит локальные инструменты индексации документов через ChromaDB и HuggingFace embeddings.
- `/api/rag/ask` пока остаётся временной shop-заглушкой.
- Следующий шаг - связать backend RAG endpoint с продуктовым индексом товаров и справочных документов.

## Следующие изменения

- Подключить persistent database.
- Настроить Vendure как commerce core.
- Перенести ownership товаров, корзин и заказов в Vendure.
- Подключить webhooks Vendure к Telegram CRM.
- Добавить product import jobs и RAG indexing jobs.
- Добавить реальные изображения товаров.
