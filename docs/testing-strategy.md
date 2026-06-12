# Стратегия тестирования

Дата фиксации: 2026-06-12.

## Цель текущего этапа

Сначала закрепить существующий commerce-flow исполняемыми тестами, затем менять персистентность, API и бизнес-логику. Тесты этого этапа проверяют взаимодействие реальных локальных сервисов, а не mock-реализацию.

## Интеграционный commerce smoke test

Файл: `BOT TG/backend/test/integration/commerce-flow.test.js`.

Запуск:

```powershell
Set-Location "BOT TG/backend"
npm run test:integration
```

При нестандартных адресах или admin key:

```powershell
$env:INTEGRATION_BACKEND_URL = "http://127.0.0.1:3000"
$env:INTEGRATION_ADMIN_KEY = "your-dev-admin-key"
npm run test:integration
```

Тест последовательно проверяет:

1. каталог поступает из OpenSearch;
2. поиск находит выбранный SKU;
3. checkout quote рассчитывается Vendure в KZT;
4. создаётся реальный тестовый заказ;
5. локальный order сохраняет Vendure id/code/state;
6. Vendure order содержит тот же `localOrderId`;
7. синхронизация OpenSearch завершается и товар остаётся доступен в поиске.

Результат фиксации: `7 passed, 0 failed`.

## Предусловия

- Docker stack запущен из `infra/docker-compose.yml`.
- Frontend, backend, Vendure, PostgreSQL, Redis, OpenSearch и RAG контейнеры работают.
- Vendure seed-каталог импортирован и OpenSearch синхронизирован.
- Backend знает корректный `ADMIN_KEY`.

Тест создаёт настоящий Draft Order в dev-окружении. Если Telegram credentials активны, создание заказа может вызвать настоящее уведомление. Тест нельзя направлять на production без отдельного test channel и механизма очистки.

## Health smoke checks

```powershell
Invoke-WebRequest http://127.0.0.1:4173/ -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/health/deep
Invoke-RestMethod http://127.0.0.1:3002/health
docker compose --env-file infra/.env -f infra/docker-compose.yml exec -T postgres pg_isready
docker compose --env-file infra/.env -f infra/docker-compose.yml exec -T redis redis-cli ping
Invoke-RestMethod http://127.0.0.1:9201/_cluster/health
Invoke-RestMethod http://127.0.0.1:8010/health
```

`/health/deep` проверяет доступность зависимостей, но не заменяет бизнес-сценарий заказа. RAG HTTP health также не означает готовность индекса: нужно отдельно проверять `indexReady=true`.

## Визуальная проверка

После теста открыть `http://127.0.0.1:3002/admin/orders` и проверить:

- код Vendure order;
- клиента `Commerce Integration Test`;
- состояние `Черновик`;
- наличие заказа в списке.

Сумма в текущем Admin UI отображается в minor-unit формате некорректно (`3.50` вместо `350 KZT`). Это известный баг, а не причина падения интеграционного теста.

## Следующие уровни тестов

| Уровень | Что добавить перед миграцией данных |
| --- | --- |
| Unit | нормализация payload, money conversion, webhook signature/idempotency |
| Contract | JSON schema для публичных backend endpoints и Vendure adapter |
| Persistence | restart-тест, миграции, unique constraints и восстановление связей order |
| Failure integration | недоступный Vendure/OpenSearch/RAG, timeout и повтор webhook |
| Browser E2E | каталог → корзина → заказ → Vendure Admin UI |
| CI | отдельный disposable Compose stack, seed, тесты и артефакты логов |

Изменение базы данных разрешается после появления restart/persistence тестов и backup/restore проверки.
