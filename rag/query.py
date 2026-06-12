from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import chromadb
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from rag_layers import DEFAULT_EMBEDDING_MODEL, normalize_layers, rerank_score, resolve_collection_name


DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"


def configure_output_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search Developer, Business or Product RAG context.")
    parser.add_argument("question", help="Question to search in the local knowledge base.")
    parser.add_argument("--layer", default="developer", help="Layer or comma-separated layers. Default: developer.")
    parser.add_argument("--visibility", help="Optional metadata visibility filter: public or internal.")
    parser.add_argument("--db-dir", type=Path, default=DEFAULT_DB_DIR, help="Local ChromaDB persistence folder.")
    parser.add_argument("--k", type=int, default=5, help="Number of chunks to return.")
    parser.add_argument("--model", default=DEFAULT_EMBEDDING_MODEL, help="SentenceTransformer embedding model.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    return parser.parse_args()


def collection_names(db_dir: Path) -> set[str]:
    client = chromadb.PersistentClient(path=str(db_dir))
    return {
        collection.name if hasattr(collection, "name") else str(collection)
        for collection in client.list_collections()
    }


def main() -> None:
    configure_output_encoding()
    args = parse_args()
    db_dir = args.db_dir.resolve()
    if not db_dir.exists():
        raise SystemExit(f"Vector DB not found: {db_dir}\nRun: python ingest.py")

    try:
        layers = normalize_layers(args.layer)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    existing_collections = collection_names(db_dir)
    resolved_collections = {}
    for layer in layers:
        collection_name, _ = resolve_collection_name(db_dir, layer, existing_collections)
        resolved_collections[layer] = collection_name
    missing_layers = [layer for layer in layers if resolved_collections[layer] not in existing_collections]
    if missing_layers:
        commands = ", ".join(f"python ingest.py --layer {layer}" for layer in missing_layers)
        raise SystemExit(f"Missing RAG layers: {', '.join(missing_layers)}. Run: {commands}")

    embeddings = HuggingFaceEmbeddings(model_name=args.model)
    filter_value = {"visibility": args.visibility} if args.visibility else None
    candidates = []
    candidate_count = max(args.k * 4, 20)
    for layer in layers:
        vector_store = Chroma(
            persist_directory=str(db_dir),
            embedding_function=embeddings,
            collection_name=resolved_collections[layer],
        )
        for document, score in vector_store.similarity_search_with_score(
            args.question,
            k=candidate_count,
            filter=filter_value,
        ):
            candidates.append(
                {
                    "score": rerank_score(args.question, document.page_content, float(score)),
                    "vectorScore": float(score),
                    "layer": layer,
                    "source": document.metadata.get("source", "unknown"),
                    "content": document.page_content.strip(),
                    "metadata": document.metadata,
                }
            )

    candidates.sort(key=lambda item: item["score"])
    results = candidates[: args.k]
    for index, result in enumerate(results, start=1):
        result["rank"] = index

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    print(f"Question: {args.question}")
    print(f"Layers: {', '.join(layers)}")
    print(f"Top chunks: {len(results)}\n")
    for result in results:
        print(
            f"[{result['rank']}] {result['layer']} | {result['source']} | "
            f"score: {result['score']:.4f}\n{result['content']}\n\n---\n"
        )


if __name__ == "__main__":
    main()
