# Баги и статусы на 2026-06-09

## Легенда статусов

- `Fixed` - исправлено в коде и проверено.
- `Verified` - поведение проверено, код менять не нужно.
- `Open` - подтверждённый баг, требует исправления.
- `Deferred` - не баг текущего этапа, но нужно решить до production.
- `Needs decision` - требуется продуктово-техническое решение.

## Список багов

| ID | Статус | Приоритет | Область | Описание | Комментарий / следующий шаг |
| --- | --- | --- | --- | --- | --- |
| BUG-2026-06-09-001 | Fixed | P1 | Git/GitHub | Push в `origin/main` не проходил из-за расхождения локальной и удалённой истории. | Выполнен rebase поверх `origin/main`, затем обычный push без force-push. Remote history не переписывалась. |
| BUG-2026-06-09-002 | Fixed | P1 | Vendure commerce | Последние фиксы fulfillment/cart behavior нужно было сохранить при переносе локального коммита поверх `origin/main`. | Сохранено в коммите `dbbeece`. Проверять при следующих изменениях order flow. |
| BUG-2026-06-09-003 | Fixed | P2 | Vendure Admin UI | Vendure Admin UI был на английском, пользователю нужна русская админка. | Исправлено конфигурацией Admin UI. Коммит `288081f`. Визуально подтверждено в браузере. |
| BUG-2026-06-09-004 | Verified | P1 | Checkout -> Vendure | Нужно проверить, уходит ли заказ с сайта в Vendure Admin UI. | Проверено визуально: заказ `FWGMFLYQ7CFEBPQ8` появился в `Продажи -> Заказы` со статусом `Черновик`. |
| BUG-2026-06-09-005 | Open | P1 | Money/KZT | В storefront/backend сумма заказа `350 KZT`, а в Vendure Admin UI list отображается `3.50`. | Похоже на конфликт minor units: Vendure отображает цену как minor units / 100. Нужно настроить KZT custom money strategy или хранить цены в minor units согласованно во всём контуре. |
| BUG-2026-06-09-006 | Needs decision | P2 | Vendure Dashboard | Заказ из магазина не отображается в виджете `Последние заказы` на Dashboard. | Заказ создаётся как `Draft`, а стандартный Dashboard показывает placed orders. Нужно решить: переводить такие заказы в placed flow или добавить отдельный dashboard/widget для Draft Orders. |
| BUG-2026-06-09-007 | Deferred | P2 | Backend storage | Локальные заказы, корзины, analytics и leads всё ещё частично живут в in-memory `Map`. | Для production нужен PostgreSQL storage layer/migrations. До перезапуска dev-сервиса данные могут теряться. |
| BUG-2026-06-09-008 | Deferred | P2 | Manager workflow | Менеджерские Vendure actions есть через REST API, но нет полноценного UI для менеджера. | Следующий шаг: отдельная manager-панель или расширение текущей админ-модалки, где видны Vendure code/state/actions. |
| BUG-2026-06-09-009 | Deferred | P3 | AI/RAG | AI/RAG подключён как endpoint/fallback, но ingestion реального каталога и документов не доведён до production. | Нужно сделать регулярный индекс Vendure catalog snapshots + справочные документы по совместимости. |
| BUG-2026-06-09-010 | Deferred | P3 | Production | Dev credentials и env defaults удобны для локальной работы, но не подходят для production. | Перед деплоем заменить secrets, закрыть сервисы private network, включить HTTPS, backup rotation и monitoring. |

## Детали открытых багов

### BUG-2026-06-09-005: отображение суммы KZT как `3.50`

Факт проверки:

- storefront показал `350 ₸`;
- backend commerce endpoint вернул `vendure.order.totalWithTax: 350`;
- Vendure Admin UI в списке заказов показал `3.50`.

Вероятная причина:

Vendure по умолчанию форматирует деньги как minor units с делением на 100. Для KZT в бизнесе магазина цена вводится и показывается как целые тенге. Нужно привести стратегию хранения/отображения к одному правилу.

Варианты решения:

1. Хранить все цены в minor units, то есть `350 ₸` хранить как `35000`, а на storefront форматировать обратно.
2. Настроить custom money/currency formatting для KZT, чтобы `350` отображалось как `350`.
3. Проверить seed/import: возможно, цены импортируются как major units, а Vendure ожидает minor units.

Рекомендуемое действие:

Сначала проверить Vendure seed/import и документацию money strategy, затем выбрать один формат и мигрировать все цены.

### BUG-2026-06-09-006: Draft Orders не видны на Dashboard

Факт проверки:

- заказ `FWGMFLYQ7CFEBPQ8` виден в `Продажи -> Заказы`;
- статус заказа: `Черновик`;
- Dashboard показывает `Нет результатов` в блоке `Последние заказы`.

Комментарий:

Это ожидаемое поведение стандартного Vendure Dashboard для placed orders. Для магазина "Мир Сальников" текущая бизнес-модель специально создаёт manager-confirmation Draft Order. Поэтому это не поломка передачи заказа, а разрыв между стандартным Dashboard Vendure и бизнес-процессом магазина.

Варианты решения:

1. Переводить заказ после формы в state размещённого заказа.
2. Оставлять Draft, но добавить отдельный manager dashboard для черновиков.
3. Добавить кастомный Vendure Admin UI extension/widget для Draft Orders.

Рекомендуемое действие:

Для текущей модели лучше вариант 2: отдельная manager-панель, где Draft Order считается полноценной входящей заявкой.
