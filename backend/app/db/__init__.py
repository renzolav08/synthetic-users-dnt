import aiosqlite
import json
import os
import uuid
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", "debates.db")


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS debate_sessions (
                id TEXT PRIMARY KEY,
                idea_texto TEXT NOT NULL,
                contexto_json TEXT,
                veredicto TEXT,
                confianza REAL,
                resumen_ejecutivo TEXT,
                argumentos_json TEXT,
                arbol_json TEXT,
                tokens_in INTEGER DEFAULT 0,
                tokens_out INTEGER DEFAULT 0,
                costo_usd REAL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS survey_responses (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                utilidad INTEGER,
                calidad_argumentos INTEGER,
                relevancia_contexto INTEGER,
                intencion_reuso INTEGER,
                confianza_recomendacion INTEGER,
                comentario TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES debate_sessions(id)
            )
        """)
        await db.commit()


async def save_debate(
    session_id: str,
    idea_texto: str,
    contexto: dict,
    argumentos: list,
    arbol: dict,
    tokens_in: int = 0,
    tokens_out: int = 0,
):
    costo = (tokens_in * 0.0025 + tokens_out * 0.010) / 1000
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO debate_sessions
               (id, idea_texto, contexto_json, veredicto, confianza, resumen_ejecutivo,
                argumentos_json, arbol_json, tokens_in, tokens_out, costo_usd, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                session_id,
                idea_texto,
                json.dumps(contexto, ensure_ascii=False),
                arbol.get("recomendacion"),
                arbol.get("nivel_confianza"),
                arbol.get("resumen_ejecutivo"),
                json.dumps(argumentos, ensure_ascii=False),
                json.dumps(arbol, ensure_ascii=False),
                tokens_in,
                tokens_out,
                round(costo, 6),
                datetime.utcnow().isoformat(),
            ),
        )
        await db.commit()


async def get_debates(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, idea_texto, veredicto, confianza, resumen_ejecutivo, created_at "
            "FROM debate_sessions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_debate(session_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM debate_sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    for field in ("contexto_json", "argumentos_json", "arbol_json"):
        if d.get(field):
            d[field] = json.loads(d[field])
    return d


async def save_encuesta(
    session_id: str,
    utilidad: int,
    calidad_argumentos: int,
    relevancia_contexto: int,
    intencion_reuso: int,
    confianza_recomendacion: int,
    comentario: str = "",
) -> str:
    enc_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO survey_responses
               (id, session_id, utilidad, calidad_argumentos, relevancia_contexto,
                intencion_reuso, confianza_recomendacion, comentario, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                enc_id, session_id, utilidad, calidad_argumentos,
                relevancia_contexto, intencion_reuso, confianza_recomendacion,
                comentario, datetime.utcnow().isoformat(),
            ),
        )
        await db.commit()
    return enc_id
