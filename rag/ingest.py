from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOCS_DIR = PROJECT_ROOT / "docs"
DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"
ROOT_PROJECT_FILES = [PROJECT_ROOT / "PROJECT_ANALYSIS.md"]
COLLECTION_NAME = os.getenv("RAG_COLLECTION_NAME", "mir_salnikov_project_knowledge")
SUPPORTED_EXTENSIONS = {".md", ".txt"}
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def configure_output_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Index local project docs into ChromaDB.")
    parser.add_argument("--docs-dir", type=Path, default=DEFAULT_DOCS_DIR, help="Folder with .md/.txt documents.")
    parser.add_argument("--db-dir", type=Path, default=DEFAULT_DB_DIR, help="Local ChromaDB persistence folder.")
    parser.add_argument("--chunk-size", type=int, default=900, help="Chunk size in characters.")
    parser.add_argument("--chunk-overlap", type=int, default=160, help="Chunk overlap in characters.")
    parser.add_argument("--append", action="store_true", help="Append to the existing vector DB instead of rebuilding it.")
    parser.add_argument("--model", default=DEFAULT_EMBEDDING_MODEL, help="SentenceTransformer embedding model.")
    return parser.parse_args()


def read_documents(docs_dir: Path) -> list[Document]:
    if not docs_dir.exists():
        raise FileNotFoundError(f"Docs folder not found: {docs_dir}")

    documents: list[Document] = []
    document_paths = sorted(docs_dir.rglob("*")) + ROOT_PROJECT_FILES

    for path in sorted(set(document_paths)):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue

        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": str(path.relative_to(PROJECT_ROOT)),
                    "filename": path.name,
                },
            )
        )

    return documents


def reset_database(db_dir: Path) -> None:
    resolved_db = db_dir.resolve()
    resolved_project = PROJECT_ROOT.resolve()
    if resolved_db == resolved_project or resolved_project not in resolved_db.parents:
        raise ValueError(f"Refusing to delete a path outside the project: {resolved_db}")

    if db_dir.exists():
        shutil.rmtree(db_dir)


def main() -> None:
    configure_output_encoding()
    args = parse_args()
    docs_dir = args.docs_dir.resolve()
    db_dir = args.db_dir.resolve()

    documents = read_documents(docs_dir)
    if not documents:
        raise SystemExit(f"No supported documents found in {docs_dir}. Add .md or .txt files first.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        separators=["\n## ", "\n### ", "\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(documents)

    if not args.append:
        reset_database(db_dir)

    embeddings = HuggingFaceEmbeddings(model_name=args.model)
    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(db_dir),
        collection_name=COLLECTION_NAME,
    )

    print(f"Indexed documents: {len(documents)}")
    print(f"Indexed chunks: {len(chunks)}")
    print(f"Vector DB: {db_dir}")
    print(f"Collection: {COLLECTION_NAME}")


if __name__ == "__main__":
    main()

