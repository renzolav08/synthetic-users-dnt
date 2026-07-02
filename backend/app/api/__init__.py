from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends
from app.schemas import IdeaInput, ContextoDetectado, ConversacionInput, PatronesInput, SintesisInput, EncuestaInput, ReplicaInput
from app.auth import authenticate_user, create_access_token
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
    generar_audio_tts,
)
from app.db import save_debate, get_debates, get_debate, save_encuesta
from app.rag import indexar_documento, buscar_en_documentos, listar_documentos
import base64
import json
import asyncio
import uuid

router = APIRouter()


@router.post("/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    token = create_access_token({"sub": user["email"], "nombre": user["nombre"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "nombre": user["nombre"],
        "email": user["email"],
    }


@router.post("/auth/verify")
async def verify_token(token_data: dict):
    from app.auth import get_current_user, oauth2_scheme
    from jose import JWTError, jwt
    from app.auth import SECRET_KEY, ALGORITHM, USERS
    try:
        payload = jwt.decode(token_data.get("token", ""), SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        user = USERS.get(email)
        if not user:
            raise HTTPException(status_code=401, detail="Token inválido")
        return {"valid": True, "nombre": user["nombre"], "email": user["email"]}
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/transcribir")
async def endpoint_transcribir(file: UploadFile = File(...)):
    """Transcribe audio usando OpenAI Whisper. Acepta webm/mp4/ogg/wav."""
    from app.services import client
    audio_bytes = await file.read()
    # Rechazar audio demasiado corto — probablemente silencio o ruido
    if len(audio_bytes) < 4000:
        return {"texto": ""}

    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(file.filename or "audio.webm", audio_bytes, file.content_type or "audio/webm"),
        language="es",
        prompt="Conversación en español latinoamericano sobre ideas de negocio, startups y validación de mercado con usuarios reales.",
    )
    return {"texto": response.text}


@router.post("/tts")
async def endpoint_tts(body: dict):
    """
    Convierte texto a PCM16 mono 16 kHz para Simli.
    Body: { "texto": "...", "genero": "masculino|femenino" }
    """
    texto = body.get("texto", "")
    genero = body.get("genero", "masculino")
    if not texto:
        return {"audio_base64": "", "sample_rate": 16000}

    voz_map = {"femenino": "shimmer", "masculino": "onyx"}
    voz = voz_map.get(genero, "alloy")

    pcm, wav = await generar_audio_tts(texto, voz)
    return {
        "audio_base64": base64.b64encode(pcm).decode(),  # PCM16 16kHz para Simli
        "wav_base64": base64.b64encode(wav).decode(),    # WAV 16kHz para reproducción directa
        "sample_rate": 16000,
        "format": "pcm16",
    }


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
        consenso = await generar_consenso(
            argumentos, idea.idea_texto, contexto, session_id,
            insights_exploracion=idea.insights_exploracion,
        )
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
    session_id = getattr(conv, 'session_id', None)

    # Enriquecer pregunta con contexto RAG si hay documentos indexados
    pregunta_enriquecida = conv.pregunta
    if session_id:
        fragmentos = buscar_en_documentos(session_id, conv.pregunta, n=3)
        if fragmentos:
            contexto_rag = "\n".join(f'[Doc: {f["nombre"]}] {f["texto"]}' for f in fragmentos)
            pregunta_enriquecida = f"{conv.pregunta}\n\n[CONTEXTO DE DOCUMENTOS DEL EMPRENDEDOR]\n{contexto_rag}"

    resultado = await conversar_con_perfil(
        perfil=conv.perfil.model_dump(),
        idea_texto=conv.idea_texto,
        historial=[m.model_dump() for m in conv.historial],
        pregunta=pregunta_enriquecida,
        supuestos_activos=conv.supuestos_activos if hasattr(conv, 'supuestos_activos') else None,
        session_id=session_id,
    )
    return resultado


@router.post("/explorar/documento")
async def subir_documento(
    session_id: str,
    file: UploadFile = File(...),
):
    """Sube un documento (PDF o TXT) y lo indexa en ChromaDB para RAG."""
    contenido = await file.read()
    texto = ""

    if file.filename and file.filename.lower().endswith(".pdf"):
        try:
            import io
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(contenido))
            texto = "\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al leer PDF: {e}")
    else:
        try:
            texto = contenido.decode("utf-8", errors="ignore")
        except Exception:
            raise HTTPException(status_code=400, detail="Formato no soportado")

    if not texto.strip():
        raise HTTPException(status_code=400, detail="El documento está vacío o no se pudo extraer texto")

    chunks = indexar_documento(session_id, file.filename or "documento", texto)
    return {"ok": True, "chunks_indexados": chunks, "nombre": file.filename}


@router.get("/explorar/documentos")
async def listar_docs(session_id: str):
    """Lista los documentos indexados para una sesión."""
    return {"documentos": listar_documentos(session_id)}


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


@router.post("/debate/consenso-final")
async def endpoint_consenso_final(body: dict):
    """
    Genera el consenso final tomando en cuenta los argumentos iniciales
    y todas las rondas de réplica del usuario.
    """
    idea_texto = body.get("idea_texto", "")
    contexto_raw = body.get("contexto", {})
    argumentos_iniciales = body.get("argumentos", [])
    rondas = body.get("rondas", [])
    session_id = body.get("session_id")
    insights_exploracion = body.get("insights_exploracion")

    ctx = ContextoDetectado(**contexto_raw)

    # Combinar argumentos iniciales con respuestas de todas las rondas
    todos_argumentos = list(argumentos_iniciales)
    for ronda in rondas:
        for resp in ronda.get("respuestas", []):
            todos_argumentos.append(resp)

    consenso = await generar_consenso(
        todos_argumentos, idea_texto, ctx, session_id,
        insights_exploracion=insights_exploracion,
    )
    return consenso
