from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import IdeaInput, ContextoDetectado, ConversacionInput, PatronesInput, SintesisInput, EncuestaInput, ReplicaInput
from app.services import (
    detectar_contexto,
    generar_replica_agentes,
    buscar_contexto_web,
    generar_todos_los_perfiles,
    ejecutar_debate,
    generar_consenso,
    detectar_stakeholders,
    generar_perfiles_stakeholder,
    conversar_con_perfil,
    detectar_patrones,
    sintetizar_exploracion,
    detectar_supuestos,
    get_session_tokens,
)
from app.db import save_debate, get_debates, get_debate, save_encuesta
import json
import asyncio
import uuid

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
    argumentos = await ejecutar_debate(
        perfiles, idea.idea_texto, contexto, idea.insights_exploracion
    )
    return {
        "contexto": contexto,
        "perfiles": perfiles,
        "debate": argumentos,
        "total_agentes": len(argumentos)
    }


@router.post("/evaluar")
async def evaluar_idea(idea: IdeaInput):
    """
    Pipeline COMPLETO — Nodos 1+2+3+4+5.
    Acepta insights_exploracion opcionales para enriquecer el debate.
    """
    contexto  = await detectar_contexto(idea.idea_texto)
    datos_web = await buscar_contexto_web(contexto)
    perfiles  = await generar_todos_los_perfiles(contexto, datos_web)
    argumentos = await ejecutar_debate(
        perfiles, idea.idea_texto, contexto, idea.insights_exploracion
    )
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
    Genera session_id, propaga tokens, guarda en DB al finalizar.
    """
    async def generar():
        session_id = str(uuid.uuid4())
        yield f"data: {json.dumps({'tipo': 'session_id', 'session_id': session_id})}\n\n"

        # Nodo 1
        contexto = await detectar_contexto(idea.idea_texto, pais_sugerido=idea.pais)
        yield f"data: {json.dumps({'tipo': 'contexto', 'data': contexto.model_dump()})}\n\n"

        # Nodo 2
        datos_web = await buscar_contexto_web(contexto)
        yield f"data: {json.dumps({'tipo': 'datos_web', 'data': datos_web})}\n\n"

        # Nodo 3
        perfiles = await generar_todos_los_perfiles(contexto, datos_web, session_id)
        yield f"data: {json.dumps({'tipo': 'perfiles_listos', 'total': len(perfiles)})}\n\n"

        # Nodo 4 — cada agente en cuanto termina (con timeout HU-004)
        tareas = [
            ejecutar_debate([p], idea.idea_texto, contexto, idea.insights_exploracion, session_id)
            for p in perfiles
        ]

        argumentos = []
        for coro in asyncio.as_completed(tareas):
            resultado = await coro
            arg = resultado[0]
            argumentos.append(arg)
            yield f"data: {json.dumps({'tipo': 'argumento', 'data': arg})}\n\n"

        # Nodo 5
        consenso = await generar_consenso(argumentos, idea.idea_texto, contexto, session_id)
        yield f"data: {json.dumps({'tipo': 'consenso', 'data': consenso})}\n\n"

        # TA-001/TA-002: guardar sesión en DB con tokens
        try:
            tokens = get_session_tokens(session_id)
            await save_debate(
                session_id=session_id,
                idea_texto=idea.idea_texto,
                contexto=contexto.model_dump(),
                argumentos=argumentos,
                arbol=consenso,
                tokens_in=tokens["tokens_in"],
                tokens_out=tokens["tokens_out"],
            )
        except Exception:
            pass  # no bloquear el stream si falla el guardado

        yield f"data: {json.dumps({'tipo': 'fin'})}\n\n"

    return StreamingResponse(
        generar(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


# ══════════════════════════════════════════════════════════════════════════════
# SUPUESTOS RIESGOSOS — Testing Business Ideas
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/supuestos")
async def endpoint_detectar_supuestos(idea: IdeaInput):
    """
    Extrae los supuestos riesgosos implícitos en la idea del emprendedor.
    Basado en Testing Business Ideas (Bland & Osterwalder).
    Clasifica por tipo: deseabilidad, factibilidad, viabilidad, adaptabilidad.
    Prioriza por nivel de riesgo: alto, medio, bajo.
    """
    resultado = await detectar_supuestos(idea.idea_texto)
    return resultado


# ══════════════════════════════════════════════════════════════════════════════
# FASE DE EXPLORACIÓN — Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/explorar/stakeholders")
async def endpoint_detectar_stakeholders(idea: IdeaInput):
    """
    Nodo 0 — Detección de stakeholders.
    Dado el texto de una idea, devuelve los stakeholders clave con quienes
    el emprendedor debería conversar, ordenados por relevancia.
    """
    resultado = await detectar_stakeholders(idea.idea_texto, pais_sugerido=idea.pais)
    return resultado


@router.post("/explorar/perfiles-stakeholder")
async def endpoint_perfiles_stakeholder(body: dict):
    """
    Nodo 1 — Generación de múltiples perfiles por stakeholder.
    Recibe: idea_texto, stakeholder (objeto), sector, pais, cantidad (3-5).
    Devuelve: lista de perfiles Innogyzer distintos para ese stakeholder.

    Body esperado:
    {
      "idea_texto": "...",
      "stakeholder": { id, nombre, descripcion, tipo, relevancia, preguntas_clave },
      "sector": "...",
      "pais": "...",
      "cantidad": 4
    }
    """
    from app.schemas import Stakeholder

    stakeholder = Stakeholder(**body["stakeholder"])
    datos_web = await buscar_contexto_web(
        type("Ctx", (), {
            "sector": body["sector"],
            "pais": body["pais"],
            "region": None,
            "usuarios_objetivo": stakeholder.nombre,
            "modelo_negocio": "",
        })()
    )
    perfiles = await generar_perfiles_stakeholder(
        stakeholder=stakeholder,
        idea_texto=body["idea_texto"],
        sector=body["sector"],
        pais=body["pais"],
        datos_web=datos_web,
        cantidad=body.get("cantidad", 4)
    )
    return {"stakeholder": stakeholder, "perfiles": perfiles, "total": len(perfiles)}


@router.post("/explorar/conversar")
async def endpoint_conversar(conv: ConversacionInput):
    """
    Nodo 2 — Conversación con un perfil sintético.
    El emprendedor envía una pregunta; el perfil responde en rol.
    Cuando hay historial suficiente (≥4 mensajes), también devuelve insights JTBD.

    Body esperado:
    {
      "perfil": { ...PerfilSintetico completo... },
      "idea_texto": "...",
      "historial": [ {"rol": "emprendedor"|"perfil", "contenido": "..."} ],
      "pregunta": "¿Qué te genera más dudas de este servicio?"
    }
    """
    resultado = await conversar_con_perfil(
        perfil=conv.perfil.model_dump(),
        idea_texto=conv.idea_texto,
        historial=[m.model_dump() for m in conv.historial],
        pregunta=conv.pregunta,
        supuestos_activos=conv.supuestos_activos if hasattr(conv, 'supuestos_activos') else None,
    )
    return resultado


@router.post("/explorar/patrones")
async def endpoint_detectar_patrones(body: PatronesInput):
    """
    Nodo 3 — Detección de patrones por stakeholder.
    Recibe los insights JTBD recolectados de múltiples perfiles del mismo stakeholder
    y devuelve patrones comunes, divergencias y el job principal del segmento.

    Body esperado:
    {
      "stakeholder_id": "padres_familia",
      "stakeholder_nombre": "Padres de familia",
      "idea_texto": "...",
      "insights_por_perfil": [ {...jtbd...}, {...jtbd...} ]
    }
    """
    resultado = await detectar_patrones(
        stakeholder_id=body.stakeholder_id,
        stakeholder_nombre=body.stakeholder_nombre,
        idea_texto=body.idea_texto,
        insights_por_perfil=body.insights_por_perfil
    )
    return resultado


@router.post("/explorar/pipeline-stakeholder")
async def endpoint_pipeline_stakeholder(body: dict):
    """
    Pipeline completo de exploración para UN stakeholder (sin conversación):
    Detección → Perfiles → (devuelve perfiles listos para conversar).

    Body esperado:
    {
      "idea_texto": "...",
      "stakeholder": { id, nombre, descripcion, tipo, relevancia, preguntas_clave },
      "sector": "...",
      "pais": "...",
      "cantidad": 4
    }
    """
    from app.schemas import Stakeholder

    stakeholder = Stakeholder(**body["stakeholder"])

    # Construye un objeto mínimo compatible con buscar_contexto_web
    class _Ctx:
        sector = body["sector"]
        pais = body["pais"]
        region = None
        usuarios_objetivo = stakeholder.nombre
        modelo_negocio = ""

    datos_web = await buscar_contexto_web(_Ctx())

    perfiles = await generar_perfiles_stakeholder(
        stakeholder=stakeholder,
        idea_texto=body["idea_texto"],
        sector=body["sector"],
        pais=body["pais"],
        datos_web=datos_web,
        cantidad=body.get("cantidad", 4)
    )

    return {
        "stakeholder": stakeholder,
        "datos_web": datos_web,
        "perfiles": perfiles,
        "total_perfiles": len(perfiles),
        "preguntas_sugeridas": stakeholder.preguntas_clave
    }


# ── Síntesis de exploración ───────────────────────────────────────────────────
@router.post("/sintetizar-exploracion")
async def endpoint_sintetizar_exploracion(body: SintesisInput):
    """
    Recibe el historial completo de todas las conversaciones de la sesión de exploración
    y devuelve un informe de síntesis estructurado con:
    - Jobs to Be Done por stakeholder
    - Patrones y fricciones comunes
    - Validación del problema
    - Recomendación para el siguiente paso

    Body esperado:
    {
      "idea_texto": "...",
      "conversaciones": [
        {
          "stakeholder_id": "estudiantes",
          "stakeholder_nombre": "Estudiantes universitarios",
          "perfiles": [
            {
              "nombre": "Carlos Mendoza",
              "variante_descripcion": "...",
              "ocupacion": "...",
              "historial": [{"rol": "emprendedor"|"perfil", "contenido": "..."}],
              "insights_jtbd": {...}
            }
          ]
        }
      ]
    }
    """
    sintesis = await sintetizar_exploracion(body)
    return sintesis


# ══════════════════════════════════════════════════════════════════════════════
# HU-006 / TA-001 — Historial de debates
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/historial")
async def endpoint_historial(limit: int = 50):
    """Lista los debates guardados, más reciente primero."""
    debates = await get_debates(limit)
    return {"debates": debates, "total": len(debates)}


@router.get("/historial/{session_id}")
async def endpoint_debate_detalle(session_id: str):
    """Devuelve el debate completo: argumentos, árbol, tokens."""
    debate = await get_debate(session_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate no encontrado")
    return debate


# ══════════════════════════════════════════════════════════════════════════════
# HU-009 — Encuesta de satisfacción post-debate
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/encuesta")
async def endpoint_encuesta(body: EncuestaInput):
    """Guarda la encuesta de satisfacción (5 dimensiones Likert 1-5)."""
    enc_id = await save_encuesta(
        session_id=body.session_id,
        utilidad=body.utilidad,
        calidad_argumentos=body.calidad_argumentos,
        relevancia_contexto=body.relevancia_contexto,
        intencion_reuso=body.intencion_reuso,
        confianza_recomendacion=body.confianza_recomendacion,
        comentario=body.comentario or "",
    )
    return {"ok": True, "encuesta_id": enc_id}


# ── TA-002: consulta de tokens por sesión ────────────────────────────────────
@router.get("/admin/tokens/{session_id}")
async def endpoint_tokens(session_id: str):
    """Devuelve el consumo de tokens de una sesión de debate."""
    from app.services import get_session_tokens
    tokens = get_session_tokens(session_id)
    costo = (tokens["tokens_in"] * 0.0025 + tokens["tokens_out"] * 0.010) / 1000
    return {**tokens, "costo_estimado_usd": round(costo, 6)}


# ══════════════════════════════════════════════════════════════════════════════
# Debate interactivo — réplica del usuario
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/debate/replica")
async def endpoint_replica(body: ReplicaInput):
    """
    SSE stream: el usuario envía una réplica durante el debate.
    Cada agente responde secuencialmente con streaming real.
    """
    async def generar():
        try:
            ctx = ContextoDetectado(**body.contexto)
            # Responder un agente a la vez para streaming real
            for perfil in body.perfiles:
                try:
                    resultados = await generar_replica_agentes(
                        perfiles=[perfil],
                        idea_texto=body.idea_texto,
                        contexto=ctx,
                        replica_usuario=body.replica_usuario,
                        argumentos_previos=body.argumentos_previos,
                        session_id=body.session_id,
                    )
                    if resultados:
                        yield f"data: {json.dumps({'tipo': 'replica_agente', 'data': resultados[0]})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'tipo': 'replica_agente', 'data': {'agente_rol': perfil.get('rol','Agente'), 'argumento': f'[No pudo responder: {str(e)[:60]}]', 'posicion': 'neutral', 'agente_peso': perfil.get('peso', 0.2)}})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'tipo': 'error', 'mensaje': str(e)})}\n\n"
        yield f"data: {json.dumps({'tipo': 'fin_replica'})}\n\n"

    return StreamingResponse(
        generar(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
