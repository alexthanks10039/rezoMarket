from __future__ import annotations

from pathlib import Path
from typing import Any

import chromadb
from fastapi import FastAPI, Query
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings


DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"
COLLECTION_NAME = "mir_salnikov_project_knowledge"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

app = FastAPI(title="Svet Shop RAG API", version="0.1.0")


def get_index_status() -> dict[str, Any]:
    if not DEFAULT_DB_DIR.exists():
        return {
            "ok": False,
            "status": "index_not_ready",
            "message": "Vector DB not found. Run `python ingest.py` before querying RAG.",
            "collection": COLLECTION_NAME,
            "documentCount": 0,
        }

    try:
        client = chromadb.PersistentClient(path=str(DEFAULT_DB_DIR))
        collection_names = [
            collection.name if hasattr(collection, "name") else str(collection)
            for collection in client.list_collections()
        ]
        if COLLECTION_NAME not in collection_names:
            return {
                "ok": False,
                "status": "collection_missing",
                "message": f"RAG collection `{COLLECTION_NAME}` is missing. Rebuild the vector index.",
                "collection": COLLECTION_NAME,
                "documentCount": 0,
            }

        collection = client.get_collection(COLLECTION_NAME)
        document_count = collection.count()
        if document_count < 1:
            return {
                "ok": False,
                "status": "index_empty",
                "message": "RAG collection exists but does not contain indexed chunks.",
                "collection": COLLECTION_NAME,
                "documentCount": document_count,
            }

        return {
            "ok": True,
            "status": "ready",
            "message": "RAG index is ready.",
            "collection": COLLECTION_NAME,
            "documentCount": document_count,
        }
    except Exception as error:
        return {
            "ok": False,
            "status": "index_error",
            "message": str(error),
            "collection": COLLECTION_NAME,
            "documentCount": 0,
        }


def search_context(question: str, k: int = 5) -> dict[str, Any]:
    index_status = get_index_status()
    if not index_status["ok"]:
        return {
            **index_status,
            "items": [],
        }

    try:
        embeddings = HuggingFaceEmbeddings(model_name=DEFAULT_EMBEDDING_MODEL)
        vector_store = Chroma(
            persist_directory=str(DEFAULT_DB_DIR),
            embedding_function=embeddings,
            collection_name=COLLECTION_NAME,
        )

        results = vector_store.similarity_search_with_score(question, k=k)
        return {
            **index_status,
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
    except Exception as error:
        return {
            "ok": False,
            "status": "query_error",
            "message": str(error),
            "collection": COLLECTION_NAME,
            "items": [],
        }


@app.get("/health")
def health() -> dict[str, Any]:
    index_status = get_index_status()
    return {
        "ok": True,
        "service": "svet-rag-api",
        "indexReady": index_status["ok"],
        "index": index_status,
    }


@app.get("/query")
def query(q: str = Query(..., min_length=1), k: int = Query(5, ge=1, le=20)) -> dict[str, Any]:
    return search_context(q, k)
