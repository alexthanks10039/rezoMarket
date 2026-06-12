# Отчёт за 2026-06-09

## Общий статус

Проект "Мир Сальников" доведён до состояния рабочей full-stack dev-сборки:

- storefront открыт на `http://127.0.0.1:4173`;
- backend "Свет" открыт на `http://127.0.0.1:3000`;
- Vendure открыт на `http://127.0.0.1:3002`;
- Vendure Admin UI открыт на `http://127.0.0.1:3002/admin`;
- PostgreSQL, Redis, OpenSearch, RAG и frontend/backend/Vendure поднимаются через Docker Compose.

Commerce-контур сейчас можно считать manager-ready: пользователь оформляет заказ без онлайн-оплаты, backend пересчитывает корзину через Vendure, создаёт локальную заявку и Vendure Draft Order, а менеджер видит заказ в Vendure Admin UI.

## Что сделано сегодня

### Vendure commerce

- Подтверждён подход: Vendure используется как commerce core для товаров, вариантов, цены, валюты, заказов и менеджерских операций.
- Заказ с сайта создаёт локальный order и связанный Vendure Draft Order.
- В локальном заказе сохраняются:
  - `vendureOrderId`;
  - `vendureOrderCode`;
  - `vendureOrderState`;
  - `vendureCurrencyCode`;
  - `vendureTotalWithTax`.
- Добавлены/проверены backend endpoints для менеджера:
  - `GET /api/admin/shop/orders/:id/commerce`;
  - `POST /api/admin/shop/orders/:id/commerce/actions`.
- Поддержаны actions для Vendure order:
  - `note`;
  - `transition`;
  - `manual-payment`;
  - `fulfill`;
  - `cancel`.
- Исправлены последние commerce-фиксы:
  - fulfillment args для Vendure;
  - поведение корзины после оформления заказа.

Коммит: `dbbeece Advance Vendure commerce flow to manager-ready`.

### Vendure Admin UI

- Админка Vendure переведена на русский язык.
- В `vendure-svet/src/vendure-config.ts` настроены:
  - `defaultLanguage: LanguageCode.ru`;
  - `defaultLocale: 'ru-RU'`;
  - `availableLanguages: [LanguageCode.ru]`;
  - `availableLocales: ['ru-RU']`.
- Docker-сервисы Vendure server/worker были пересобраны.
- В браузере подтверждено, что интерфейс админки отображается на русском.

Коммит: `288081f Set Vendure admin UI language to Russian`.

### GitHub

- Разобрана проблема с push в GitHub.
- Причина была не в коде и не в сети, а в форме истории: локальная ветка и `origin/main` разошлись.
- Рабочее решение: rebase локального коммита поверх `origin/main` и обычный `git push origin main` без force-push.
- Пуш был успешно завершён после ручного подтверждения пользователем.
- Текущий `main` синхронизирован с `origin/main`.

### Dev-доступ

- Пользователю переданы основные локальные ссылки:
  - сайт: `http://127.0.0.1:4173`;
  - каталог: `http://127.0.0.1:4173/#/catalog`;
  - корзина: `http://127.0.0.1:4173/#/cart`;
  - помощник: `http://127.0.0.1:4173/#/assistant`;
  - backend health: `http://127.0.0.1:3000/health/deep`;
  - Vendure Admin UI: `http://127.0.0.1:3002/admin`;
  - Vendure Admin API: `http://127.0.0.1:3002/admin-api`;
  - Vendure Shop API: `http://127.0.0.1:3002/shop-api`.
- Dev-логин Vendure:
  - user: `superadmin`;
  - password: `superadmin`.
- В браузере включён сценарий удобного входа в dev-режиме.

### Визуальная проверка заказа

В браузере оформлен тестовый заказ через storefront.

Данные теста:

- local order: `order_1781019396957_nwh9uc`;
- Vendure order id: `11`;
- Vendure code: `FWGMFLYQ7CFEBPQ8`;
- клиент: `Visual Test Admin`;
- телефон: `77001234567`;
- город: `Almaty`;
- товар: `Хомут червячный 20-32 мм`;
- SKU: `CN-CLAMP-2032`;
- сумма storefront/backend: `350 KZT`;
- state в Vendure: `Draft`;
- доставка: `Самовывоз Алматы`.

Результат:

- заказ успешно ушёл с сайта;
- локальный backend связал его с Vendure;
- заказ появился в Vendure Admin UI в разделе `Продажи -> Заказы`;
- на стандартном Vendure Dashboard заказ не появился в блоке "Последние заказы", потому что он находится в состоянии `Draft`.

## Проверки

- `git status --short --branch`: рабочее дерево чистое, `main...origin/main`.
- Vendure Admin UI визуально отображается на русском.
- Заказ визуально виден в Vendure Admin UI orders list.
- Backend admin commerce endpoint вернул связанный Vendure order:
  - `success: true`;
  - `vendure.order.code: FWGMFLYQ7CFEBPQ8`;
  - `vendure.order.state: Draft`;
  - `vendure.order.totalWithTax: 350`;
  - `vendure.order.currencyCode: KZT`.

## Текущая готовность

Оценка на конец дня: примерно 70-75% до manager-ready MVP.

Готово:

- storefront;
- каталог;
- корзина без онлайн-оплаты;
- заявка менеджеру;
- Vendure commerce core;
- Docker dev stack;
- русская Vendure админка;
- визуально проверенная передача заказов в Vendure.

Не готово до production:

- корректное отображение денег KZT в Vendure Admin UI;
- перевод Draft Order в полноценный placed/confirmed order flow;
- отдельная manager-панель под бизнес-процесс "подтвердить наличие -> согласовать оплату -> выдать/доставить";
- persistent storage для локального backend store;
- production secrets, HTTPS, monitoring, backups по расписанию;
- полноценный импорт реального прайса и фото;
- RAG ingestion по реальному каталогу и документации.

## Следующий приоритет

1. Исправить отображение KZT-сумм в Vendure Admin UI / конфигурации валюты.
2. Решить бизнес-логику Draft Order:
   - оставить как менеджерский черновик и добавить отдельный виджет/панель для черновиков;
   - или переводить сайтовые заказы в размещённый order state, чтобы они попадали в стандартные виджеты Vendure Dashboard.
3. Вынести локальные `Map`/in-memory данные backend в PostgreSQL.
4. Добавить manager UI для заказов прямо в проекте "Свет".
5. Подключить Telegram actions к Vendure order actions.
