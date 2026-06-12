# Three-layer RAG Knowledge Base

RAG-сервис проекта “Мир Сальников” использует один FastAPI/ChromaDB runtime и три независимые коллекции:

- `developer` - архитектура, API, Docker и документация разработки;
- `business` - правила магазина, доставка, оплата, возвраты и работа менеджера;
- `product` - товары, SKU, размеры, материалы и совместимость.

Developer RAG доступен только для внутренних сценариев. Публичный shop assistant использует только Product и Business RAG.

## Структура

```text
docs/
  project-context.md
  project-changelog.md
rag/
  rag_layers.py
  ingest.py
  query.py
  sources/
    business/
  requirements.txt
  chroma_db/        # создается автоматически и не коммитится
```

## Установка

PowerShell:

```powershell
cd D:\DEV\Magazin\rag
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Первый запуск может скачать embedding-модель `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`. После этого индекс и модель можно использовать локально.

## Индексация документов

```powershell
python ingest.py
```

Старая команда сохранена: по умолчанию она пересобирает Developer RAG из `../docs` и `../PROJECT_ANALYSIS.md`.

Индексация отдельных слоёв:

```powershell
python ingest.py --layer developer
python ingest.py --layer business
python ingest.py --layer product --product-url http://127.0.0.1:3000/api/shop/products?limit=1000
python ingest.py --layer all
```

В Docker:

```powershell
docker exec rezomarket-rag-api python ingest.py --layer developer
docker exec rezomarket-rag-api python ingest.py --layer business
docker exec rezomarket-rag-api python ingest.py --layer product
```

Пересборка одного слоя создаёт новую версионную коллекцию и только после успешной индексации атомарно переключает `active_collections.json`. Другие слои и предыдущая рабочая версия индекса не затрагиваются. Чтобы добавить документы в активную коллекцию:

```powershell
python ingest.py --layer business --append
```

## Поиск контекста

```powershell
python query.py "Как устроен backend Мир Сальников?"
```

Поиск по бизнесу и товарам:

```powershell
python query.py "Можно ли доставить этот сальник?" --layer product,business
```

JSON-вывод для интеграции с другим инструментом:

```powershell
python query.py "Какие данные должен индексировать RAG по товарам?" --layer developer --json
```

HTTP API сохраняет старый вызов:

```text
GET /query?q=Как устроен backend?&k=5
```

Новый смешанный запрос:

```http
POST /query
Content-Type: application/json

{
  "question": "Можно ли доставить этот подшипник?",
  "layers": ["product", "business"],
  "visibility": "public",
  "limit": 5
}
```

## Хорошие кандидаты для базы

- требования к каталогу;
- правила подбора сальников, подшипников и ремней;
- структура товаров и совместимости;
- решения по Vendure;
- Telegram CRM сценарии;
- product import jobs;
- RAG prompt и retrieval policy.
