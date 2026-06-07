# Контекст проекта Мир Сальников

## Продукт

“Мир Сальников” - интернет-магазин запчастей для бытовой техники в Алматы. Основной ассортимент:

- сальники;
- подшипники;
- ремни;
- манжеты;
- прокладки;
- запчасти для стиральных машин;
- запчасти для холодильников;
- расходники и крепёж.

Покупатель должен быстро найти деталь по размеру, артикулу, модели техники или описанию проблемы. Если точная совместимость непонятна, пользователь оставляет запрос подбора, а менеджер получает уведомление в Telegram.

## Frontend

Frontend находится в корне проекта:

- `index.html` - `#app`, SEO-мета и `meta[name="api-base"]`;
- `script.js` - запуск приложения;
- `src/app.js` - SPA, маршруты, страницы и UI;
- `src/api.js` - API client;
- `src/cart-store.js` - cart session;
- `styles.css` - стили магазина.

Маршруты:

- `/`;
- `/catalog`;
- `/catalog/:slug`;
- `/product/:slug`;
- `/cart`;
- `/search`;
- `/assistant`;
- `/selection`;
- `/contacts`;
- `/how-to-order`;
- `/admin`.

## Backend

Backend находится в `BOT TG/backend`.

Основные модули:

- `src/index.js` - Express app и `/health`;
- `src/shop/routes.js` - shop API;
- `src/shop/store.js` - in-memory store;
- `src/shop/seed-data.js` - категории и товары;
- `src/leads.routes.js` - intake заявок;
- `src/leads.store.js` - lead lifecycle;
- `src/telegram.service.js` - Telegram Bot API;
- `src/bot.routes.js` - webhook и меню Telegram CRM;
- `src/bot-ui.service.js` - тексты и клавиатуры бота;
- `src/rag.routes.js` - временный AI/RAG endpoint;
- `src/owner-access.js` - owner-only middleware.

## Data model сейчас

Данные пока не persistent. Используются JS массивы и `Map`.

Есть прототипы:

- category;
- product;
- cart;
- cart item;
- order;
- order item;
- selection request;
- analytics event;
- lead;
- employee.

## Целевая архитектура

Рекомендуемый путь:

```text
Frontend магазина
↓
Vendure Storefront API
↓
Vendure Commerce Core
↓
PostgreSQL
↓
Backend Мир Сальников как AI / Telegram / RAG / Analytics layer
```

Vendure должен владеть товарами, корзинами, заказами, клиентами и остатками. Backend “Мир Сальников” должен владеть интеграциями: Telegram, AI/RAG, analytics, selection requests, webhook logs и задачами синхронизации.
