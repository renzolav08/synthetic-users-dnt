"""
RAG — indexación y búsqueda de documentos subidos por el usuario.
Cada documento se asocia a un session_id para aislamiento por sesión.
"""
import chromadb
import os
import hashlib

_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        db_path = os.getenv("CHROMA_PATH", "./chroma_db")
        _client = chromadb.PersistentClient(path=db_path)
        _collection = _client.get_or_create_collection(
            name="documentos",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _chunk_texto(texto: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """Divide el texto en chunks con overlap."""
    chunks = []
    start = 0
    while start < len(texto):
        end = min(start + chunk_size, len(texto))
        chunks.append(texto[start:end])
        start += chunk_size - overlap
    return [c.strip() for c in chunks if len(c.strip()) > 50]


def indexar_documento(session_id: str, nombre: str, texto: str) -> int:
    """Indexa un documento en ChromaDB. Retorna cantidad de chunks indexados."""
    col = _get_collection()
    chunks = _chunk_texto(texto)
    for i, chunk in enumerate(chunks):
        doc_id = hashlib.md5(f"{session_id}:{nombre}:{i}".encode()).hexdigest()
        try:
            col.add(
                documents=[chunk],
                metadatas=[{"session_id": session_id, "nombre": nombre, "chunk": i}],
                ids=[doc_id],
            )
        except Exception:
            pass
    return len(chunks)


def buscar_en_documentos(session_id: str, consulta: str, n: int = 4) -> list[dict]:
    """Recupera fragmentos relevantes de los documentos de la sesión."""
    col = _get_collection()
    try:
        total = col.count()
        if total == 0:
            return []
        resultados = col.query(
            query_texts=[consulta],
            n_results=min(n, total),
            where={"session_id": session_id},
        )
        if not resultados["documents"] or not resultados["documents"][0]:
            return []
        docs = resultados["documents"][0]
        metas = resultados["metadatas"][0]
        return [{"texto": d, "nombre": m["nombre"]} for d, m in zip(docs, metas)]
    except Exception:
        return []


def listar_documentos(session_id: str) -> list[str]:
    """Lista los nombres de documentos indexados en la sesión."""
    col = _get_collection()
    try:
        res = col.get(where={"session_id": session_id})
        nombres = {m["nombre"] for m in res["metadatas"]}
        return sorted(nombres)
    except Exception:
        return []
