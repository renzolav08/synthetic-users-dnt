from pydantic import BaseModel
from typing import Optional

# ── Entrada del sistema ───────────────────────────────────────────────────────
class IdeaInput(BaseModel):
    idea_texto: str
    team_id: Optional[str] = None

# ── Contexto detectado por el Nodo 1 ─────────────────────────────────────────
class AgenteConfig(BaseModel):
    rol: str
    tipo: str        # "esencial" o "dinamico"
    peso: float
    categoria: str   # "M" o "E"

class ContextoDetectado(BaseModel):
    sector: str
    pais: str
    region: Optional[str] = None
    idioma: str
    usuarios_objetivo: str
    modelo_negocio: str
    riesgos_detectados: list[str]
    agentes: list[AgenteConfig]