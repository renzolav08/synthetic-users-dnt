"""
Módulo de memoria conversacional con ChromaDB.
Guarda y recupera contexto de conversaciones por session_id.
"""
import chromadb
import os
import hashlib

# Cliente persistente — guarda en disco
_client = None
_collection = None

def _get_collection():
    global _client, _collection
    if _collection is None:
        db_path = os.getenv("CHROMA_PATH", "./chroma_db")
        _client = chromadb.PersistentClient(path=db_path)
        _collection = _client.get_or_create_collection(
            name="conversaciones",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _make_id(session_id: str, rol: str, texto: str) -> str:
    h = hashlib.md5(f"{session_id}:{rol}:{texto[:80]}".encode()).hexdigest()
    return h


def guardar_turno(session_id: str, rol: str, texto: str):
    """Guarda un turno de conversación en la memoria vectorial."""
    col = _get_collection()
    doc_id = _make_id(session_id, rol, texto)
    try:
        col.add(
            documents=[texto],
            metadatas=[{"session_id": session_id, "rol": rol}],
            ids=[doc_id],
        )
    except Exception:
        pass  # Si ya existe el id, ignorar


def recuperar_contexto(session_id: str, consulta: str, n: int = 5) -> list[dict]:
    """Recupera los turnos más relevantes para una consulta dentro de la sesión."""
    col = _get_collection()
    try:
        resultados = col.query(
            query_texts=[consulta],
            n_results=min(n, col.count()),
            where={"session_id": session_id},
        )
        if not resultados["documents"]:
            return []
        docs = resultados["documents"][0]
        metas = resultados["metadatas"][0]
        return [{"texto": d, "rol": m["rol"]} for d, m in zip(docs, metas)]
    except Exception:
        return []


def limpiar_sesion(session_id: str):
    """Elimina toda la memoria de una sesión."""
    col = _get_collection()
    try:
        col.delete(where={"session_id": session_id})
    except Exception:
        pass
