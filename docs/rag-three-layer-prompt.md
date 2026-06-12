# Prompt: разделение RAG на три слоя

## Цель

Разделить знания проекта "Мир Сальников" на три логических слоя внутри одного FastAPI/ChromaDB сервиса:

- Developer RAG - архитектура, API, Docker, deploy, changelog и технические решения;
- Business RAG - доставка, оплата, возвраты, оферта, режим работы и правила менеджеров;
- Product RAG - товары, SKU, размеры, материалы, совместимость и аналоги.

## Ограничения

1. Не создавать три отдельных контейнера.
2. Не удалять старые `/health`, `/query`, `ingest.py` и `query.py` сценарии.
3. Старый вызов `python ingest.py` должен продолжать индексировать проектную документацию.
4. Старый `GET /query?q=...&k=5` должен продолжать возвращать `items`.
5. Если RAG пуст или недоступен, backend AI-помощника должен продолжать использовать текущий Gemini/OpenAI/rule-based fallback.
6. Developer RAG нельзя передавать публичному shop assistant.
7. Цена и наличие из Product RAG не являются источником истины; актуальные значения берутся из Vendure/backend.
8. Не менять embedding-модель без отдельной миграции индекса.

## Коллекции

```text
mir_salnikov_developer
mir_salnikov_business
mir_salnikov_products
```

Все коллекции используют модель:

```text
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

## Общая metadata

```json
{
  "layer": "developer | business | product",
  "visibility": "public | internal",
  "source": "docs/project-context.md",
  "filename": "project-context.md",
  "entityType": "document | product",
  "entityId": "optional",
  "sku": "optional",
  "locale": "ru-KZ"
}
```

## Источники

Developer:

- `docs/**/*.md`;
- `docs/**/*.txt`;
- `PROJECT_ANALYSIS.md`.

Business:

- `rag/sources/business/**/*.md`;
- `rag/sources/business/**/*.txt`.

Product:

- `GET /api/shop/products?limit=1000`;
- либо JSON-файл, переданный через `--product-json`.

## Routing

- Артикул, размер, модель, аналог, подшипник, ремень, сальник -> product.
- Доставка, оплата, возврат, самовывоз, график, заказ -> business.
- Смешанный клиентский вопрос -> product + business.
- Архитектура, API, Docker, deploy -> developer, только internal/admin context.

## Проверка готовности

- Python compile проходит.
- Старые endpoints сохраняют поля ответа.
- `/health` дополнительно показывает состояние каждого слоя.
- Backend продолжает отвечать при пустом/недоступном RAG.
- Индексация одного слоя не удаляет две другие коллекции.
- Product ingestion не делает цену или остаток окончательной рекомендацией.
