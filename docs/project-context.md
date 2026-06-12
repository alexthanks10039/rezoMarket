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
- `src/rag.routes.js` - AI assistant с Product/Business RAG и локальным fallback;
- `src/owner-access.js` - owner-only middleware.

## Data model сейчас

Данные backend "Свет" пока не полностью persistent. Для локальных сущностей всё ещё используются JS массивы и `Map`, но commerce-контур уже связан с Vendure/PostgreSQL:

- товары и варианты импортируются в Vendure;
- storefront получает каталог через backend/OpenSearch;
- оформление заказа создаёт локальный order и Vendure Draft Order;
- локальный order хранит связь с Vendure через `vendureOrderId` и `vendureOrderCode`;
- менеджер видит заказ в Vendure Admin UI.

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

## RAG-контур

- Developer RAG: внутренняя документация и архитектура, visibility `internal`.
- Business RAG: правила магазина, доставка, оплата, возвраты и работа менеджера, visibility `public`.
- Product RAG: каталог backend/Vendure с SKU, размерами, совместимостью и служебным предупреждением о повторной проверке цены и наличия.
- Каждый слой хранится в отдельной версионной Chroma-коллекции; активные версии задаются в `active_collections.json`.
- Shop assistant запрашивает только Product/Business слои. При недоступном RAG прежний rule-based/Gemini/OpenAI flow продолжает работать.
- Проверка 2026-06-12: `81` Developer chunks, `2` Business chunks, `26` Product records; backend возвращает `rag.used=true`.

## Состояние на 2026-06-09

- Docker dev stack поднят и проверен.
- Vendure Admin UI работает на русском языке.
- Заказ с сайта визуально проверен: `order_1781019396957_nwh9uc` -> Vendure code `FWGMFLYQ7CFEBPQ8`.
- Заказ отображается в Vendure `Продажи -> Заказы` как `Черновик`.
- Стандартный Vendure Dashboard не показывает этот заказ в `Последние заказы`, потому что текущий flow создаёт Draft Order.
- Открытый критичный вопрос: единицы денег KZT. В storefront/backend сумма `350 KZT`, а в Vendure Admin UI список заказов показывает `3.50`.

Актуальный дневной отчёт: `docs/daily-report-2026-06-09.md`.
Актуальный список багов: `docs/bug-status-2026-06-09.md`.
