from fastapi import APIRouter
from app.schemas import IdeaInput, ContextoDetectado
from app.services import detectar_contexto

router = APIRouter()

@router.post("/analizar-contexto", response_model=ContextoDetectado)
async def analizar_contexto(idea: IdeaInput):
    """
    Nodo 1 del orquestador: recibe la idea y devuelve el contexto detectado.
    """
    contexto = await detectar_contexto(idea.idea_texto)
    return contexto