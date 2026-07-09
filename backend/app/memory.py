"""
Memoria conversacional — delegada a vector_store (pgvector).
Mantiene la misma interfaz pública para no romper los servicios.
"""
from app.vector_store import guardar_turno, recuperar_contexto, limpiar_sesion

__all__ = ["guardar_turno", "recuperar_contexto", "limpiar_sesion"]
