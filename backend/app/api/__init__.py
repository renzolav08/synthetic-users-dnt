from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.schemas import IdeaInput, ContextoDetectado
from app.services import (
    detectar_contexto,
    buscar_contexto_web,
    generar_todos_los_perfiles,
    ejecutar_debate,
    generar_consenso
)
import json
import asyncio

router = APIRouter()


@router.post("/analizar-contexto", response_model=ContextoDetectado)
async def analizar_contexto(idea: IdeaInput):
    """Nodo 1: detecta el contexto de la idea."""
    return await detectar_contexto(idea.idea_texto)


@router.post("/buscar-contexto-web")
async def buscar_web(idea: IdeaInput):
    """Nodo 2: enriquece el contexto con búsqueda web real."""
    contexto = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    return {"contexto": contexto, "datos_web": datos_web}


@router.post("/generar-perfiles")
async def generar_perfiles(idea: IdeaInput):
    """Nodos 1+2+3: detecta contexto, busca web y genera perfiles."""
    contexto = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    perfiles = await generar_todos_los_perfiles(contexto, datos_web)
    return {
        "contexto": contexto,
        "datos_web": datos_web,
        "perfiles": perfiles,
        "total_agentes": len(perfiles)
    }


@router.post("/debate")
async def debate_completo(idea: IdeaInput):
    """Nodos 1+2+3+4: pipeline hasta el debate adversarial."""
    contexto = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    perfiles = await generar_todos_los_perfiles(contexto, datos_web)
    argumentos = await ejecutar_debate(perfiles, idea.idea_texto, contexto)
    return {
        "contexto": contexto,
        "perfiles": perfiles,
        "debate": argumentos,
        "total_agentes": len(argumentos)
    }


@router.post("/evaluar")
async def evaluar_idea(idea: IdeaInput):
    """
    Pipeline COMPLETO — Nodos 1+2+3+4+5:
    Detecta contexto → busca web → genera perfiles →
    debate adversarial → consenso ponderado → árbol de argumentos.
    """
    # Nodo 1
    contexto = await detectar_contexto(idea.idea_texto)

    # Nodo 2
    datos_web = await buscar_contexto_web(contexto)

    # Nodo 3
    perfiles = await generar_todos_los_perfiles(contexto, datos_web)

    # Nodo 4
    argumentos = await ejecutar_debate(perfiles, idea.idea_texto, contexto)

    # Nodo 5
    consenso = await generar_consenso(argumentos, idea.idea_texto, contexto)

    return {
        "idea": idea.idea_texto,
        "contexto": contexto,
        "debate": argumentos,
        "arbol_argumentos": consenso,
        "total_agentes": len(argumentos)
    }


@router.post("/evaluar-stream")
async def evaluar_stream(idea: IdeaInput):
    """
    Pipeline completo con streaming SSE.
    Envía cada etapa en tiempo real al frontend.
    """
    async def generar():
        # Nodo 1
        contexto = await detectar_contexto(idea.idea_texto)
        yield f"data: {json.dumps({'tipo': 'contexto', 'data': contexto.model_dump()})}\n\n"

        # Nodo 2
        datos_web = await buscar_contexto_web(contexto)
        yield f"data: {json.dumps({'tipo': 'datos_web', 'data': datos_web})}\n\n"

        # Nodo 3
        perfiles = await generar_todos_los_perfiles(contexto, datos_web)
        yield f"data: {json.dumps({'tipo': 'perfiles_listos', 'total': len(perfiles)})}\n\n"

        # Nodo 4 — cada agente en cuanto termina
        tareas = [
            ejecutar_debate([p], idea.idea_texto, contexto)
            for p in perfiles
        ]

        argumentos = []
        for coro in asyncio.as_completed(tareas):
            resultado = await coro
            arg = resultado[0]
            argumentos.append(arg)
            yield f"data: {json.dumps({'tipo': 'argumento', 'data': arg})}\n\n"

        # Nodo 5
        consenso = await generar_consenso(argumentos, idea.idea_texto, contexto)
        yield f"data: {json.dumps({'tipo': 'consenso', 'data': consenso})}\n\n"
        yield f"data: {json.dumps({'tipo': 'fin'})}\n\n"

    return StreamingResponse(
        generar(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )