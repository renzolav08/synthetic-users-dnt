"""
Vector store con pgvector (PostgreSQL).
Reemplaza ChromaDB para persistencia real en Render.

Tablas:
  - memory_vectors   → turnos de conversación por sesión
  - document_vectors → chunks de documentos subidos por el usuario
"""
import os
import hashlib
import logging
import asyncpg
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIM   = 1536

_pool: asyncpg.Pool | None = None
_openai_client: AsyncOpenAI | None = None


def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    # asyncpg requiere postgresql://, Render provee postgres://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def _openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
    return _openai_client


async def _get_pool() -> asyncpg.Pool | None:
    global _pool
    if _pool is not None:
        return _pool
    db_url = _get_database_url()
    if not db_url:
        print("⚠️  DATABASE_URL no configurado — vector store desactivado", flush=True)
        return None
    try:
        print(f"🔌 Conectando a Postgres: {db_url[:50]}...", flush=True)
        _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5, timeout=15)
        print("✅ Pool de Postgres creado correctamente", flush=True)
        return _pool
    except Exception as e:
        print(f"❌ No se pudo conectar a Postgres: {e}", flush=True)
        return None


async def init_tables():
    """Crea extensión pgvector y tablas si no existen. Llamar en startup."""
    pool = await _get_pool()
    if not pool:
        return
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS memory_vectors (
                id          TEXT PRIMARY KEY,
                session_id  TEXT NOT NULL,
                rol         TEXT NOT NULL,
                texto       TEXT NOT NULL,
                embedding   vector({_EMBED_DIM}),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_mem_session ON memory_vectors(session_id)"
        )
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS document_vectors (
                id          TEXT PRIMARY KEY,
                session_id  TEXT NOT NULL,
                nombre      TEXT NOT NULL,
                chunk_idx   INTEGER DEFAULT 0,
                texto       TEXT NOT NULL,
                embedding   vector({_EMBED_DIM}),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_doc_session ON document_vectors(session_id)"
        )
    print("✅ pgvector: tablas listas", flush=True)


async def _embed(texto: str) -> list[float] | None:
    """Genera embedding con OpenAI text-embedding-3-small."""
    try:
        resp = await _openai().embeddings.create(
            model=_EMBED_MODEL,
            input=texto[:8000],
        )
        return resp.data[0].embedding
    except Exception as e:
        logger.warning(f"Error generando embedding: {e}")
        return None


def _vec_str(v: list[float]) -> str:
    """Convierte lista de floats al formato string que pgvector espera: '[0.1,0.2,...]'"""
    return "[" + ",".join(str(x) for x in v) + "]"


# ── Memoria conversacional ────────────────────────────────────────────────────

async def guardar_turno(session_id: str, rol: str, texto: str):
    pool = await _get_pool()
    if not pool:
        return
    embedding = await _embed(texto)
    if embedding is None:
        return
    doc_id = hashlib.md5(f"{session_id}:{rol}:{texto[:80]}".encode()).hexdigest()
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO memory_vectors (id, session_id, rol, texto, embedding)
                VALUES ($1, $2, $3, $4, $5::vector)
                ON CONFLICT (id) DO NOTHING
            """, doc_id, session_id, rol, texto, _vec_str(embedding))
    except Exception as e:
        logger.warning(f"guardar_turno error: {e}")


async def recuperar_contexto(session_id: str, consulta: str, n: int = 5) -> list[dict]:
    pool = await _get_pool()
    if not pool:
        return []
    embedding = await _embed(consulta)
    if embedding is None:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT texto, rol
                FROM memory_vectors
                WHERE session_id = $1
                ORDER BY embedding <=> $2::vector
                LIMIT $3
            """, session_id, _vec_str(embedding), n)
        return [{"texto": r["texto"], "rol": r["rol"]} for r in rows]
    except Exception as e:
        logger.warning(f"recuperar_contexto error: {e}")
        return []


async def limpiar_sesion(session_id: str):
    pool = await _get_pool()
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM memory_vectors WHERE session_id = $1", session_id
            )
    except Exception as e:
        logger.warning(f"limpiar_sesion error: {e}")


# ── RAG — documentos del usuario ─────────────────────────────────────────────

def _chunk_texto(texto: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    chunks, start = [], 0
    while start < len(texto):
        end = min(start + chunk_size, len(texto))
        chunks.append(texto[start:end])
        start += chunk_size - overlap
    return [c.strip() for c in chunks if len(c.strip()) > 50]


async def indexar_documento(session_id: str, nombre: str, texto: str) -> int:
    pool = await _get_pool()
    if not pool:
        return 0
    chunks = _chunk_texto(texto)
    indexados = 0
    for i, chunk in enumerate(chunks):
        embedding = await _embed(chunk)
        if embedding is None:
            continue
        doc_id = hashlib.md5(f"{session_id}:{nombre}:{i}".encode()).hexdigest()
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO document_vectors
                        (id, session_id, nombre, chunk_idx, texto, embedding)
                    VALUES ($1, $2, $3, $4, $5, $6::vector)
                    ON CONFLICT (id) DO NOTHING
                """, doc_id, session_id, nombre, i, chunk, _vec_str(embedding))
            indexados += 1
        except Exception as e:
            logger.warning(f"indexar_documento chunk {i} error: {e}")
    return indexados


async def buscar_en_documentos(session_id: str, consulta: str, n: int = 4) -> list[dict]:
    pool = await _get_pool()
    if not pool:
        return []
    embedding = await _embed(consulta)
    if embedding is None:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT texto, nombre
                FROM document_vectors
                WHERE session_id = $1
                ORDER BY embedding <=> $2::vector
                LIMIT $3
            """, session_id, _vec_str(embedding), n)
        return [{"texto": r["texto"], "nombre": r["nombre"]} for r in rows]
    except Exception as e:
        logger.warning(f"buscar_en_documentos error: {e}")
        return []


async def listar_documentos(session_id: str) -> list[str]:
    pool = await _get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT nombre FROM document_vectors
                WHERE session_id = $1 ORDER BY nombre
            """, session_id)
        return [r["nombre"] for r in rows]
    except Exception as e:
        logger.warning(f"listar_documentos error: {e}")
        return []
