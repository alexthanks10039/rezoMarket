from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import chromadb
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from rag_layers import (
    DEFAULT_EMBEDDING_MODEL,
    RAG_LAYERS,
    normalize_layers,
    read_active_collections,
    resolve_collection_name,
    write_active_collections,
)


PROJECT_ROOT = Path(os.getenv("RAG_PROJECT_ROOT", Path(__file__).resolve().parents[1])).resolve()
DEFAULT_DOCS_DIR = PROJECT_ROOT / "docs"
DEFAULT_BUSINESS_DIR = Path(__file__).resolve().parent / "sources" / "business"
DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"
ROOT_PROJECT_FILES = [PROJECT_ROOT / "PROJECT_ANALYSIS.md"]
SUPPORTED_EXTENSIONS = {".md", ".txt"}
DEFAULT_PRODUCT_URL = os.getenv(
    "RAG_PRODUCT_SOURCE_URL",
    "http://127.0.0.1:3000/api/shop/products?limit=1000",
)


def configure_output_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Index Developer, Business and Product RAG layers into ChromaDB.")
    parser.add_argument(
        "--layer",
        default="developer",
        choices=[*RAG_LAYERS, "all"],
        help="Layer to index. The default keeps the legacy project-docs workflow.",
    )
    parser.add_argument("--docs-dir", type=Path, default=DEFAULT_DOCS_DIR, help="Developer .md/.txt folder.")
    parser.add_argument("--business-dir", type=Path, default=DEFAULT_BUSINESS_DIR, help="Business .md/.txt folder.")
    parser.add_argument("--product-json", type=Path, help="Optional Product RAG JSON source.")
    parser.add_argument("--product-url", default=DEFAULT_PRODUCT_URL, help="Backend products endpoint.")
    parser.add_argument("--db-dir", type=Path, default=DEFAULT_DB_DIR, help="ChromaDB persistence folder.")
    parser.add_argument("--chunk-size", type=int, default=900, help="Chunk size in characters.")
    parser.add_argument("--chunk-overlap", type=int, default=160, help="Chunk overlap in characters.")
    parser.add_argument("--append", action="store_true", help="Append instead of replacing the selected collection.")
    parser.add_argument("--model", default=DEFAULT_EMBEDDING_MODEL, help="SentenceTransformer embedding model.")
    return parser.parse_args()


def iter_supported_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS)


def read_text_documents(paths: list[Path], layer: str, visibility: str) -> list[Document]:
    documents: list[Document] = []
    for path in sorted(set(paths)):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue
        try:
            source = str(path.relative_to(PROJECT_ROOT))
        except ValueError:
            source = str(path)
        documents.append(
            Document(
                page_content=text,
                metadata={
                    "layer": layer,
                    "visibility": visibility,
                    "source": source,
                    "filename": path.name,
                    "entityType": "document",
                    "locale": "ru-KZ",
                },
            )
        )
    return documents


def read_developer_documents(docs_dir: Path) -> list[Document]:
    return read_text_documents(
        iter_supported_files(docs_dir) + ROOT_PROJECT_FILES,
        layer="developer",
        visibility="internal",
    )


def read_business_documents(business_dir: Path) -> list[Document]:
    return read_text_documents(
        iter_supported_files(business_dir),
        layer="business",
        visibility="public",
    )


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_json(url: str) -> Any:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "mir-salnikov-rag-ingest/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_product_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "products", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if item not in (None, ""))
    if isinstance(value, dict):
        return ", ".join(f"{key}: {item}" for key, item in value.items() if item not in (None, ""))
    return str(value)


def product_to_document(product: dict[str, Any]) -> Document:
    title = product.get("title") or product.get("name") or "Товар без названия"
    product_id = product.get("variantId") or product.get("id") or product.get("productId") or product.get("slug") or title
    sku = text_value(product.get("sku"))
    fields = [
        f"Название: {title}",
        f"SKU/артикул: {sku}" if sku else "",
        f"Категория: {text_value(product.get('category'))}",
        f"Описание: {text_value(product.get('description'))}",
        f"Размер: {text_value(product.get('size'))}",
        f"Бренд: {text_value(product.get('brand'))}",
        f"Материал: {text_value(product.get('material'))}",
        f"Тип техники: {text_value(product.get('applianceType'))}",
        f"Совместимость: {text_value(product.get('compatibility'))}",
        f"Ключевые слова: {text_value(product.get('searchKeywords'))}",
        f"Цена из последней синхронизации: {text_value(product.get('price'))}",
        f"Наличие из последней синхронизации: {text_value(product.get('inStock'))}",
        "Цена и наличие должны быть повторно проверены через Vendure/backend перед ответом покупателю.",
    ]
    return Document(
        page_content="\n".join(field for field in fields if field and not field.endswith(": ")),
        metadata={
            "layer": "product",
            "visibility": "public",
            "source": "vendure/backend catalog",
            "filename": "product-catalog",
            "entityType": "productVariant",
            "entityId": str(product_id),
            "sku": sku,
            "slug": text_value(product.get("slug")),
            "locale": "ru-KZ",
        },
    )


def read_product_documents(product_json: Path | None, product_url: str) -> list[Document]:
    payload = load_json(product_json.resolve()) if product_json else fetch_json(product_url)
    return [product_to_document(product) for product in extract_product_items(payload)]


def versioned_collection_name(layer: str) -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"{RAG_LAYERS[layer].collection}__{timestamp}_{uuid.uuid4().hex[:8]}"


def split_documents(documents: list[Document], chunk_size: int, chunk_overlap: int) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n## ", "\n### ", "\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(documents)


def index_layer(
    layer: str,
    documents: list[Document],
    db_dir: Path,
    embeddings: HuggingFaceEmbeddings,
    chunk_size: int,
    chunk_overlap: int,
    append: bool,
) -> dict[str, Any]:
    if not documents:
        raise ValueError(f"No documents found for {layer} RAG")
    client = chromadb.PersistentClient(path=str(db_dir))
    existing_names = {
        collection.name if hasattr(collection, "name") else str(collection)
        for collection in client.list_collections()
    }
    if append:
        collection_name, _ = resolve_collection_name(db_dir, layer, existing_names)
    else:
        collection_name = versioned_collection_name(layer)
    chunks = split_documents(documents, chunk_size, chunk_overlap)
    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(db_dir),
        collection_name=collection_name,
        collection_metadata={"layer": layer, "embedding_model": DEFAULT_EMBEDDING_MODEL},
    )
    if not append:
        active_collections = read_active_collections(db_dir)
        active_collections[layer] = collection_name
        write_active_collections(db_dir, active_collections)
    return {
        "layer": layer,
        "collection": collection_name,
        "documents": len(documents),
        "chunks": len(chunks),
    }


def main() -> None:
    configure_output_encoding()
    args = parse_args()
    db_dir = args.db_dir.resolve()
    layers = normalize_layers(args.layer)
    documents_by_layer: dict[str, list[Document]] = {}

    for layer in layers:
        if layer == "developer":
            documents_by_layer[layer] = read_developer_documents(args.docs_dir.resolve())
        elif layer == "business":
            documents_by_layer[layer] = read_business_documents(args.business_dir.resolve())
        elif layer == "product":
            documents_by_layer[layer] = read_product_documents(args.product_json, args.product_url)

    embeddings = HuggingFaceEmbeddings(model_name=args.model)
    results = [
        index_layer(
            layer=layer,
            documents=documents_by_layer[layer],
            db_dir=db_dir,
            embeddings=embeddings,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
            append=args.append,
        )
        for layer in layers
    ]

    print(json.dumps({"ok": True, "vectorDb": str(db_dir), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
