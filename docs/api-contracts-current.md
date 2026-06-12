# Текущие API-контракты

Дата фиксации: 2026-06-12. Это наблюдаемые контракты текущей реализации, а не целевой публичный API.

## Storefront → backend

Базовый префикс: `/api/shop`.

| Метод и путь | Назначение | Существенный результат |
| --- | --- | --- |
| `GET /categories` | категории каталога | список категорий |
| `GET /filters` | доступные фильтры | фасеты/значения фильтров |
| `GET /products` | каталог | `provider`, `items`, `total` |
| `GET /products/:slug` | карточка товара | товар, вариант, цена, наличие |
| `GET /search?q=` | поиск | `success`, `provider`, найденные товары |
| `POST /cart` и cart routes | операции корзины | текущее представление корзины |
| `POST /checkout/quote` | серверный пересчёт | `quote.source=vendure`, итог и `KZT` |
| `POST /orders` | оформление | локальный order и Vendure-связь |
| `POST /selection-request` | заявка на подбор | заявка и integration side effects |
| `POST /analytics` | событие интерфейса | подтверждение приёма |
| `POST /assistant/ask` | AI-помощник | ответ AI или локальный fallback |

Storefront не обращается напрямую к Vendure GraphQL, OpenSearch, PostgreSQL или Python RAG.

## Backend → Vendure

Backend использует Vendure Shop/Admin API для импорта каталога, quote, создания и управления заказом. Точный GraphQL transport инкапсулирован в `src/modules/integrations/vendure/`.

| Операция | Назначение | Зафиксированный контракт |
| --- | --- | --- |
| Import/sync products | создать или обновить товары и варианты | Vendure возвращает product/variant identifiers |
| Checkout quote | пересчитать позиции | источник `vendure`, сумма и валюта |
| Create order | создать Draft Order | `id`, `code`, `state`, `currencyCode`, `totalWithTax` |
| Read commerce link | проверить соответствие заказов | custom field `localOrderId` совпадает с backend order id |
| Transition/fulfillment | действия менеджера | состояние возвращается из Vendure |

Admin endpoint backend для проверки связи:

`GET /api/admin/shop/orders/:localOrderId/commerce`

Он требует admin key и возвращает локальный заказ вместе с данными связанного Vendure order.

## Backend → OpenSearch

| Операция | Контракт |
| --- | --- |
| Catalog read | `/api/shop/products` возвращает `provider=opensearch` |
| Search | `/api/shop/search` возвращает результаты поискового индекса |
| Product sync | `POST /api/admin/integrations/vendure/sync-products` перестраивает/обновляет проекцию |

OpenSearch можно перестроить из commerce-каталога. Он не определяет итог checkout.

## Backend → RAG

Python API доступен по `RAG_SERVICE_URL`. Backend использует его health/sync/rebuild интеграции. Текущее состояние health: сервис доступен, но индекс не готов, потому что Chroma collection отсутствует.

Важно: пользовательский `POST /api/shop/assistant/ask` сейчас может обслуживаться Node AI provider или локальным fallback без обращения к Python RAG. Это текущая особенность, а не целевая граница.

## Vendure → backend webhook

Vendure отправляет события:

- `order.created`;
- `order.stateTransition`.

Получатель: `POST /api/integrations/vendure/webhook`.

Webhook подписывается HMAC secret. Backend проверяет подпись, сопоставляет `localOrderId` и обрабатывает integration side effects. Повторная доставка должна рассматриваться как нормальное поведение внешней системы.

## Зафиксированный тестовый контракт

Интеграционный тест 2026-06-12 подтвердил:

| Поле | Значение |
| --- | --- |
| Local order id | `order_1781215127962_dk7jl2` |
| Vendure code | `LXWY4WQPG4EQ3L76` |
| Vendure state | `Draft` |
| Currency | `KZT` |
| Catalog provider | `opensearch` |

Связь последнего заказа подтверждена через backend/Vendure API после полного перезапуска Docker. Визуальная проверка этого flow ранее также подтвердила отображение клиента `Commerce Integration Test` и состояния `Черновик` в Vendure Admin UI.
