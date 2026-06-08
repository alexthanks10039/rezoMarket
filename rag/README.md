# Local RAG Knowledge Base

Локальная RAG-база знаний для проекта “Мир Сальников”. Она индексирует документы из `../docs` и `../PROJECT_ANALYSIS.md`, чтобы выдавать релевантные фрагменты по архитектуре магазина, backend-интеграциям, Telegram CRM и будущей Vendure/RAG-схеме.

## Структура

```text
docs/
  project-context.md
  project-changelog.md
rag/
  ingest.py
  query.py
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

По умолчанию скрипт:

- читает `.md` и `.txt` из `../docs`;
- добавляет `../PROJECT_ANALYSIS.md`;
- режет документы на чанки;
- создает embeddings;
- сохраняет ChromaDB в `./chroma_db`.
- использует Chroma collection `mir_salnikov_project_knowledge`.

Повторный запуск пересобирает базу. Чтобы добавить документы без очистки базы:

```powershell
python ingest.py --append
```

## Поиск контекста

```powershell
python query.py "Как устроен backend Мир Сальников?"
```

JSON-вывод для интеграции с другим инструментом:

```powershell
python query.py "Какие данные должен индексировать RAG по товарам?" --json
```

## Хорошие кандидаты для базы

- требования к каталогу;
- правила подбора сальников, подшипников и ремней;
- структура товаров и совместимости;
- решения по Vendure;
- Telegram CRM сценарии;
- product import jobs;
- RAG prompt и retrieval policy.
