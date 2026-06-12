# Prompt: быстрый запуск и будущий deploy проекта

## Роль

Ты работаешь с проектом `rezoMarket` / "Мир Сальников". Нужно поддерживать один быстрый bootstrap-скрипт, который:

- поднимает локальную dev-среду за одну команду;
- проверяет Docker, Docker Compose, curl и env;
- создаёт env из шаблона только если env ещё нет;
- запускает Docker Compose stack;
- ждёт health endpoints;
- импортирует seed-каталог в Vendure;
- синхронизирует OpenSearch;
- печатает ссылки, логины и команды диагностики;
- имеет аккуратный режим для server/prod-like запуска без dev-секретов.

## Контекст проекта

Сервисы:

- frontend: `http://127.0.0.1:4173`;
- backend "Свет": `http://127.0.0.1:3000`;
- Vendure: `http://127.0.0.1:3002`;
- RAG API: `http://127.0.0.1:8010`;
- OpenSearch: `http://127.0.0.1:9201`;
- PostgreSQL: container `rezomarket-postgres`;
- Redis: container `rezomarket-redis`.

Compose-файлы:

- local: `infra/docker-compose.yml`;
- production override: `infra/docker-compose.deploy.yml`.

Env-файлы:

- local template: `infra/.env.example`;
- local env: `infra/.env`;
- production template: `infra/.env.production.example`;
- production env: `infra/.env.production`.

Критичные endpoints:

- `GET /health` backend;
- `GET /health/deep` backend;
- `GET /health` Vendure;
- `GET /health` RAG;
- `POST /api/admin/integrations/vendure/import-seed`;
- `POST /api/admin/integrations/vendure/sync-products`.

## Принципы

1. Не добавлять обязательные зависимости вроде `just`, `task`, `gum`, `dotenvx`, если без них можно обойтись.
2. Не перетирать существующие `.env` файлы.
3. Не делать `docker compose down -v` без явного флага пользователя.
4. Не обещать `ready`, если health-check не прошёл.
5. В local/dev режиме разрешены dev-секреты.
6. В server/prod-like режиме запрещены placeholder-секреты и `VENDURE_DB_SYNCHRONIZE=true`.
7. После запуска нужно автоматически импортировать seed-каталог, если пользователь не передал `--skip-seed`.
8. Скрипт должен быть idempotent: повторный запуск не должен ломать уже поднятую среду.

## Рекомендуемая команда

```bash
./quick-start.sh
```

Для сервера:

```bash
./quick-start.sh --mode server --env-file infra/.env.production --with-deploy-override
```

## Open-source tools review

Проверенные варианты:

- `Taskfile` - хороший cross-platform task runner, но требует установки `task`. Документация: https://taskfile.dev/docs/guide
- `just` - удобный command runner, но требует установки `just`. Репозиторий: https://github.com/casey/just
- `gum` - красивый TUI для shell-скриптов, но лишняя зависимость для server bootstrap. Репозиторий: https://github.com/charmbracelet/gum
- `dotenvx` - полезен для encrypted env workflow, но для текущего проекта пока достаточно `.env` + preflight. Репозиторий: https://github.com/dotenvx/dotenvx

Вывод: базовый bootstrap должен оставаться plain Bash. Дополнительные инструменты можно добавить позже как optional developer experience.
