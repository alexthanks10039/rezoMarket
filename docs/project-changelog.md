# Changelog проекта Мир Сальников

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
