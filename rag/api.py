from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
from fastapi import FastAPI, Query
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from pydantic import BaseModel, Field

from rag_layers import (
    DEFAULT_EMBEDDING_MODEL,
    RAG_LAYERS,
    normalize_layers,
    rerank_score,
    resolve_collection_name,
)


DEFAULT_DB_DIR = Path(os.getenv("RAG_DB_DIR", Path(__file__).resolve().parent / "chroma_db"))

app = FastAPI(title="Svet Shop RAG API", version="0.2.0")


@lru_cache(maxsize=1)
def get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=DEFAULT_EMBEDDING_MODEL)


@app.on_event("startup")
def warm_up_embeddings() -> None:
    get_embeddings()


class QueryRequest(BaseModel):
    question: str = Field(min_length=1)
    layers: list[str] = Field(default_factory=lambda: ["developer"])
    visibility: str | None = None
    limit: int = Field(default=5, ge=1, le=20)


def collection_names(client: chromadb.ClientAPI) -> set[str]:
    return {
        collection.name if hasattr(collection, "name") else str(collection)
        for collection in client.list_collections()
    }


def get_layer_status(layer: str) -> dict[str, Any]:
    layer_config = RAG_LAYERS[layer]
    if not DEFAULT_DB_DIR.exists():
        return {
            "ok": False,
            "status": "index_not_ready",
            "message": "Vector DB not found. Run `python ingest.py` before querying RAG.",
            "layer": layer,
            "collection": layer_config.collection,
            "documentCount": 0,
        }

    try:
        client = chromadb.PersistentClient(path=str(DEFAULT_DB_DIR))
        existing_names = collection_names(client)
        collection_name, legacy_fallback = resolve_collection_name(DEFAULT_DB_DIR, layer, existing_names)
        if collection_name not in existing_names:
            return {
                "ok": False,
                "status": "collection_missing",
                "message": f"RAG collection `{layer_config.collection}` is missing.",
                "layer": layer,
                "collection": layer_config.collection,
                "documentCount": 0,
            }

        collection = client.get_collection(collection_name)
        document_count = collection.count()
        if document_count < 1:
            return {
                "ok": False,
                "status": "index_empty",
                "message": f"RAG collection `{layer_config.collection}` is empty.",
                "layer": layer,
                "collection": collection_name,
                "documentCount": 0,
            }

        return {
            "ok": True,
            "status": "ready",
            "message": f"{layer.capitalize()} RAG index is ready.",
            "layer": layer,
            "collection": collection_name,
            "documentCount": document_count,
            "legacyFallback": legacy_fallback,
        }
    except Exception as error:
        return {
            "ok": False,
            "status": "index_error",
            "message": str(error),
            "layer": layer,
            "collection": layer_config.collection,
            "documentCount": 0,
        }


def get_index_status(layer: str = "developer") -> dict[str, Any]:
    """Legacy-compatible status helper for the default Developer RAG layer."""
    return get_layer_status(layer)


def search_layer(
    question: str,
    layer: str,
    k: int,
    embeddings: HuggingFaceEmbeddings,
    visibility: str | None,
) -> list[dict[str, Any]]:
    layer_status = get_layer_status(layer)
    if not layer_status["ok"]:
        return []

    vector_store = Chroma(
        persist_directory=str(DEFAULT_DB_DIR),
        embedding_function=embeddings,
        collection_name=layer_status["collection"],
    )
    filter_value = {"visibility": visibility} if visibility else None
    candidate_count = max(k * 4, 20)
    results = vector_store.similarity_search_with_score(question, k=candidate_count, filter=filter_value)
    return [
        {
            "score": rerank_score(question, document.page_content, float(score)),
            "vectorScore": float(score),
            "layer": layer,
            "source": document.metadata.get("source", "unknown"),
            "content": document.page_content.strip(),
            "metadata": document.metadata,
        }
        for document, score in results
    ]
def search_context(
    question: str,
    k: int = 5,
    layers: str | list[str] | None = None,
    visibility: str | None = None,
) -> dict[str, Any]:
    try:
        selected_layers = normalize_layers(layers)
    except ValueError as error:
        return {
            "ok": False,
            "status": "invalid_layer",
            "message": str(error),
            "collection": None,
            "documentCount": 0,
            "items": [],
        }

    statuses = {layer: get_layer_status(layer) for layer in selected_layers}
    ready_layers = [layer for layer, status in statuses.items() if status["ok"]]
    primary_status = statuses[selected_layers[0]]
    if not ready_layers:
        return {
            **primary_status,
            "layers": statuses,
            "items": [],
        }

    try:
        embeddings = get_embeddings()
        candidates: list[dict[str, Any]] = []
        for layer in ready_layers:
            candidates.extend(search_layer(question, layer, k, embeddings, visibility))
        candidates.sort(key=lambda item: item["score"])
        items = candidates[:k]
        for rank, item in enumerate(items, start=1):
            item["rank"] = rank
        return {
            "ok": True,
            "status": "ready",
            "message": "RAG query completed.",
            "collection": primary_status["collection"],
            "documentCount": sum(status["documentCount"] for status in statuses.values()),
            "layers": statuses,
            "items": items,
        }
    except Exception as error:
        return {
            "ok": False,
            "status": "query_error",
            "message": str(error),
            "collection": primary_status["collection"],
            "documentCount": sum(status["documentCount"] for status in statuses.values()),
            "layers": statuses,
            "items": [],
        }


@app.get("/health")
def health() -> dict[str, Any]:
    layers = {layer: get_layer_status(layer) for layer in RAG_LAYERS}
    legacy_index = layers["developer"]
    return {
        "ok": True,
        "service": "svet-rag-api",
        "indexReady": legacy_index["ok"],
        "index": legacy_index,
        "anyLayerReady": any(status["ok"] for status in layers.values()),
        "layers": layers,
    }


@app.get("/query")
def query(
    q: str = Query(..., min_length=1),
    k: int = Query(5, ge=1, le=20),
    layer: str | None = Query(None),
    layers: str | None = Query(None),
    visibility: str | None = Query(None),
) -> dict[str, Any]:
    selected_layers = layers or layer
    return search_context(q, k=k, layers=selected_layers, visibility=visibility)


@app.post("/query")
def query_post(request: QueryRequest) -> dict[str, Any]:
    return search_context(
        request.question,
        k=request.limit,
        layers=request.layers,
        visibility=request.visibility,
    )
