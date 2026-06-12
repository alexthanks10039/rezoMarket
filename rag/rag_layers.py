from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path


DEFAULT_EMBEDDING_MODEL = os.getenv(
    "RAG_EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
LEGACY_COLLECTION_NAME = os.getenv("RAG_COLLECTION_NAME", "mir_salnikov_project_knowledge")
ACTIVE_COLLECTIONS_FILE = "active_collections.json"


@dataclass(frozen=True)
class RagLayer:
    name: str
    collection: str
    default_visibility: str


RAG_LAYERS = {
    "developer": RagLayer(
        name="developer",
        collection=os.getenv("RAG_DEVELOPER_COLLECTION", "mir_salnikov_developer"),
        default_visibility="internal",
    ),
    "business": RagLayer(
        name="business",
        collection=os.getenv("RAG_BUSINESS_COLLECTION", "mir_salnikov_business"),
        default_visibility="public",
    ),
    "product": RagLayer(
        name="product",
        collection=os.getenv("RAG_PRODUCT_COLLECTION", "mir_salnikov_products"),
        default_visibility="public",
    ),
}


def normalize_layers(value: str | list[str] | tuple[str, ...] | None) -> list[str]:
    if value is None:
        return ["developer"]

    raw_layers = value if isinstance(value, (list, tuple)) else str(value).split(",")
    layers: list[str] = []
    for raw_layer in raw_layers:
        layer = str(raw_layer).strip().lower()
        if not layer:
            continue
        if layer == "all":
            return list(RAG_LAYERS)
        if layer not in RAG_LAYERS:
            allowed = ", ".join(RAG_LAYERS)
            raise ValueError(f"Unknown RAG layer: {layer}. Allowed: {allowed}")
        if layer not in layers:
            layers.append(layer)
    return layers or ["developer"]


def read_active_collections(db_dir: Path) -> dict[str, str]:
    manifest_path = db_dir / ACTIVE_COLLECTIONS_FILE
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        layer: collection
        for layer, collection in payload.items()
        if layer in RAG_LAYERS and isinstance(collection, str) and collection
    }


def write_active_collections(db_dir: Path, collections: dict[str, str]) -> None:
    db_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = db_dir / ACTIVE_COLLECTIONS_FILE
    temporary_path = manifest_path.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(collections, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(manifest_path)


def resolve_collection_name(
    db_dir: Path,
    layer: str,
    existing_names: set[str],
) -> tuple[str, bool]:
    configured_name = RAG_LAYERS[layer].collection
    active_name = read_active_collections(db_dir).get(layer)
    if active_name in existing_names:
        return active_name, False
    if configured_name in existing_names:
        return configured_name, False
    if layer == "developer" and LEGACY_COLLECTION_NAME in existing_names:
        return LEGACY_COLLECTION_NAME, True
    return configured_name, False


def rerank_score(question: str, content: str, vector_score: float) -> float:
    normalized_question = question.lower().replace("х", "x").replace("×", "x")
    normalized_content = content.lower().replace("х", "x").replace("×", "x")
    exact_identifiers = re.findall(r"[a-zа-я]*\d+(?:[-x][a-zа-я0-9]+)+", normalized_question)
    exact_bonus = sum(10.0 for identifier in set(exact_identifiers) if identifier in normalized_content)
    tokens = {token for token in re.findall(r"[a-zа-я0-9]+", normalized_question) if len(token) >= 3}
    token_bonus = min(4.0, sum(0.4 for token in tokens if token in normalized_content))
    return vector_score - exact_bonus - token_bonus
