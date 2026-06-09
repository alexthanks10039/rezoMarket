# Vendure commerce: план до 80%

## Цель 80%

Для проекта "Мир Сальников" 80% commerce-ready означает не полноценный Kaspi/Shopify-клон с онлайн-эквайрингом, а устойчивую схему:

- Vendure является источником правды по товарам, вариантам, цене, валюте и остаткам.
- Backend "Свет" отдаёт витрине быстрый каталог через OpenSearch, но перед оформлением заказа пересчитывает корзину по Vendure.
- Заказ с сайта создаёт локальную заявку, лид для менеджера и Vendure Draft Order со связкой `localOrderId`.
- Менеджер может видеть Vendure id/code/state, добавить заметку, отменить заказ, перевести state, создать manual payment или fulfillment.
- Каталог синхронизируется из Vendure в OpenSearch/RAG snapshots.
- Production-контур подготовлен: Docker, Postgres, Redis, OpenSearch, env, backup/restore, preflight.

Онлайн-оплата, полноценный customer account, возвраты и кастомная админка остаются следующим этапом после 80%.

## Что выяснено по документации Vendure

- В Vendure корзина и заказ — одна сущность `Order`; cart это order до прохождения checkout.
- Storefront checkout flow: active order -> customer/address -> eligible shipping -> set shipping method -> `ArrangingPayment` -> payment -> confirmation by `orderByCode`.
- Facets — основной способ структурированных фильтров, коллекций и storefront-фильтрации.
- Admin API поддерживает Draft Orders: `createDraftOrder`, `addItemToDraftOrder`, `setCustomerForDraftOrder`, `setDraftOrderShippingAddress`, `setDraftOrderShippingMethod`.
- Admin API поддерживает менеджерские операции: `addNoteToOrder`, `transitionOrderToState`, `addManualPaymentToOrder`, `addFulfillmentToOrder`, `cancelOrder`.

Источники:

- https://docs.vendure.io/current/core/storefront/active-order
- https://docs.vendure.io/current/core/storefront/checkout-flow
- https://docs.vendure.io/current/core/user-guide/orders/orders
- https://docs.vendure.io/current/core/user-guide/catalog/facets
- https://docs.vendure.io/current/core/reference/graphql-api/admin/mutations
- https://docs.vendure.io/current/core/reference/graphql-api/admin/input-types

## Что уже было до этого этапа

- Docker stack: frontend, backend, Vendure server/worker, PostgreSQL, Redis, OpenSearch, RAG API.
- Импорт seed-каталога в Vendure.
- Products, variants, facets, collections, KZT, KZ zone, tax/shipping/payment.
- OpenSearch индекс каталога.
- Заказ создавал Vendure Draft Order.
- Deploy docs и preflight.

## Что добавлено этим этапом

- Checkout quote endpoint: `POST /api/shop/checkout/quote`.
- Commerce methods endpoint: `GET /api/shop/commerce/methods`.
- Backend пересчитывает заказ по Vendure quote и не доверяет сумме с фронта.
- В локальный order сохраняются `vendureOrderId`, `vendureOrderCode`, `vendureOrderState`, `vendureCurrencyCode`, `vendureTotalWithTax`.
- Vendure Order custom fields: `localOrderId`, `source`, `contactMethod`, `deliveryMethod`, `managerStatus`, `customerComment`.
- Admin endpoint для просмотра связанного Vendure order:
  - `GET /api/admin/shop/orders/:id/commerce`
- Admin endpoint для действий:
  - `POST /api/admin/shop/orders/:id/commerce/actions`
  - `action: "note"`
  - `action: "transition"`
  - `action: "manual-payment"`
  - `action: "fulfill"`
  - `action: "cancel"`
- Исправлен локальный update order status.
- Исправлен `product.id` для OpenSearch-товаров, чтобы корзина не ломалась после перехода каталога на индекс.

## Осталось после 80%

- Реальный online payment provider вместо `dummyPaymentHandler` / manager confirmation.
- Полный customer account: регистрация, история заказов, адреса.
- Кастомная админка менеджера вместо ручных REST endpoints.
- Возвраты/refunds/cancellations в UI.
- Импорт реального прайса и фото.
- Vendure migrations для production custom fields.
- RAG ingestion и AI-подбор по каталогу.
- CI/CD, monitoring, HTTPS, private network, secrets rotation.

## Широкий промт для следующего агента

Ты работаешь с проектом `D:\DEV\Magazin`, магазин "Мир Сальников". Нужно развивать Vendure commerce. Текущее состояние:

1. Vendure 3.6.4 живёт в `vendure-svet`.
2. Backend "Свет" живёт в `BOT TG/backend`.
3. Frontend живёт в `src`.
4. Docker compose в `infra/docker-compose.yml`.
5. Каталог импортируется в Vendure через `POST /api/admin/integrations/vendure/import-seed`.
6. OpenSearch индекс `catalog_products` используется витриной.
7. Заказы с сайта создают локальный order и Vendure Draft Order.
8. Перед оформлением нужно использовать quote из Vendure, а не доверять фронтовой сумме.
9. Менеджерская схема оплаты: клиент оставляет заказ, менеджер подтверждает наличие и цену, затем согласует оплату/получение.

Следующая цель: довести commerce до production-like состояния. Приоритеты:

1. Поднять Docker stack и проверить Vendure Admin/Shop API.
2. Запустить импорт каталога и reindex.
3. Протестировать quote endpoint.
4. Протестировать создание заказа и сохранение Vendure code.
5. Протестировать admin actions: note, transition, manual-payment, fulfill, cancel.
6. Если Vendure custom fields не появились, собрать `vendure-svet` и подготовить migration.
7. Добавить UI менеджера для заказов.
8. Подключить Telegram actions к admin endpoints.
9. Подготовить RAG ingestion из Vendure snapshots.

Правило: не добавлять онлайн-эквайринг, пока не готов manager-confirmation flow. Для этого магазина важнее точный подбор, наличие и быстрый контакт с менеджером.
