# Мир Сальников Backend

Express backend для интернет-магазина “Мир Сальников”: shop API, заявки, заказы без онлайн-оплаты, Telegram CRM, аналитика и базовый RAG endpoint.

## Запуск

```bash
cd "BOT TG/backend"
npm install
npm run dev
```

## Локальная настройка

Создай локальный файл `.env` внутри `BOT TG/backend`.

```text
PORT=3000
TG_KEY=put_bot_token_from_botfather_here
OWNER_ID=put_your_telegram_chat_id_here
ADMIN_KEY=put_private_admin_key_here
PUBLIC_BASE_URL=https://example.com
WEBHOOK_PATH=/api/telegram/webhook
MINI_APP_URL=
SITE_ORIGIN=http://127.0.0.1:4173
```

## Public endpoints

```text
GET  /health
POST /api/leads
GET  /api/shop/categories
GET  /api/shop/categories/:slug
GET  /api/shop/products
GET  /api/shop/products/:slug
POST /api/shop/cart
GET  /api/shop/cart/:sessionId
POST /api/shop/cart/items
PATCH /api/shop/cart/items/:id
DELETE /api/shop/cart/items/:id
POST /api/shop/orders
POST /api/shop/selection-request
POST /api/shop/analytics
POST /api/rag/ask
```

## Protected diagnostics

Эти endpoints доступны только владельцу. Передай `OWNER_ID` через `?telegramUserId=...`, JSON body `telegramUserId` или header `x-telegram-user-id`.

```text
GET  /api/telegram/get-me
GET  /api/telegram/webhook-info
POST /api/test-lead
```

## Admin endpoints

Для админских shop endpoints нужен `ADMIN_KEY`: header `x-admin-key`, query `adminKey` или JSON body `adminKey`.

```text
GET    /api/admin/shop/products
POST   /api/admin/shop/products
PATCH  /api/admin/shop/products/:id
DELETE /api/admin/shop/products/:id
GET    /api/admin/shop/categories
POST   /api/admin/shop/categories
PATCH  /api/admin/shop/categories/:id
DELETE /api/admin/shop/categories/:id
GET    /api/admin/shop/orders
PATCH  /api/admin/shop/orders/:id/status
GET    /api/admin/shop/analytics
POST   /api/admin/shop/import
```

## Пример заказа

```json
{
  "customerName": "Александр",
  "phone": "+7 777 000 00 00",
  "city": "Алматы",
  "contactMethod": "whatsapp",
  "deliveryMethod": "pickup",
  "items": [
    {
      "productId": "salnik-35x62x10-nbr",
      "title": "Сальник 35x62x10 NBR",
      "sku": "SL-356210-NBR",
      "price": 2300,
      "quantity": 1
    }
  ],
  "totalAmount": 2300,
  "source": "shop",
  "sourcePage": "/cart"
}
```

После запроса backend создаст заказ, сформирует lead и отправит уведомление владельцу в Telegram.
