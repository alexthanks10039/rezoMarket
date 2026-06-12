# Мир Сальников Market

Интернет-магазин сальников, подшипников, ремней, манжет, прокладок и запчастей для бытовой техники в Алматы.

## Структура проекта

- `index.html` - точка входа storefront SPA, SEO-мета и подключение модулей.
- `styles.css` - визуальная система магазина, адаптив, карточки товаров, корзина и формы.
- `script.js` - запуск frontend-приложения.
- `src/app.js` - страницы магазина: главная, каталог, товар, корзина, поиск, AI-помощник, подбор, контакты и админ-модалка.
- `src/api.js` - клиент API для shop, cart, orders, analytics и RAG.
- `src/cart-store.js` - клиентская cart session в `localStorage`.
- `BOT TG/backend` - Express backend для shop API, лидов, Telegram CRM, аналитики и RAG-заглушки.
- `rag` - локальный Python RAG-инструментарий для индексации проектных документов.
- `vendure-svet` - отдельный Vendure commerce-core для каталога, товаров, заказов, Admin UI и Storefront API.
- `infra` - Docker Compose для PostgreSQL/pgvector, Redis, OpenSearch, Vendure, backend "Свет", RAG API и frontend.

## Что уже реализовано

- Каталог категорий и товаров для “Мир Сальников”.
- Поиск по артикулу, размеру, названию, типу техники и тегам.
- Карточки товаров с ценой, наличием, характеристиками, совместимостью и аналогами.
- Корзина без онлайн-оплаты: заказ уходит менеджеру для подтверждения наличия и цены.
- Форма подбора детали по модели техники, размеру или описанию проблемы.
- Telegram CRM для уведомлений владельца о заказах и запросах подбора.
- AI/RAG endpoint для консультаций по подбору деталей: Gemini, OpenAI или локальный fallback без ключей.
- Админ API для товаров, категорий, заказов и аналитики через `ADMIN_KEY`.
- Подготовлена headless-commerce архитектура: Vendure + PostgreSQL + Redis + OpenSearch + backend "Свет" + AI/RAG + Analytics.

## Full-stack запуск через Docker

Перед первым запуском проверьте Docker Desktop.

```powershell
Copy-Item infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d --build
```

Или запуск всей среды одной командой из корня проекта:

```bash
./start.sh
# или напрямую полный bootstrap:
./quick-start.sh
```

`quick-start.sh` проверяет Docker/Compose/curl, создаёт `infra/.env` из шаблона, поднимает stack, ждёт health endpoints, импортирует seed-каталог в Vendure и запускает синхронизацию OpenSearch.

Полезные режимы:

```bash
./quick-start.sh --status
./quick-start.sh --logs
./quick-start.sh --down
./quick-start.sh --tools
./quick-start.sh --skip-build --skip-seed
```

Prod-like/server запуск через тот же скрипт:

```bash
cp infra/.env.production.example infra/.env.production
# заменить placeholder-секреты
./quick-start.sh --mode server --env-file infra/.env.production --with-deploy-override
```

URL после запуска:

- Frontend: `http://127.0.0.1:4173`
- Backend "Свет": `http://127.0.0.1:3000/health`
- Vendure Admin UI: `http://127.0.0.1:3002/admin`
- Vendure Shop API: `http://127.0.0.1:3002/shop-api`
- OpenSearch: `http://127.0.0.1:9201`
- RAG API: `http://127.0.0.1:8010/health`

Подробный план, endpoints и проверки: `docs/vendure-svet-architecture.md`.

## Локальный запуск frontend

Можно открыть `index.html` напрямую в браузере. Для проверки через локальный сервер:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Затем открыть `http://127.0.0.1:4173/`.

## Локальный запуск backend

```powershell
cd "BOT TG/backend"
npm install
npm run dev
```

Backend по умолчанию слушает `http://127.0.0.1:3000`.

Для AI-помощника можно задать ключи в `BOT TG/backend/.env`: `GEMINI_API_KEY` для Gemini или `OPENAI_API_KEY` для OpenAI. Без ключей помощник продолжит отвечать локальными подсказками по каталогу.
