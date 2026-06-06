from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.schemas import IdeaInput, ContextoDetectado, ConversacionInput, PatronesInput, SintesisInput
from app.services import (
    detectar_contexto,
    buscar_contexto_web,
    generar_todos_los_perfiles,
    ejecutar_debate,
    generar_consenso,
    detectar_stakeholders,
    generar_perfiles_stakeholder,
    conversar_con_perfil,
    detectar_patrones,
    sintetizar_exploracion,
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
    Si se provee insights_exploracion, los agentes del debate los usan como evidencia.
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

        # Nodo 4 — cada agente en cuanto termina, con insights opcionales
        tareas = [
            ejecutar_debate([p], idea.idea_texto, contexto, idea.insights_exploracion)
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
    resultado = await detectar_stakeholders(idea.idea_texto)
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
        pregunta=conv.pregunta
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