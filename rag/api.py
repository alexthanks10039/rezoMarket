from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings


DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"
COLLECTION_NAME = "Мир Сальников_project_knowledge"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

app = FastAPI(title="Svet Shop RAG API", version="0.1.0")


def search_context(question: str, k: int = 5) -> dict[str, Any]:
    if not DEFAULT_DB_DIR.exists():
        return {
            "ok": False,
            "status": "index_not_ready",
            "message": "Vector DB not found. Run `python ingest.py` before querying RAG.",
            "items": [],
        }

    embeddings = HuggingFaceEmbeddings(model_name=DEFAULT_EMBEDDING_MODEL)
    vector_store = Chroma(
        persist_directory=str(DEFAULT_DB_DIR),
        embedding_function=embeddings,
        collection_name=COLLECTION_NAME,
    )

    results = vector_store.similarity_search_with_score(question, k=k)
    return {
        "ok": True,
        "status": "ready",
        "items": [
            {
                "rank": index,
                "score": score,
                "source": document.metadata.get("source", "unknown"),
                "content": document.page_content.strip(),
                "metadata": document.metadata,
            }
            for index, (document, score) in enumerate(results, start=1)
        ],
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "svet-rag-api",
        "indexReady": DEFAULT_DB_DIR.exists(),
    }


@app.get("/query")
def query(q: str = Query(..., min_length=1), k: int = Query(5, ge=1, le=20)) -> dict[str, Any]:
    return search_context(q, k)

