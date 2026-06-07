# Анализ проекта Мир Сальников

## Назначение

Проект - frontend и backend-прототип интернет-магазина “Мир Сальников” для продажи сальников, подшипников, ремней, манжет, прокладок и запчастей для бытовой техники в Алматы.

Главная задача проекта: дать покупателю быстрый поиск по артикулу, размеру, модели техники или описанию проблемы, собрать корзину без онлайн-оплаты и передать заказ менеджеру через Telegram CRM.

## Текущая архитектура

- Frontend: static vanilla JS SPA в `index.html`, `script.js`, `src/app.js`, `src/api.js`, `src/cart-store.js`.
- Backend: Express API в `BOT TG/backend`.
- Catalog data: in-memory seed в `BOT TG/backend/src/shop/seed-data.js`.
- Orders/leads/analytics/cart: in-memory store в `BOT TG/backend/src/shop/store.js` и `leads.store.js`.
- Telegram CRM: `telegram.service.js`, `bot.routes.js`, `bot-ui.service.js`.
- RAG: backend endpoint `/api/rag/ask` как временная shop-заглушка; локальный Python RAG в `rag/`.

## Что уже реализовано

- Главная страница магазина с поиском и CTA на каталог/подбор.
- Каталог категорий и товаров.
- Фильтры по поиску, категории, бренду, размеру, типу техники, наличию и сортировке.
- Страница товара с характеристиками, совместимостью и аналогами.
- Корзина с session id в `localStorage`.
- Оформление заказа без онлайн-оплаты.
- Запрос подбора детали.
- Отправка заказов и подборов в Telegram как lead.
- Базовая Telegram CRM с меню, статистикой, сотрудниками и действиями по заявке.
- Admin API для товаров, категорий, заказов и аналитики через `ADMIN_KEY`.

## Что важно помнить

- Это не production commerce core.
- Prisma, PostgreSQL, миграции и Vendure пока не подключены.
- Данные магазина хранятся в памяти процесса и сбрасываются после перезапуска.
- Текущий shop API можно использовать как прототип требований.
- Для полноценного “Магазина” рекомендуется подключить Vendure как commerce core, а этот backend оставить как AI/Telegram/RAG/Analytics integration layer.

## Ближайшие технические цели

- Изолировать integration backend от commerce core.
- Подключить persistent database для leads, analytics, selection requests и webhook logs.
- Поднять Vendure отдельно и перенести catalog/cart/order ownership туда.
- Настроить webhook заказов Vendure в Telegram CRM.
- Сделать RAG по товарам и справочным документам.
- Заменить временные placeholder images на реальные фотографии товаров.
