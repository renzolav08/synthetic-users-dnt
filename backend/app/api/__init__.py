from fastapi import APIRouter
from app.schemas import IdeaInput, ContextoDetectado
from app.services import detectar_contexto, buscar_contexto_web

router = APIRouter()

@router.post("/analizar-contexto", response_model=ContextoDetectado)
async def analizar_contexto(idea: IdeaInput):
    """Nodo 1: recibe la idea y devuelve el contexto detectado."""
    contexto = await detectar_contexto(idea.idea_texto)
    return contexto

@router.post("/buscar-contexto-web")
async def buscar_web(idea: IdeaInput):
    """Nodo 2: detecta contexto y lo enriquece con búsqueda web real."""
    contexto = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    return {
        "contexto": contexto,
        "datos_web": datos_web
    }