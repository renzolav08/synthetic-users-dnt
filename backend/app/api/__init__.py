from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.schemas import IdeaInput, ContextoDetectado
from app.services import (
    detectar_contexto,
    buscar_contexto_web,
    generar_todos_los_perfiles,
    ejecutar_debate
)
import json

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
    """
    Nodos 1+2+3+4: pipeline completo.
    Detecta contexto → busca web → genera perfiles → debate adversarial.
    """
    # Nodo 1
    contexto = await detectar_contexto(idea.idea_texto)

    # Nodo 2
    datos_web = await buscar_contexto_web(contexto)

    # Nodo 3
    perfiles = await generar_todos_los_perfiles(contexto, datos_web)

    # Nodo 4
    argumentos = await ejecutar_debate(perfiles, idea.idea_texto, contexto)

    return {
        "contexto": contexto,
        "perfiles": perfiles,
        "debate": argumentos,
        "total_agentes": len(argumentos)
    }


@router.post("/debate-stream")
async def debate_stream(idea: IdeaInput):
    """
    Versión con streaming SSE: devuelve cada argumento
    en tiempo real a medida que los agentes terminan.
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
        yield f"data: {json.dumps({'tipo': 'perfiles_listos', 'data': len(perfiles)})}\n\n"

        # Nodo 4 — cada agente en cuanto termina
        argumentos = []
        tareas = [
            ejecutar_debate([p], idea.idea_texto, contexto)
            for p in perfiles
        ]

        import asyncio
        for tarea in asyncio.as_completed(tareas):
            resultado = await tarea
            argumento = resultado[0]
            argumentos.append(argumento)
            yield f"data: {json.dumps({'tipo': 'argumento', 'data': argumento})}\n\n"

        yield f"data: {json.dumps({'tipo': 'debate_completo', 'total': len(argumentos)})}\n\n"

    return StreamingResponse(
        generar(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )