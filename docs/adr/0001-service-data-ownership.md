# ADR-0001: Границы сервисов и владение данными

- Статус: принято
- Дата: 2026-06-12

## Контекст

Проект состоит из storefront, Node.js backend «Свет», Vendure, Python RAG и инфраструктурных хранилищ. Без явных границ цена, заказ, поиск и AI-данные могут иметь несколько конкурирующих источников истины. Это особенно опасно перед переносом локальных сущностей backend из памяти в постоянную базу.

## Решение

| Владелец | Данные и решения |
| --- | --- |
| Vendure | товары, варианты, цены, валюта, клиенты, carts/active orders, orders, payment/shipping/fulfillment state |
| Backend «Свет» | интеграционные связи, Telegram, webhooks, selection workflow, analytics orchestration, OpenSearch/RAG sync jobs |
| Python RAG | документы, chunks, embeddings, retrieval index и RAG query pipeline |
| Storefront | UI state, пользовательский ввод и отображение серверных результатов |

OpenSearch является поисковой проекцией Vendure-каталога. PostgreSQL является постоянным хранилищем Vendure. Redis используется как инфраструктурный cache/coordination слой и не становится источником истины commerce-данных.

Storefront общается только с backend HTTP API. Backend инкапсулирует Vendure, OpenSearch, RAG и Telegram. Vendure возвращает события в backend через подписанные webhooks.

## Следствия

- Итог заказа и валюта всегда подтверждаются Vendure.
- Backend может хранить собственный `localOrderId`, но обязан сохранять устойчивую связь с Vendure order.
- Поисковый индекс можно удалить и восстановить без потери commerce-данных.
- RAG-индекс можно перестроить из первичных документов и product snapshots.
- Миграция backend из памяти должна касаться integration-owned данных и не дублировать Vendure как второй commerce core.
- Изменения межсервисных payload требуют contract tests и обновления `docs/api-contracts-current.md`.

## Не входит в это решение

- выбор ORM и окончательной схемы backend database;
- исправление KZT minor units;
- перевод Draft Order в полноценный checkout/payment flow;
- выбор единственного AI provider;
- реализация миграций и production deployment.
