"""
Debate multi-agente implementado con LangGraph StateGraph.

Grafo:
  START
    └─► detectar_contexto
          └─► buscar_web
                └─► generar_perfiles
                      └─► debate_agente_0
                            └─► debate_agente_1
                                  └─► ...
                                        └─► debate_agente_N
                                              └─► generar_consenso
                                                    └─► END

Cada nodo de agente produce un argumento independiente con postura asignada
(pro / contra / neutral) antes de la generación, lo que garantiza diversidad
y permite trazar la ejecución en LangSmith.
"""

from __future__ import annotations

import operator
from typing import Annotated, Optional
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, END

from app.schemas import ContextoDetectado
from app.services import (
    detectar_contexto,
    buscar_contexto_web,
    generar_todos_los_perfiles,
    generar_argumento_agente,
    generar_consenso,
    _asignar_posturas_debate,
)


# ── Estado compartido del grafo ───────────────────────────────────────────────
class DebateState(TypedDict):
    # Inputs
    idea_texto: str
    pais: Optional[str]
    session_id: Optional[str]
    insights_exploracion: Optional[dict]

    # Outputs acumulados por nodo
    contexto: Optional[dict]          # ContextoDetectado serializado
    datos_web: Optional[dict]
    perfiles: Optional[list]
    posturas: Optional[list]

    # Argumentos: Annotated con operator.add → cada nodo agrega sin reemplazar
    argumentos: Annotated[list, operator.add]

    consenso: Optional[dict]
    fase_actual: Optional[str]


# ── Nodo 1: Detectar contexto ─────────────────────────────────────────────────
async def nodo_detectar_contexto(state: DebateState) -> dict:
    contexto = await detectar_contexto(
        state["idea_texto"], state.get("pais")
    )
    return {
        "contexto": contexto.model_dump(),
        "fase_actual": "contexto",
    }


# ── Nodo 2: Búsqueda web ──────────────────────────────────────────────────────
async def nodo_buscar_web(state: DebateState) -> dict:
    contexto = ContextoDetectado(**state["contexto"])
    datos_web = await buscar_contexto_web(contexto)
    return {
        "datos_web": datos_web,
        "fase_actual": "datos_web",
    }


# ── Nodo 3: Generar perfiles ──────────────────────────────────────────────────
async def nodo_generar_perfiles(state: DebateState) -> dict:
    contexto = ContextoDetectado(**state["contexto"])
    perfiles = await generar_todos_los_perfiles(
        contexto, state["datos_web"], state.get("session_id")
    )
    perfiles = perfiles[:5]  # hard cap
    posturas = _asignar_posturas_debate(len(perfiles))
    return {
        "perfiles": perfiles,
        "posturas": posturas,
        "argumentos": [],          # inicializar lista vacía
        "fase_actual": "perfiles_listos",
    }


# ── Fábrica de nodos de agente (uno por índice) ───────────────────────────────
def _make_nodo_agente(idx: int):
    """Devuelve una corrutina-nodo que genera el argumento del agente `idx`."""

    async def nodo_agente(state: DebateState) -> dict:
        perfiles = state.get("perfiles") or []
        posturas = state.get("posturas") or []
        if idx >= len(perfiles):
            return {"fase_actual": f"argumento_{idx}_skip"}

        perfil = perfiles[idx]
        postura = posturas[idx] if idx < len(posturas) else "neutral"
        contexto = ContextoDetectado(**state["contexto"])

        argumento = await generar_argumento_agente(
            perfil=perfil,
            idea_texto=state["idea_texto"],
            contexto=contexto,
            insights_exploracion=state.get("insights_exploracion"),
            session_id=state.get("session_id"),
            postura_asignada=postura,
        )
        return {
            "argumentos": [argumento],          # operator.add lo acumula
            "fase_actual": f"argumento_{idx}",
        }

    nodo_agente.__name__ = f"debate_agente_{idx}"
    return nodo_agente


# ── Nodo final: Consenso ──────────────────────────────────────────────────────
async def nodo_generar_consenso(state: DebateState) -> dict:
    contexto = ContextoDetectado(**state["contexto"])
    consenso = await generar_consenso(
        argumentos=state.get("argumentos") or [],
        idea_texto=state["idea_texto"],
        contexto=contexto,
        session_id=state.get("session_id"),
        insights_exploracion=state.get("insights_exploracion"),
    )
    return {
        "consenso": consenso,
        "fase_actual": "consenso",
    }


# ── Constructor del grafo (parametrizable por nº de agentes) ─────────────────
def build_debate_graph(n_agentes: int = 5):
    """
    Construye y compila el StateGraph del debate.

    Estructura secuencial donde cada agente es un nodo independiente,
    lo que permite trazar cada llamada LLM en LangSmith.
    """
    g = StateGraph(DebateState)

    # Nodos estáticos
    g.add_node("detectar_contexto", nodo_detectar_contexto)
    g.add_node("buscar_web", nodo_buscar_web)
    g.add_node("generar_perfiles", nodo_generar_perfiles)
    g.add_node("generar_consenso", nodo_generar_consenso)

    # Nodos de agente dinámicos
    for i in range(n_agentes):
        g.add_node(f"debate_agente_{i}", _make_nodo_agente(i))

    # Aristas
    g.set_entry_point("detectar_contexto")
    g.add_edge("detectar_contexto", "buscar_web")
    g.add_edge("buscar_web", "generar_perfiles")
    g.add_edge("generar_perfiles", "debate_agente_0")

    for i in range(n_agentes - 1):
        g.add_edge(f"debate_agente_{i}", f"debate_agente_{i + 1}")

    g.add_edge(f"debate_agente_{n_agentes - 1}", "generar_consenso")
    g.add_edge("generar_consenso", END)

    return g.compile()


# Singleton — se crea una sola vez al importar el módulo
debate_graph = build_debate_graph(5)
