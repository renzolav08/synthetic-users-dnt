from fastapi import APIRouter
from app.schemas import IdeaInput, ContextoDetectado
from app.services import (
    detectar_contexto,
    buscar_contexto_web,
    generar_todos_los_perfiles
)

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
    """
    Nodos 1 + 2 + 3 completos:
    detecta contexto → busca web → genera perfiles de todos los agentes.
    """
    contexto = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    perfiles = await generar_todos_los_perfiles(contexto, datos_web)

    return {
        "contexto": contexto,
        "datos_web": datos_web,
        "perfiles": perfiles,
        "total_agentes": len(perfiles)
    }