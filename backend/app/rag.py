"""
RAG (documentos del usuario) — delegado a vector_store (pgvector).
Mantiene la misma interfaz pública para no romper la API.
"""
from app.vector_store import indexar_documento, buscar_en_documentos, listar_documentos

__all__ = ["indexar_documento", "buscar_en_documentos", "listar_documentos"]
