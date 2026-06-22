from pydantic import BaseModel
from typing import Optional, Any


class EncuestaInput(BaseModel):
    session_id: str
    utilidad: int
    calidad_argumentos: int
    relevancia_contexto: int
    intencion_reuso: int
    confianza_recomendacion: int
    comentario: Optional[str] = ""

# ── Entrada del sistema ───────────────────────────────────────────────────────
class IdeaInput(BaseModel):
    idea_texto: str
    team_id: Optional[str] = None
    insights_exploracion: Optional[dict] = None
    supuestos_evaluados: Optional[list] = None   # veredictos por supuesto para enriquecer el debate

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


# ── SUPUESTOS RIESGOSOS (Testing Business Ideas) ─────────────────────────────

class Supuesto(BaseModel):
    id: str                          # slug único, ej: "adopcion_digital"
    enunciado: str                   # "Creo que los bodegueros prefieren hacer pedidos digitales"
    tipo: str                        # "deseabilidad" | "factibilidad" | "viabilidad" | "adaptabilidad"
    nivel_riesgo: str                # "alto" | "medio" | "bajo"
    por_que_es_riesgoso: str         # explicación de por qué podría estar equivocado
    que_confirmaria: str             # qué evidencia concreta lo validaría
    stakeholders_relevantes: list[str]  # qué stakeholders pueden testearlo

class SupuestosDetectados(BaseModel):
    idea_texto: str
    supuestos: list[Supuesto]
    razonamiento: str

class SupuestoEvaluado(BaseModel):
    supuesto_id: str
    enunciado: str
    tipo: str
    veredicto: str                   # "validado" | "parcial" | "refutado" | "sin_datos"
    evidencia: list[str]             # citas textuales de las entrevistas
    nivel_confianza: float


# ── FASE DE EXPLORACIÓN ───────────────────────────────────────────────────────

# Nodo 0 — Stakeholders
class Stakeholder(BaseModel):
    id: str                     # slug único, ej: "padres_familia"
    nombre: str                 # nombre legible, ej: "Padres de familia"
    descripcion: str            # por qué importa este stakeholder
    relevancia: str             # "alta" | "media" | "baja"
    tipo: str                   # "usuario_final" | "decisor" | "influenciador" | "aliado" | "regulador"
    preguntas_clave: list[str]  # qué debería preguntarle el emprendedor

class StakeholdersDetectados(BaseModel):
    idea_texto: str
    sector: str
    pais: str
    stakeholders: list[Stakeholder]
    razonamiento: str           # por qué se eligieron estos stakeholders

# Nodo 1 — Perfiles por stakeholder
class PerfilSintetico(BaseModel):
    stakeholder_id: str
    stakeholder_nombre: str
    nombre: str
    edad: int
    ubicacion: str
    ocupacion: str
    autopercepcion: str
    creencias_centrales: list[str]
    miedo_oculto: str
    job_funcional: str
    job_emocional: str
    job_social: str
    fricciones: list[str]
    temores: list[str]
    resultado_deseado: str
    forma_de_hablar: dict
    variante_descripcion: str   # qué lo hace distinto de otros perfiles del mismo stakeholder

# Nodo 2 — Conversación
class MensajeConversacion(BaseModel):
    rol: str        # "emprendedor" | "perfil"
    contenido: str

class ConversacionInput(BaseModel):
    perfil: PerfilSintetico
    idea_texto: str
    historial: list[MensajeConversacion]
    pregunta: str

class RespuestaConversacion(BaseModel):
    respuesta: str
    insights_jtbd: Optional[dict] = None   # se extrae cada N turnos

# Nodo 3 — Patrones
class PatronesInput(BaseModel):
    stakeholder_id: str
    stakeholder_nombre: str
    idea_texto: str
    insights_por_perfil: list[dict]         # lista de insights JTBD de cada perfil

class PatronesDetectados(BaseModel):
    stakeholder_id: str
    job_principal: str
    patrones_comunes: list[str]
    divergencias: list[str]
    fricciones_criticas: list[str]
    oportunidad_clave: str
    segmentos_identificados: list[dict]     # sub-grupos dentro del stakeholder


# ── SÍNTESIS DE EXPLORACIÓN ───────────────────────────────────────────────────

class PerfilConversado(BaseModel):
    """Un perfil sintético con su historial de conversación e insights extraídos."""
    nombre: str
    variante_descripcion: str
    ocupacion: str
    historial: list[dict]               # [{rol, contenido}]
    insights_jtbd: Optional[dict] = None

class ConversacionStakeholder(BaseModel):
    """Todas las conversaciones realizadas con los perfiles de un stakeholder."""
    stakeholder_id: str
    stakeholder_nombre: str
    perfiles: list[PerfilConversado]

class SintesisInput(BaseModel):
    """Entrada para el endpoint de síntesis."""
    idea_texto: str
    conversaciones: list[ConversacionStakeholder]
    supuestos: Optional[list] = None   # lista de Supuesto para evaluar contra la evidencia

class JobDetectado(BaseModel):
    stakeholder: str
    job_funcional: str
    job_emocional: str
    job_social: str

class PatronStakeholder(BaseModel):
    stakeholder: str
    patron: str
    evidencia: str                      # cita textual que lo respalda

class SintesisExploracion(BaseModel):
    """Informe de síntesis generado tras la fase de exploración."""
    resumen_problema: str
    jobs_principales: list[dict]
    fricciones_criticas: list[str]
    temores_recurrentes: list[str]
    patrones_por_stakeholder: list[dict]
    oportunidades_detectadas: list[str]
    validacion_problema: str            # "validado" | "parcial" | "no_validado"
    nivel_confianza: float
    recomendacion_siguiente_paso: str
    total_perfiles_entrevistados: int
    total_stakeholders: int
    supuestos_evaluados: Optional[list] = None  # SupuestoEvaluado por supuesto testeado