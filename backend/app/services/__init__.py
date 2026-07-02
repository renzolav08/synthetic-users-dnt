from openai import AsyncOpenAI
from tavily import TavilyClient
from app.schemas import (
    ContextoDetectado, Stakeholder, StakeholdersDetectados,
    SintesisInput, SintesisExploracion,
    Supuesto, SupuestosDetectados, SupuestoEvaluado,
)
from dotenv import load_dotenv
import asyncio
import base64
import hashlib
import httpx
import numpy as np
import os
import json
import time

# ── TA-003: Caché de perfiles en memoria ────────────────────────────────────
_perfil_cache: dict[str, tuple[dict, float]] = {}  # key → (perfil, timestamp)
_CACHE_TTL = 86400  # 24 horas

def _cache_get(key: str) -> dict | None:
    entry = _perfil_cache.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return entry[0]
    return None

def _cache_set(key: str, perfil: dict):
    _perfil_cache[key] = (perfil, time.time())

def _perfil_cache_key(sector: str, pais: str, rol: str) -> str:
    raw = f"{sector}|{pais}|{rol}".lower()
    return hashlib.md5(raw.encode()).hexdigest()

# ── TA-002: Conteo de tokens por sesión ─────────────────────────────────────
_token_log: dict[str, dict] = {}

def _log_tokens(session_id: str | None, response, call_type: str):
    if not session_id:
        return
    if session_id not in _token_log:
        _token_log[session_id] = {"tokens_in": 0, "tokens_out": 0, "calls": []}
    u = response.usage
    if not u:
        return
    _token_log[session_id]["tokens_in"] += u.prompt_tokens
    _token_log[session_id]["tokens_out"] += u.completion_tokens
    _token_log[session_id]["calls"].append({
        "type": call_type,
        "in": u.prompt_tokens,
        "out": u.completion_tokens,
    })

def get_session_tokens(session_id: str) -> dict:
    return _token_log.get(session_id, {"tokens_in": 0, "tokens_out": 0, "calls": []})

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))


# ── Foto realista (randomuser.me) ────────────────────────────────────────────
async def _fetch_photo(genero: str) -> str:
    """Devuelve URL de foto real de randomuser.me según género."""
    gender = "female" if genero == "femenino" else "male"
    try:
        async with httpx.AsyncClient(timeout=5.0) as hc:
            r = await hc.get(
                f"https://randomuser.me/api/?gender={gender}&nat=pe,mx,co,es"
            )
            data = r.json()
            return data["results"][0]["picture"]["large"]
    except Exception:
        seed = int(time.time() * 1000) % 9999
        return f"https://api.dicebear.com/9.x/personas/svg?seed={seed}"


# ── TTS → PCM16 a 16 kHz para Simli ──────────────────────────────────────────
def _downsample_pcm(pcm_bytes: bytes, from_rate: int = 24000, to_rate: int = 16000) -> bytes:
    """Remuestrea PCM16 mono de from_rate a to_rate usando numpy."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float64)
    n_out = int(len(samples) * to_rate / from_rate)
    x_old = np.linspace(0, len(samples) - 1, len(samples))
    x_new = np.linspace(0, len(samples) - 1, n_out)
    resampled = np.interp(x_new, x_old, samples).astype(np.int16)
    return resampled.tobytes()


def _pcm_a_wav(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """Envuelve PCM16 mono en un header WAV para reproducción directa en el navegador."""
    import struct
    data_size = len(pcm_bytes)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', data_size + 36, b'WAVE',
        b'fmt ', 16,
        1,           # PCM
        1,           # mono
        sample_rate,
        sample_rate * 2,   # byte rate (16 bits = 2 bytes)
        2,           # block align
        16,          # bits per sample
        b'data', data_size,
    )
    return header + pcm_bytes


async def generar_audio_tts(texto: str, voz: str = "nova") -> tuple[bytes, bytes]:
    """
    Convierte texto a audio via OpenAI TTS.
    Retorna (pcm16_16khz, wav_16khz):
      - pcm16_16khz: PCM16 mono 16kHz para Simli
      - wav_16khz:   WAV 16kHz para reproducción directa en navegador
    """
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voz,
        input=texto,
        response_format="pcm",  # raw PCM16 a 24 kHz
    )
    pcm16 = _downsample_pcm(response.content, 24000, 16000)
    wav = _pcm_a_wav(pcm16, 16000)
    return pcm16, wav


# ── Nodo 1: Detección de contexto ────────────────────────────────────────────
_contexto_cache: dict[str, tuple[ContextoDetectado, float]] = {}

async def detectar_contexto(idea_texto: str, pais_sugerido: str | None = None) -> ContextoDetectado:
    cache_key = hashlib.md5(f"{idea_texto}|{pais_sugerido or ''}".encode()).hexdigest()
    cached = _contexto_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return cached[0]

    pais_instruccion = (
        f'IMPORTANTE: El emprendedor opera en {pais_sugerido}. Usa "{pais_sugerido}" como país, '
        f'genera perfiles y contexto cultural específico para ese país.'
        if pais_sugerido else
        'Infiere el país a partir de la idea o usa el mercado latinoamericano más relevante.'
    )

    prompt = f"""Eres un analizador experto de ideas de negocio.
Analiza la siguiente idea y extrae el contexto estructurado.

IDEA DEL EMPRENDEDOR:
{idea_texto}

{pais_instruccion}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{{
  "sector": "sector principal del negocio",
  "pais": "{pais_sugerido if pais_sugerido else 'país detectado o inferido'}",
  "region": "ciudad o región si se menciona, null si no",
  "idioma": "español",
  "usuarios_objetivo": "descripción del segmento de usuarios principales",
  "modelo_negocio": "tipo de modelo de negocio",
  "riesgos_detectados": ["riesgo 1", "riesgo 2", "riesgo 3"],
  "agentes": [
    {{"rol": "rol específico para este sector", "tipo": "esencial", "peso": 0.20, "categoria": "M o E"}}
  ]
}}

REGLAS PARA LOS AGENTES (genera entre 5 y 7):
- categoria "M" = perspectiva del mercado/usuario/consumidor (habla desde la vivencia)
- categoria "E" = perspectiva de experto/especialista (habla desde el conocimiento técnico)
- SIEMPRE incluye al menos 1 agente "M" que represente al usuario/cliente final con un nombre de rol
  específico para el sector (ej: "Madre trabajadora", "Estudiante universitario", "Dueño de bodega")
- SIEMPRE incluye un agente que evalúe la viabilidad comercial del modelo de negocio
- SIEMPRE incluye un agente técnico que evalúe la factibilidad de implementación
- SIEMPRE incluye un agente que analice el contexto local, cultural y competitivo
- SIEMPRE incluye un agente de riesgos específicos del sector
- AGREGA agentes especializados según el sector:
  * salud/medicina → médico, paciente, regulador sanitario
  * educación → docente, director institucional, estudiante
  * finanzas/fintech → usuario financiero, regulador financiero, analista de crédito
  * retail/comercio → proveedor, operador logístico, consumidor
  * agro/campo → agricultor, distribuidor, técnico agropecuario
  * legal → abogado, cliente, regulador
  * construcción → contratista, propietario, inspector
  * turismo → viajero, operador turístico, gestor local
  * etc. — usa roles que generarán el debate más valioso para ESTA idea específica
- La suma de pesos debe ser exactamente 1.0 (distribúyelos equitativamente entre 4-5 agentes MÁXIMO, nunca más de 5)
- Los roles deben ser CONCRETOS y ESPECÍFICOS para el sector, no genéricos
- NUNCA repitas el mismo rol — todos los roles deben ser únicos y representar perspectivas distintas
- NO incluyas texto fuera del JSON"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=800,
        temperature=0.3
    )

    data = json.loads(response.choices[0].message.content)

    # Deduplicar agentes por rol (conservar el primero de cada rol único)
    vistos: set[str] = set()
    agentes_unicos = []
    for agente in data.get("agentes", []):
        rol = agente.get("rol", "").strip().lower()
        if rol not in vistos:
            vistos.add(rol)
            agentes_unicos.append(agente)
    data["agentes"] = agentes_unicos[:5]

    resultado = ContextoDetectado(**data)
    _contexto_cache[cache_key] = (resultado, time.time())
    return resultado


# ── Nodo 2: Búsqueda web con Tavily ──────────────────────────────────────────
async def buscar_contexto_web(contexto: ContextoDetectado) -> dict:
    queries = [
        f"{contexto.sector} {contexto.pais} tendencias mercado 2024 2025",
        f"consumidor {contexto.usuarios_objetivo} {contexto.pais} comportamiento",
        f"barreras adopcion {contexto.sector} {contexto.pais} problemas",
        f"competidores startups {contexto.sector} {contexto.pais} soluciones alternativas",
    ]

    resultados = {}
    loop = asyncio.get_event_loop()

    for query in queries:
        try:
            result = await loop.run_in_executor(
                None,
                lambda q=query: tavily_client.search(q, max_results=2)
            )
            resultados[query] = [
                {
                    "titulo": r.get("title", ""),
                    "contenido": r.get("content", "")[:300],
                }
                for r in result.get("results", [])
            ]
        except Exception:
            resultados[query] = []

    return await sintetizar_resultados_web(resultados, contexto)


async def sintetizar_resultados_web(
    resultados: dict,
    contexto: ContextoDetectado
) -> dict:
    texto_resultados = ""
    for query, results in resultados.items():
        texto_resultados += f"\nBusqueda: {query}\n"
        for r in results:
            texto_resultados += f"- {r['titulo']}: {r['contenido']}\n"

    prompt = f"""Analiza estos resultados de busqueda web y sintetiza
la informacion mas relevante para crear perfiles de usuarios sinteticos creibles.

CONTEXTO:
- Sector: {contexto.sector}
- Pais: {contexto.pais}
- Usuarios objetivo: {contexto.usuarios_objetivo}

RESULTADOS:
{texto_resultados}

Responde UNICAMENTE con un JSON:
{{
  "tendencias_sector": "2-3 tendencias actuales del sector en el pais",
  "comportamiento_usuario": "como se comporta realmente el usuario objetivo",
  "barreras_reales": ["barrera 1 con evidencia", "barrera 2 con evidencia"],
  "oportunidades": "oportunidades reales detectadas en el mercado",
  "contexto_cultural": "aspectos culturales y locales relevantes",
  "competidores_detectados": ["nombre o descripcion breve del competidor/alternativa 1", "competidor 2"]
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=500,
        temperature=0.3
    )

    return json.loads(response.choices[0].message.content)

# Posturas deterministas por tipo de rol — garantiza consistencia en el veredicto
def _postura_por_rol(rol: str) -> str:
    rol_lower = rol.lower()
    if any(k in rol_lower for k in ["riesgo", "risk"]):
        return "Escéptico ante los riesgos: identifica amenazas críticas y exige evidencia antes de validar."
    if any(k in rol_lower for k in ["técnico", "tecnolog", "developer", "desarrollador", "ingeniero"]):
        return "Neutral técnico: evalúa factibilidad real, señala limitaciones concretas sin sesgo positivo ni negativo."
    if any(k in rol_lower for k in ["negocio", "comercial", "viabilidad", "mercado"]):
        return "Crítico comercial: cuestiona la rentabilidad y sostenibilidad del modelo antes de validar."
    if any(k in rol_lower for k in ["usuario", "cliente", "consumidor", "comprador"]):
        return "Usuario exigente: valora si la solución resuelve su problema real, pero desconfía de promesas sin demostrar."
    if any(k in rol_lower for k in ["contexto", "cultura", "local", "regional"]):
        return "Analítico contextual: evalúa si la solución encaja en el entorno local, cultural y competitivo."
    if any(k in rol_lower for k in ["legal", "regulat", "cumplimiento", "normativa"]):
        return "Cauteloso legal: identifica barreras regulatorias y requisitos de cumplimiento obligatorios."
    if any(k in rol_lower for k in ["crecimiento", "escala", "expansión"]):
        return "Neutral en escala: evalúa el potencial de crecimiento con datos concretos, sin optimismo injustificado."
    # Por defecto: postura neutral-crítica
    return "Neutral crítico: analiza la idea con rigor, señalando tanto fortalezas como debilidades concretas."


# ── Nodo 3: Generación de perfiles sintéticos (protocolo Innogyzer) ───────────
async def generar_perfil_agente(
    agente: dict,
    contexto: ContextoDetectado,
    datos_web: dict,
    session_id: str | None = None,
) -> dict:
    """
    Genera el perfil JSON completo de un agente siguiendo el protocolo
    Innogyzer internamente. El emprendedor nunca ve este proceso.
    """

    es_categoria_m = agente["categoria"] == "M"

    if es_categoria_m:
        seccion_comportamiento = """
[COMPORTAMIENTOS Y PATRONES]
- rutinas_diarias: rutinas típicas del día a día relacionadas con su trabajo/vida
- marcas_productos: marcas o productos que usa habitualmente
- habitos_informacion: cómo consume información (redes, boca a boca, etc.)

[JOBS TO BE DONE]
- job_funcional: la tarea práctica que necesita completar
- job_emocional: el sentimiento que busca alcanzar o evitar
- job_social: cómo quiere ser percibido por otros"""
    else:
        seccion_comportamiento = """
[COMPORTAMIENTOS Y PATRONES - EXPERTO]
- metodologia_trabajo: cómo trabaja y toma decisiones
- fuentes_informacion: qué fuentes consulta para mantenerse actualizado
- enfoque_problemas: cómo aborda la resolución de problemas"""

    postura_fija = _postura_por_rol(agente["rol"])

    prompt = f"""Eres un motor de construcción de perfiles humanos sintéticos de alta fidelidad.

Crea un perfil creíble y detallado para el siguiente rol en el contexto de esta idea de negocio:

ROL DEL AGENTE: {agente["rol"]}
CATEGORIA: {"Consumidor/Usuario (M)" if es_categoria_m else "Experto/Especialista (E)"}

CONTEXTO DEL PROYECTO:
- Sector: {contexto.sector}
- País: {contexto.pais}
- Región: {contexto.region or "no especificada"}
- Usuarios objetivo: {contexto.usuarios_objetivo}
- Modelo de negocio: {contexto.modelo_negocio}

DATOS REALES DEL MERCADO (fundamenta el perfil en esto):
- Tendencias: {datos_web.get("tendencias_sector", "")}
- Comportamiento real: {datos_web.get("comportamiento_usuario", "")}
- Barreras reales: {", ".join(datos_web.get("barreras_reales", []))}
- Contexto cultural: {datos_web.get("contexto_cultural", "")}
- Competidores/alternativas: {", ".join(datos_web.get("competidores_detectados", [])) or "no detectados"}

Responde ÚNICAMENTE con un JSON con esta estructura:
{{
  "genero": "masculino|femenino",
  "nombre": "nombre completo de UNA sola persona (sin 'y', sin 'e', sin parejas), apropiado para {contexto.pais}",
  "edad": número entero entre 25 y 55,
  "ubicacion": "ciudad, {contexto.pais}",
  "ocupacion": "ocupación específica y detallada relacionada con el sector",
  "autopercepcion": "cómo se ve a sí mismo en 1-2 oraciones",
  "creencias_centrales": [
    "convicción fundamental 1",
    "convicción fundamental 2",
    "convicción fundamental 3"
  ],
  "miedo_oculto": "un temor profundo que no expresa abiertamente",
  {seccion_comportamiento}
  "postura_debate": "{postura_fija}",
  "forma_de_hablar": {{
    "formalidad": "casual|profesional|mezclado",
    "estructura_frases": "cortas y directas|largas y elaboradas|mixto",
    "vocabulario_tipico": ["palabra1", "expresión2", "jerga3"],
    "tono_emocional": "descripción del tono: escéptico, analítico, directo, etc.",
    "frases_caracteristicas": [
      "frase típica que diría 1",
      "frase típica que diría 2",
      "frase típica que diría 3"
    ]
  }}
}}

IMPORTANTE: El perfil debe ser específico para {contexto.pais} y el sector {contexto.sector}.
Fundamenta las creencias y comportamientos en los datos reales del mercado provistos.
NO incluyas texto fuera del JSON."""

    # TA-003: revisar caché
    cache_key = _perfil_cache_key(contexto.sector, contexto.pais, agente["rol"])
    cached = _cache_get(cache_key)
    if cached:
        # ajustar peso y tipo al agente actual, no al cacheado
        cached = dict(cached)
        cached["peso"] = agente["peso"]
        cached["tipo"] = agente["tipo"]
        return cached

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        temperature=0.8
    )
    _log_tokens(session_id, response, "generar_perfil")

    perfil = json.loads(response.choices[0].message.content)
    perfil["rol"] = agente["rol"]
    perfil["categoria"] = agente["categoria"]
    perfil["peso"] = agente["peso"]
    perfil["tipo"] = agente["tipo"]
    perfil["foto_url"] = await _fetch_photo(perfil.get("genero", "masculino"))
    _cache_set(cache_key, perfil)
    return perfil


async def generar_todos_los_perfiles(
    contexto: ContextoDetectado,
    datos_web: dict,
    session_id: str | None = None,
) -> list[dict]:
    tareas = [
        generar_perfil_agente(
            agente=agente.model_dump(),
            contexto=contexto,
            datos_web=datos_web,
            session_id=session_id,
        )
        for agente in contexto.agentes
    ]
    perfiles = await asyncio.gather(*tareas)
    return list(perfiles)

# ── Nodo 4: Debate adversarial por agente ─────────────────────────────────────
async def generar_argumento_agente(
    perfil: dict,
    idea_texto: str,
    contexto: ContextoDetectado,
    insights_exploracion: dict | None = None,
    session_id: str | None = None,
) -> dict:
    """
    Genera el argumento adversarial de UN agente sobre la idea.
    Si se proveen insights de exploración, el agente los usa como evidencia de campo.
    """

    # Bloque de contexto de exploración (solo si viene con datos)
    bloque_insights = ""
    if insights_exploracion:
        jobs = insights_exploracion.get("jobs_principales", [])
        jobs_str = "; ".join(
            f"{j.get('stakeholder','')}: {j.get('job_funcional','')}"
            for j in jobs[:3]
        )
        fricciones = ", ".join(insights_exploracion.get("fricciones_criticas", [])[:3])
        competidores = insights_exploracion.get("competidores_detectados", [])
        comp_str = ", ".join(competidores[:3]) if competidores else "no identificados"
        bloque_insights = (
            f"\nEVIDENCIA DE ENTREVISTAS CON USUARIOS REALES (considera esto antes de argumentar):\n"
            f"- Problema validado: {insights_exploracion.get('resumen_problema', '')}\n"
            f"- Jobs principales detectados: {jobs_str}\n"
            f"- Fricciones críticas: {fricciones}\n"
            f"- Nivel de validación: {insights_exploracion.get('validacion_problema', '')}\n"
            f"- Competidores/alternativas en el mercado: {comp_str}\n"
            f"Usa esta evidencia de campo para fundamentar tu argumento con datos concretos.\n"
        )

    # Bloque de supuestos evaluados (Testing Business Ideas)
    bloque_supuestos = ""
    if insights_exploracion and insights_exploracion.get("supuestos_evaluados"):
        sups = insights_exploracion["supuestos_evaluados"]
        validados  = [s for s in sups if s.get("veredicto") == "validado"]
        refutados  = [s for s in sups if s.get("veredicto") == "refutado"]
        parciales  = [s for s in sups if s.get("veredicto") == "parcial"]
        sin_datos  = [s for s in sups if s.get("veredicto") == "sin_datos"]

        def _fmt(lista): return "; ".join(s.get("enunciado","") for s in lista[:2])

        bloque_supuestos = "\nSUPUESTOS RIESGOSOS EVALUADOS EN CAMPO:\n"
        if validados:  bloque_supuestos += f"- VALIDADOS: {_fmt(validados)}\n"
        if refutados:  bloque_supuestos += f"- REFUTADOS: {_fmt(refutados)}\n"
        if parciales:  bloque_supuestos += f"- PARCIALMENTE VALIDADOS: {_fmt(parciales)}\n"
        if sin_datos:  bloque_supuestos += f"- SIN DATOS SUFICIENTES: {_fmt(sin_datos)}\n"
        bloque_supuestos += "Argumenta tomando en cuenta qué supuestos quedaron validados y cuáles no.\n"

    # Instrucción de citación solo cuando hay insights de exploración
    instruccion_cita = ""
    if insights_exploracion:
        instruccion_cita = (
            "- Al FINAL de tu argumento, en una línea separada, escribe exactamente:\n"
            "  INSIGHT_USADO: [la frase o dato concreto de la evidencia de campo que más respalda tu punto]\n"
            "  Si no usas ningún insight de exploración escribe: INSIGHT_USADO: ninguno\n"
        )

    prompt = (
        f"Eres {perfil['nombre']}, {perfil['ocupacion']} en {perfil['ubicacion']}.\n\n"
        f"TU PERSONALIDAD:\n"
        f"- Autopercepción: {perfil['autopercepcion']}\n"
        f"- Creencias: {', '.join(perfil.get('creencias_centrales', []))}\n"
        f"- Miedo oculto: {perfil['miedo_oculto']}\n"
        f"- Postura sobre esta idea: {perfil['postura_debate']}\n\n"
        f"TU FORMA DE HABLAR:\n"
        f"- Formalidad: {perfil['forma_de_hablar']['formalidad']}\n"
        f"- Tono: {perfil['forma_de_hablar']['tono_emocional']}\n"
        f"- Frases típicas tuyas: {', '.join(perfil['forma_de_hablar']['frases_caracteristicas'])}\n\n"
        f"LA IDEA QUE DEBES EVALUAR:\n{idea_texto}\n"
        f"{bloque_insights}"
        f"{bloque_supuestos}\n"
        f"TU ROL EN ESTE DEBATE: {perfil['rol']}\n\n"
        "REGLAS ESTRICTAS:\n"
        "- Habla SIEMPRE en primera persona como ese personaje\n"
        "- NO menciones que eres una IA\n"
        "- NO uses frases genéricas como 'Como experto...'\n"
        "- USA tu vocabulario y tono característico\n"
        "- Se CRÍTICO y ESPECÍFICO — no valides sin cuestionar\n"
        "- Menciona al menos UN punto débil concreto de la idea\n"
        "- Si hay evidencia de entrevistas, úsala explícitamente\n"
        "- Responde en máximo 4 oraciones directas y contundentes\n"
        "- NO uses listas ni bullets — habla naturalmente\n"
        f"{instruccion_cita}\n"
        "Ahora da tu argumento sobre esta idea:"
    )

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=350,
        temperature=0.2
    )

    argumento_raw = response.choices[0].message.content

    # Separar el argumento de la cita de fuente
    fuente_insight = None
    if insights_exploracion and "INSIGHT_USADO:" in argumento_raw:
        partes = argumento_raw.split("INSIGHT_USADO:")
        argumento = partes[0].strip()
        fuente_raw = partes[1].strip().strip('"').strip("'")
        if fuente_raw.lower() not in ("ninguno", "none", "n/a", ""):
            fuente_insight = fuente_raw
    else:
        argumento = argumento_raw

    # Clasificar posición automáticamente
    prompt_clasif = (
        f"Clasifica este argumento en una sola palabra: pro, contra, o neutral.\n"
        f"Argumento: {argumento}\n"
        f"Responde solo con: pro, contra, o neutral"
    )

    _log_tokens(session_id, response, f"argumento_{perfil['rol']}")

    clasif = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt_clasif}],
        max_tokens=5,
        temperature=0
    )
    _log_tokens(session_id, clasif, "clasificar_posicion")

    posicion = clasif.choices[0].message.content.strip().lower()
    if posicion not in ["pro", "contra", "neutral"]:
        posicion = "neutral"

    return {
        "agente_rol": perfil["rol"],
        "agente_nombre": perfil["nombre"],
        "agente_categoria": perfil["categoria"],
        "agente_peso": perfil["peso"],
        "argumento": argumento,
        "posicion": posicion,
        "fuente_insight": fuente_insight,
        "foto_url": perfil.get("foto_url", ""),
        "genero": perfil.get("genero", "masculino"),
    }


async def ejecutar_debate(
    perfiles: list,
    idea_texto: str,
    contexto: ContextoDetectado,
    insights_exploracion: dict | None = None,
    session_id: str | None = None,
) -> list:
    """
    Ejecuta el debate completo: todos los agentes argumentan en paralelo.
    HU-004: cada agente tiene timeout de 30s; si expira devuelve placeholder.
    Si se proveen insights de exploración, cada agente los usa como evidencia.
    """
    async def _con_timeout(perfil):
        try:
            return await asyncio.wait_for(
                generar_argumento_agente(perfil, idea_texto, contexto, insights_exploracion, session_id),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            return {
                "agente_rol": perfil["rol"],
                "agente_nombre": perfil.get("nombre", ""),
                "agente_categoria": perfil.get("categoria", "E"),
                "agente_peso": perfil.get("peso", 0.2),
                "argumento": f"[{perfil['rol']} no respondió a tiempo. El debate continúa con los demás agentes.]",
                "posicion": "neutral",
                "fuente_insight": None,
                "timeout": True,
            }

    tareas = [_con_timeout(p) for p in perfiles]
    argumentos = await asyncio.gather(*tareas)
    return list(argumentos)

# ── Réplica interactiva del usuario en el debate ─────────────────────────────
async def generar_replica_agentes(
    perfiles: list,
    idea_texto: str,
    contexto: ContextoDetectado,
    replica_usuario: str,
    argumentos_previos: list,
    session_id: str | None = None,
) -> list:
    """
    El usuario interrumpe el debate con una réplica o nueva perspectiva.
    Cada agente responde específicamente a lo que dijo el usuario,
    teniendo en cuenta sus argumentos previos y los de los demás.
    """
    resumen_previo = "\n".join(
        f"- {a['agente_rol']}: {a['argumento'][:120]}..." for a in argumentos_previos
    )

    async def _respuesta_agente(perfil: dict) -> dict:
        arg_propio = next(
            (a["argumento"] for a in argumentos_previos if a["agente_rol"] == perfil["rol"]),
            "Sin argumento previo"
        )
        nombre_agente = perfil.get('nombre') or perfil.get('rol', 'Agente')
        prompt = f"""Eres {nombre_agente}, {perfil.get('rol', 'experto')} en un debate sobre esta idea de negocio:
"{idea_texto}"

Tu argumento anterior fue:
"{arg_propio}"

El emprendedor ha respondido con esta réplica:
"{replica_usuario}"

Resumen de los argumentos del resto del panel:
{resumen_previo}

Responde a la réplica del emprendedor desde tu rol. Puedes:
- Ceder si su punto es válido
- Mantener tu posición con nueva evidencia
- Señalar algo que no consideró

Sé directo, máximo 3-4 oraciones. Habla en primera persona como {perfil['rol']}."""

        try:
            r = await asyncio.wait_for(
                client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=250,
                    temperature=0.8,
                ),
                timeout=25.0
            )
            respuesta = r.choices[0].message.content
        except asyncio.TimeoutError:
            respuesta = f"[{perfil['rol']} no pudo responder a tiempo]"

        return {
            "agente_rol": perfil["rol"],
            "agente_nombre": perfil.get("nombre", ""),
            "agente_categoria": perfil.get("categoria", "E"),
            "agente_peso": perfil.get("peso", 0.2),
            "argumento": respuesta,
            "posicion": "neutral",
            "es_replica": True,
        }

    tareas = [_respuesta_agente(p) for p in perfiles]
    respuestas = await asyncio.gather(*tareas)
    return list(respuestas)


# ── Rúbrica TBI: 60 preguntas binarias (Testing Business Ideas) ──────────────
_RUBRICA_D1 = [
    "¿Los entrevistados describieron el problema con sus propias palabras sin que se les sugiriera?",
    "¿Al menos 2 perfiles distintos mencionaron la misma fricción crítica?",
    "¿Los entrevistados ya buscan o usan alguna solución alternativa hoy?",
    "¿El problema afecta la rutina diaria o semanal del usuario (no es ocasional)?",
    "¿La evidencia del problema va más allá de opiniones (hay comportamiento observable)?",
    "¿Los entrevistados expresaron frustración o incomodidad concreta con la situación actual?",
    "¿El problema fue mencionado espontáneamente antes de que se presentara la solución?",
    "¿Al menos un entrevistado describió haber perdido tiempo, dinero o energía por este problema?",
    "¿El problema se presenta en múltiples situaciones o contextos (no es un caso aislado)?",
    "¿Se identificaron al menos 3 fricciones específicas relacionadas con el problema?",
    "¿Los entrevistados mostraron interés genuino en hablar del problema (no fue forzado)?",
    "¿El problema se manifestó de forma similar en perfiles de distinto segmento?",
    "¿Hay evidencia de que el problema existía antes de que el emprendedor lo propusiera?",
    "¿Los entrevistados describieron consecuencias concretas de no resolver el problema?",
    "¿El problema ocurre con frecuencia suficiente (al menos 1 vez por semana)?",
]
_RUBRICA_D2 = [
    "¿Se identificó un segmento de cliente específico y acotado (no 'todo el mundo')?",
    "¿Los entrevistados mostraron urgencia o frustración concreta con su situación actual?",
    "¿Hubo al menos un entrevistado que pagó o intentó pagar por resolver este problema?",
    "¿Los jobs-to-be-done funcional, emocional y social están identificados desde las entrevistas?",
    "¿Al menos 3 entrevistados pertenecen claramente al segmento objetivo definido?",
    "¿Los entrevistados tienen poder de decisión de compra (no dependen de un tercero)?",
    "¿El segmento objetivo es suficientemente grande para representar un mercado viable?",
    "¿Los entrevistados describieron cuánto tiempo dedican actualmente a resolver el problema?",
    "¿Se identificaron diferencias relevantes entre subsegmentos del cliente objetivo?",
    "¿Los entrevistados expresaron voluntad de recomendar la solución si existiera?",
    "¿El cliente objetivo tiene acceso a los canales (digitales o físicos) que la solución requiere?",
    "¿Los perfiles entrevistados representan variedad real (edad, contexto, nivel socioeconómico)?",
]
_RUBRICA_D3 = [
    "¿La solución responde directamente al job funcional identificado en las entrevistas?",
    "¿Existe al menos un diferenciador claro frente a las alternativas que el usuario ya usa?",
    "¿La solución puede describirse en una oración sin necesitar explicación técnica?",
    "¿Los supuestos críticos de implementación de la solución están identificados?",
    "¿La solución aborda la fricción más crítica mencionada en las entrevistas?",
    "¿La solución respeta las limitaciones culturales o contextuales del mercado local?",
    "¿La solución puede desarrollarse en una primera versión (MVP) con recursos acotados?",
    "¿Los entrevistados entendieron la propuesta de valor sin necesitar más de una explicación?",
    "¿La solución genera valor sin depender de una masa crítica muy grande para funcionar?",
    "¿Se identificaron las principales barreras de adopción de la solución?",
    "¿La solución aborda también el job emocional (no solo el funcional)?",
    "¿Existen precedentes de soluciones similares en otros mercados que hayan funcionado?",
    "¿La solución puede mejorarse iterativamente con feedback real de usuarios desde el inicio?",
]
_RUBRICA_D4 = [
    "¿Está claro cómo y a quién se cobrará (modelo de ingresos definido)?",
    "¿Hay evidencia de disposición a pagar por parte del segmento objetivo?",
    "¿Los principales costos operativos están identificados (logística, tecnología, adquisición)?",
    "¿El modelo de ingresos puede sostenerse sin depender de inversión indefinida?",
    "¿Existe una estrategia básica de adquisición de clientes?",
    "¿El valor de vida del cliente es potencialmente mayor que el costo de adquirirlo?",
    "¿El modelo puede generar ingresos desde las primeras semanas o meses de operación?",
    "¿Se identificaron los aliados o proveedores clave necesarios para operar?",
    "¿El modelo puede escalar sin que los costos crezcan al mismo ritmo que los ingresos?",
    "¿Existe al menos un canal de distribución validado o altamente probable?",
    "¿El precio estimado está dentro del rango que los entrevistados consideraron aceptable?",
    "¿Se identificaron riesgos regulatorios o legales que puedan afectar la operación?",
]
_RUBRICA_D5 = [
    "¿Se identificaron los supuestos de mayor riesgo (alto impacto + alta incertidumbre) antes de explorar?",
    "¿Al menos uno de los supuestos más riesgosos fue explorado directamente en las entrevistas?",
    "¿Se identificaron competidores o sustitutos directos en el mercado local?",
    "¿Los resultados de la exploración modificaron o afinaron al menos un supuesto inicial?",
    "¿Los supuestos fueron priorizados por nivel de impacto e incertidumbre?",
    "¿Se ejecutó al menos un experimento para validar el supuesto más crítico?",
    "¿El emprendedor puede identificar claramente qué aprendió nuevo gracias a la exploración?",
    "¿La exploración generó nuevas preguntas relevantes (señal de que se llegó a profundidad real)?",
]

# Peso máximo por dimensión (suma = 100)
_PESOS_MAX = {"d1": 30, "d2": 20, "d3": 20, "d4": 20, "d5": 10}


async def evaluar_rubrica_tbi(
    idea_texto: str,
    insights_exploracion: dict | None,
    argumentos: list,
) -> dict:
    """
    Evalúa las 60 preguntas binarias de la rúbrica TBI.
    Devuelve score_total (0-100), scores por dimensión y respuestas brutas.
    Temperature=0 para máxima consistencia entre evaluaciones idénticas.
    """
    # Construir evidencia disponible
    bloque_insights = "No se realizaron entrevistas de exploración."
    confianza_exploracion = None
    if insights_exploracion:
        jobs = insights_exploracion.get("jobs_principales", [])
        jobs_str = "; ".join(
            f"{j.get('stakeholder','')}: {j.get('job_funcional','')} (dolor: {j.get('dolor_asociado','')})"
            for j in jobs[:8]
        )
        fricciones = ", ".join(insights_exploracion.get("fricciones_criticas", [])[:6])
        temores = ", ".join(insights_exploracion.get("temores_recurrentes", [])[:5])
        oportunidades = ", ".join(insights_exploracion.get("oportunidades_detectadas", [])[:4])
        competidores = insights_exploracion.get("competidores_detectados", [])
        comp_str = ", ".join(competidores[:5]) if competidores else "no identificados"
        total_perfiles = insights_exploracion.get("total_perfiles_entrevistados", 0)
        validacion = insights_exploracion.get("validacion_problema", "")
        confianza_exploracion = insights_exploracion.get("nivel_confianza")
        bloque_insights = (
            f"Resumen del problema: {insights_exploracion.get('resumen_problema', '')}\n"
            f"Jobs principales: {jobs_str}\n"
            f"Fricciones críticas: {fricciones}\n"
            f"Temores recurrentes: {temores}\n"
            f"Oportunidades detectadas: {oportunidades}\n"
            f"Competidores/alternativas: {comp_str}\n"
            f"Validación del problema: {validacion}\n"
            f"Total perfiles entrevistados: {total_perfiles}\n"
        )
        if confianza_exploracion is not None:
            bloque_insights += f"Nivel de confianza de la exploración con usuarios: {round(confianza_exploracion*100)}%\n"
        # Supuestos evaluados — todos
        sups = insights_exploracion.get("supuestos_evaluados") or []
        if sups:
            def _fmt(lista): return "; ".join(s.get("enunciado","") for s in lista[:4])
            validados = [s for s in sups if s.get("veredicto") == "validado"]
            refutados  = [s for s in sups if s.get("veredicto") == "refutado"]
            parciales  = [s for s in sups if s.get("veredicto") == "parcial"]
            if validados: bloque_insights += f"Supuestos validados ({len(validados)}): {_fmt(validados)}\n"
            if parciales: bloque_insights += f"Supuestos parcialmente validados ({len(parciales)}): {_fmt(parciales)}\n"
            if refutados:  bloque_insights += f"Supuestos refutados ({len(refutados)}): {_fmt(refutados)}\n"

    debate_resumen = "\n".join(
        f"- {a['agente_rol']} ({a.get('posicion','neutral')}): {a['argumento'][:400]}"
        for a in argumentos
    )

    def _fmt_preguntas(lista, dim_label):
        lines = [f"  Dimensión {dim_label}:"]
        for i, q in enumerate(lista, 1):
            lines.append(f"  {i}. {q}")
        return "\n".join(lines)

    bloque_contexto_confianza = ""
    if confianza_exploracion is not None:
        pct = round(confianza_exploracion * 100)
        if pct >= 60:
            bloque_contexto_confianza = (
                f"\nNOTA IMPORTANTE: La fase de exploración con usuarios reales arrojó {pct}% de confianza, "
                "lo que indica evidencia sólida de problema y demanda. Esto es evidencia válida para las dimensiones "
                "D1 (validación del problema) y D2 (validación del cliente).\n"
            )
        elif pct >= 40:
            bloque_contexto_confianza = (
                f"\nNOTA: La fase de exploración arrojó {pct}% de confianza (nivel medio). "
                "Hay evidencia parcial de problema validado.\n"
            )

    prompt = f"""Eres un evaluador experto en la metodología Testing Business Ideas (Bland & Osterwalder).
Tu tarea es evaluar una idea de negocio usando una rúbrica binaria de 60 preguntas.

IDEA DE NEGOCIO:
{idea_texto}

EVIDENCIA DE EXPLORACIÓN CON USUARIOS:
{bloque_insights}
{bloque_contexto_confianza}
ARGUMENTOS DEL DEBATE MULTIAGENTE:
{debate_resumen}

INSTRUCCIONES:
- Responde cada pregunta con 1 (hay evidencia razonable de esto) o 0 (no hay evidencia ni indicios).
- Basa tus respuestas en toda la evidencia provista: exploración con usuarios, argumentos del debate y la idea misma.
- Si la evidencia menciona el tema de forma implícita o hay indicios razonables, responde 1.
- Responde 0 solo cuando no hay absolutamente ninguna evidencia ni mención del tema.
- La exploración con usuarios es evidencia de primera mano: úsala para responder D1 y D2.

PREGUNTAS (responde con arrays de enteros 0 o 1, uno por pregunta en orden):

{_fmt_preguntas(_RUBRICA_D1, "D1 — Validación del problema (15 preguntas)")}

{_fmt_preguntas(_RUBRICA_D2, "D2 — Validación del cliente (12 preguntas)")}

{_fmt_preguntas(_RUBRICA_D3, "D3 — Viabilidad de la solución (13 preguntas)")}

{_fmt_preguntas(_RUBRICA_D4, "D4 — Viabilidad del modelo de negocio (12 preguntas)")}

{_fmt_preguntas(_RUBRICA_D5, "D5 — Gestión de incertidumbre (8 preguntas)")}

Responde ÚNICAMENTE con este JSON (sin texto adicional):
{{
  "d1": [<15 valores 0 o 1>],
  "d2": [<12 valores 0 o 1>],
  "d3": [<13 valores 0 o 1>],
  "d4": [<12 valores 0 o 1>],
  "d5": [<8 valores 0 o 1>]
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=500,
        temperature=0,
    )

    raw = json.loads(response.choices[0].message.content)

    # Validar longitudes y recortar/rellenar si GPT devuelve algo incorrecto
    esperados = {"d1": 15, "d2": 12, "d3": 13, "d4": 12, "d5": 8}
    for dim, n in esperados.items():
        vals = raw.get(dim, [])
        if len(vals) < n:
            vals = vals + [0] * (n - len(vals))
        raw[dim] = [1 if v else 0 for v in vals[:n]]

    # Calcular score ponderado en Python (100% determinista)
    scores_dim: dict[str, float] = {}
    score_total = 0.0
    for dim, peso_max in _PESOS_MAX.items():
        respuestas = raw[dim]
        n = len(respuestas)
        pts = sum(respuestas) * (peso_max / n)
        scores_dim[dim] = round(pts, 2)
        score_total += pts

    score_total = round(score_total, 2)
    nivel_confianza = round(score_total / 100, 3)

    return {
        "score_total": score_total,
        "nivel_confianza": nivel_confianza,
        "scores_dimension": scores_dim,
        "respuestas": raw,
    }


# ── Nodo 5: Consenso ponderado y árbol de argumentos ─────────────────────────
async def generar_consenso(
    argumentos: list,
    idea_texto: str,
    contexto: ContextoDetectado,
    session_id: str | None = None,
    insights_exploracion: dict | None = None,
) -> dict:
    """
    Analiza todos los argumentos del debate, aplica los pesos
    de cada agente y genera el árbol de argumentos final con
    la recomendación ponderada.
    """

    # Construir el resumen del debate para el LLM
    resumen_debate = ""
    for arg in argumentos:
        resumen_debate += (
            f"\n[{arg['agente_rol']} — peso: {arg['agente_peso']}]\n"
            f"Posición: {arg['posicion']}\n"
            f"Argumento: {arg['argumento']}\n"
        )

    # Evaluar rúbrica TBI (60 preguntas binarias) — score principal
    rubrica = await evaluar_rubrica_tbi(idea_texto, insights_exploracion, argumentos)
    score_rubrica = rubrica["nivel_confianza"]   # 0.0–1.0
    scores_dim = rubrica["scores_dimension"]

    # Veredicto determinista por rúbrica (umbrales fijos, sin LLM)
    if score_rubrica >= 0.65:
        veredicto_calculado = "viable"
    elif score_rubrica >= 0.40:
        veredicto_calculado = "condicionalmente_viable"
    else:
        veredicto_calculado = "no_viable"

    prompt = (
        "Eres un sintetizador experto de debates de evaluación de ideas de negocio.\n\n"
        f"IDEA EVALUADA:\n{idea_texto}\n\n"
        f"DEBATE ENTRE AGENTES ESPECIALIZADOS:\n{resumen_debate}\n\n"
        f"SCORE DE RÚBRICA TBI (60 preguntas binarias — Testing Business Ideas):\n"
        f"  Total: {rubrica['score_total']}/100 → nivel_confianza: {score_rubrica}\n"
        f"  D1 Validación del problema: {scores_dim.get('d1',0)}/30\n"
        f"  D2 Validación del cliente: {scores_dim.get('d2',0)}/20\n"
        f"  D3 Viabilidad de la solución: {scores_dim.get('d3',0)}/20\n"
        f"  D4 Viabilidad del modelo de negocio: {scores_dim.get('d4',0)}/20\n"
        f"  D5 Gestión de incertidumbre: {scores_dim.get('d5',0)}/10\n\n"
        f"VEREDICTO OBLIGATORIO (derivado del score de rúbrica — NO lo cambies): '{veredicto_calculado}'\n"
        f"  - score >= 0.65 → viable | 0.40–0.64 → condicionalmente_viable | < 0.40 → no_viable\n\n"
        "INSTRUCCIÓN: El campo 'recomendacion' DEBE ser exactamente el veredicto indicado. "
        "El campo 'nivel_confianza' DEBE ser exactamente el nivel_confianza de la rúbrica. "
        "Tu tarea es generar el análisis cualitativo (acuerdos, divergencias, fortalezas, debilidades, condiciones) "
        "que justifique ese veredicto con base en los argumentos del debate y los scores por dimensión.\n\n"
        "Responde ÚNICAMENTE con un JSON con esta estructura:\n"
        "{\n"
        '  "acuerdos": [\n'
        '    {"punto": "descripción del acuerdo", "agentes": ["rol1", "rol2"]}\n'
        "  ],\n"
        '  "divergencias": [\n'
        '    {"punto": "descripción del desacuerdo", "agente_a": "rol1", "agente_b": "rol2"}\n'
        "  ],\n"
        '  "fortalezas_idea": ["fortaleza específica 1", "fortaleza específica 2"],\n'
        '  "debilidades_idea": ["debilidad específica 1", "debilidad específica 2"],\n'
        f'  "recomendacion": "{veredicto_calculado}",\n'
        f'  "nivel_confianza": {score_rubrica},\n'
        '  "condiciones": ["condición concreta 1", "condición concreta 2"],\n'
        '  "resumen_ejecutivo": "resumen crítico del debate en 2-3 oraciones para el emprendedor"\n'
        "}"
    )

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        temperature=0.3
    )
    _log_tokens(session_id, response, "consenso")

    resultado = json.loads(response.choices[0].message.content)
    # Adjuntar scores de rúbrica para que el frontend pueda mostrarlos si lo desea
    resultado["rubrica"] = {
        "score_total": rubrica["score_total"],
        "scores_dimension": scores_dim,
    }
    # Garantizar que nivel_confianza y recomendacion sean los calculados
    resultado["nivel_confianza"] = score_rubrica
    resultado["recomendacion"] = veredicto_calculado
    return resultado


# ══════════════════════════════════════════════════════════════════════════════
# FASE DE EXPLORACIÓN
# ══════════════════════════════════════════════════════════════════════════════

# ── Supuestos riesgosos (Testing Business Ideas) ─────────────────────────────
async def detectar_supuestos(idea_texto: str) -> SupuestosDetectados:
    """
    Extrae los supuestos riesgosos implícitos en la idea del emprendedor,
    clasificados por tipo (deseabilidad, factibilidad, viabilidad, adaptabilidad)
    y priorizados por nivel de riesgo.
    Basado en la metodología Testing Business Ideas (Bland & Osterwalder).
    """
    prompt = f"""Eres un experto en validación de ideas de negocio usando la metodología
Testing Business Ideas de David Bland y Alex Osterwalder.

Un emprendedor tiene la siguiente idea:
{idea_texto}

Tu tarea es identificar los SUPUESTOS RIESGOSOS implícitos en esta idea.
Un supuesto riesgoso es algo que el emprendedor cree que es verdad,
pero que podría estar equivocado y hundir el negocio si no se valida.

Clasifica cada supuesto según el tipo:
- "deseabilidad": ¿alguien realmente quiere esto?
- "factibilidad": ¿se puede construir o ejecutar?
- "viabilidad": ¿puede generar dinero sosteniblemente?
- "adaptabilidad": ¿funciona en este contexto cultural, legal o de mercado?

Responde ÚNICAMENTE con un JSON válido:
{{
  "razonamiento": "por qué estos son los supuestos más críticos para esta idea",
  "supuestos": [
    {{
      "id": "slug_sin_espacios",
      "enunciado": "Creo que [supuesto concreto que el emprendedor asume como verdad]",
      "tipo": "deseabilidad|factibilidad|viabilidad|adaptabilidad",
      "nivel_riesgo": "alto|medio|bajo",
      "por_que_es_riesgoso": "qué pasaría si este supuesto es falso",
      "que_confirmaria": "qué evidencia concreta demostraría que este supuesto es verdad",
      "stakeholders_relevantes": ["qué tipo de persona puede confirmar o refutar esto"]
    }}
  ]
}}

REGLAS:
- Identifica entre 4 y 6 supuestos, priorizados de mayor a menor riesgo
- El enunciado SIEMPRE empieza con "Creo que..."
- Sé específico: no supuestos genéricos, sino vinculados directamente a ESTA idea
- Los de tipo "deseabilidad" son usualmente los más críticos para una startup
- NO incluyas texto fuera del JSON"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1500,
        temperature=0.4
    )

    data = json.loads(response.choices[0].message.content)
    supuestos = [Supuesto(**s) for s in data["supuestos"]]
    return SupuestosDetectados(
        idea_texto=idea_texto,
        supuestos=supuestos,
        razonamiento=data["razonamiento"]
    )


# ── Nodo 0: Detección de stakeholders ────────────────────────────────────────
async def detectar_stakeholders(idea_texto: str, pais_sugerido: str | None = None) -> StakeholdersDetectados:
    """
    A partir de la idea, identifica con quiénes debería hablar el emprendedor
    para validar su propuesta antes de debatirla formalmente.
    """
    pais_instruccion = f"\nPaís de operación del emprendedor: {pais_sugerido}. Usa este país explícitamente — no lo inferas de la idea." if pais_sugerido else ""
    prompt = f"""Eres un experto en investigación de usuarios y desarrollo de clientes (Customer Discovery).

Un emprendedor tiene la siguiente idea de negocio:
{idea_texto}{pais_instruccion}

Tu tarea es identificar TODOS los stakeholders con quienes debería conversar este emprendedor
para validar su idea. Piensa más allá del usuario final directo — considera decisores,
influenciadores, aliados y posibles bloqueadores.

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{{
  "sector": "sector de la idea",
  "pais": "{pais_sugerido or 'país detectado o inferido'}",
  "razonamiento": "explicación breve de por qué elegiste estos stakeholders",
  "stakeholders": [
    {{
      "id": "slug_sin_espacios",
      "nombre": "Nombre legible del stakeholder",
      "descripcion": "Por qué es relevante para esta idea específica",
      "relevancia": "alta|media|baja",
      "tipo": "usuario_final|decisor|influenciador|aliado|regulador",
      "preguntas_clave": [
        "Pregunta concreta que el emprendedor debería hacerle",
        "Otra pregunta clave para descubrir sus jobs to be done",
        "Pregunta sobre fricciones o temores"
      ]
    }}
  ]
}}

REGLAS:
- Identifica entre 3 y 7 stakeholders relevantes
- Sé específico: no "usuarios" genérico, sino quiénes exactamente (ej: "Madres trabajadoras 30-45 años", "Directores de compras de PYMEs")
- Las preguntas_clave deben ser abiertas y orientadas a descubrir problemas reales, NO validar la solución
- Ordena de mayor a menor relevancia
- NO incluyas texto fuera del JSON"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1500,
        temperature=0.4
    )

    data = json.loads(response.choices[0].message.content)

    stakeholders = [Stakeholder(**s) for s in data["stakeholders"]]

    return StakeholdersDetectados(
        idea_texto=idea_texto,
        sector=data["sector"],
        pais=data["pais"],
        stakeholders=stakeholders,
        razonamiento=data["razonamiento"]
    )


# ── Nodo 1 (exploración): Generación de múltiples perfiles por stakeholder ────
async def generar_perfiles_stakeholder(
    stakeholder: Stakeholder,
    idea_texto: str,
    sector: str,
    pais: str,
    datos_web: dict,
    cantidad: int = 4
) -> list[dict]:
    """
    Genera entre 3 y 5 perfiles distintos para un mismo stakeholder,
    cada uno con variaciones demográficas, actitudinales y contextuales.
    """
    prompt = f"""Eres un motor de construcción de perfiles humanos sintéticos de alta fidelidad.

*** PAÍS OBLIGATORIO: {pais} ***
TODOS los perfiles deben ser personas que viven en {pais}. Sus nombres, ciudades, referencias culturales y contexto deben ser 100% de {pais}. NUNCA uses nombres anglosajones ni ciudades de otros países.

IDEA DEL EMPRENDEDOR:
{idea_texto}

STAKEHOLDER A PERFILAR: {stakeholder.nombre}
Descripción: {stakeholder.descripcion}
Tipo: {stakeholder.tipo}

CONTEXTO DEL MERCADO:
- Sector: {sector}
- País: {pais} (OBLIGATORIO — todos los perfiles son de {pais})
- Tendencias: {datos_web.get("tendencias_sector", "no disponible")}
- Comportamiento real: {datos_web.get("comportamiento_usuario", "no disponible")}
- Barreras reales: {", ".join(datos_web.get("barreras_reales", []))}
- Contexto cultural: {datos_web.get("contexto_cultural", "no disponible")}
- Competidores/alternativas actuales: {", ".join(datos_web.get("competidores_detectados", [])) or "no detectados"}

Genera exactamente {cantidad} perfiles DISTINTOS de "{stakeholder.nombre}".
Cada perfil debe representar una variante real y diferente del mismo tipo de persona:
varía edad, nivel socioeconómico, actitud hacia la tecnología, contexto familiar, etc.

Responde ÚNICAMENTE con un JSON:
{{
  "perfiles": [
    {{
      "variante_descripcion": "qué hace ÚNICO a este perfil respecto a los otros (ej: padre joven con recursos limitados)",
      "genero": "masculino|femenino",
      "nombre": "nombre completo de UNA sola persona (sin 'y', sin parejas), apropiado para {pais}",
      "edad": número entero,
      "ubicacion": "nombre de una ciudad real de {pais} (ej: Lima, Arequipa, Trujillo)",
      "ocupacion": "ocupación específica",
      "autopercepcion": "cómo se ve a sí mismo en 1-2 oraciones",
      "creencias_centrales": ["creencia 1", "creencia 2", "creencia 3"],
      "miedo_oculto": "temor profundo no expresado abiertamente",
      "job_funcional": "tarea práctica que necesita resolver",
      "job_emocional": "sentimiento que busca alcanzar o evitar",
      "job_social": "cómo quiere ser percibido por otros",
      "fricciones": ["fricción 1 específica", "fricción 2 específica"],
      "temores": ["temor 1 concreto", "temor 2 concreto"],
      "resultado_deseado": "qué éxito concreto busca en relación a esta idea",
      "forma_de_hablar": {{
        "formalidad": "casual|profesional|mezclado",
        "estructura_frases": "cortas y directas|largas y elaboradas|mixto",
        "vocabulario_tipico": ["palabra1", "expresión2"],
        "tono_emocional": "descripción del tono",
        "frases_caracteristicas": ["frase típica 1", "frase típica 2"]
      }}
    }}
  ]
}}

IMPORTANTE:
- Los perfiles deben ser REALMENTE distintos entre sí — no variaciones superficiales.
- El campo "ubicacion" DEBE ser una ciudad real de {pais} (ej: Lima, Arequipa, Trujillo, Cusco). NUNCA escribas "ciudad, no especificado" ni dejes el campo vacío.
- El campo "nombre" debe ser un nombre propio típico de {pais}.
- Fundamenta cada perfil en los datos reales del mercado.
- NO incluyas texto fuera del JSON."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=3000,
        temperature=0.85
    )

    data = json.loads(response.choices[0].message.content)
    perfiles = data["perfiles"]

    # Asignar foto realista a cada perfil en paralelo
    fotos = await asyncio.gather(*[
        _fetch_photo(p.get("genero", "masculino")) for p in perfiles
    ])
    for p, foto in zip(perfiles, fotos):
        p["stakeholder_id"] = stakeholder.id
        p["stakeholder_nombre"] = stakeholder.nombre
        p["foto_url"] = foto

    return perfiles


# ── Nodo 2 (exploración): Conversación con un perfil sintético ────────────────
async def conversar_con_perfil(
    perfil: dict,
    idea_texto: str,
    historial: list[dict],
    pregunta: str,
    supuestos_activos: list[dict] | None = None,
    session_id: str | None = None,
) -> dict:
    """
    El emprendedor hace una pregunta; el perfil sintético responde
    desde su perspectiva e identidad.
    Extrae insights JTBD cuando hay al menos 4 mensajes en el historial.
    Si se pasan supuestos_activos, los aborda naturalmente y devuelve evaluación.
    """
    supuestos_bloque = ""
    if supuestos_activos:
        lista = "\n".join(f'- [{s["id"]}] {s["enunciado"]}' for s in supuestos_activos)
        supuestos_bloque = f"""

SUPUESTOS A VALIDAR (el emprendedor quiere saber si aplican en tu caso):
{lista}
Si alguno es relevante para la pregunta actual, abórdalo naturalmente desde tu experiencia.
No los enumeres — habla como si fueran parte de tu vivencia personal."""

    sistema = f"""Eres {perfil['nombre']}, {perfil['ocupacion']} en {perfil['ubicacion']}.

TU IDENTIDAD:
- Autopercepción: {perfil['autopercepcion']}
- Creencias: {', '.join(perfil.get('creencias_centrales', []))}
- Miedo oculto: {perfil['miedo_oculto']}
- Job funcional: {perfil['job_funcional']}
- Job emocional: {perfil['job_emocional']}
- Job social: {perfil['job_social']}
- Fricciones: {', '.join(perfil.get('fricciones', []))}
- Temores: {', '.join(perfil.get('temores', []))}

TU FORMA DE HABLAR:
- Formalidad: {perfil['forma_de_hablar']['formalidad']}
- Tono: {perfil['forma_de_hablar']['tono_emocional']}
- Frases típicas: {', '.join(perfil['forma_de_hablar']['frases_caracteristicas'])}

CONTEXTO: El emprendedor te está entrevistando sobre esta idea: {idea_texto}{supuestos_bloque}

REGLAS ESTRICTAS:
- Habla SIEMPRE en primera persona como ese personaje
- NO menciones que eres una IA
- Responde desde tu experiencia de vida real — no como experto en el negocio
- Sé honesto: si algo te preocupa, dilo. Si no lo entiendes, pregunta
- Máximo 4-5 oraciones por respuesta
- Usa tu vocabulario y tono característico"""

    # Recuperar contexto relevante de memoria vectorial
    contexto_memoria = ""
    if session_id:
        from app.memory import guardar_turno, recuperar_contexto
        turnos_relevantes = recuperar_contexto(session_id, pregunta, n=4)
        if turnos_relevantes:
            fragmentos = "\n".join(f'[{t["rol"]}]: {t["texto"][:200]}' for t in turnos_relevantes)
            contexto_memoria = f"\n\nCONTEXTO PREVIO RELEVANTE DE ESTA CONVERSACIÓN:\n{fragmentos}"

    sistema_con_memoria = sistema + contexto_memoria

    mensajes = [{"role": "system", "content": sistema_con_memoria}]

    for msg in historial:
        rol_llm = "user" if msg["rol"] == "emprendedor" else "assistant"
        mensajes.append({"role": rol_llm, "content": msg["contenido"]})

    mensajes.append({"role": "user", "content": pregunta})

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=mensajes,
        max_tokens=400,
        temperature=0.85
    )

    respuesta = response.choices[0].message.content

    # Guardar turno en memoria vectorial
    if session_id:
        from app.memory import guardar_turno
        guardar_turno(session_id, "emprendedor", pregunta)
        guardar_turno(session_id, perfil['nombre'], respuesta)

    insights = None
    if len(historial) >= 4:
        insights = await _extraer_insights_jtbd(perfil, historial + [
            {"rol": "emprendedor", "contenido": pregunta},
            {"rol": "perfil", "contenido": respuesta}
        ], idea_texto)

    supuestos_evaluados: list[dict] = []
    if supuestos_activos:
        supuestos_evaluados = await _evaluar_supuestos_en_respuesta(
            respuesta, pregunta, supuestos_activos
        )

    return {"respuesta": respuesta, "insights_jtbd": insights, "supuestos_evaluados": supuestos_evaluados}


async def _evaluar_supuestos_en_respuesta(
    respuesta: str,
    pregunta: str,
    supuestos: list[dict],
) -> list[dict]:
    """Determina qué supuestos fueron mencionados en la respuesta y con qué veredicto."""
    lista = "\n".join(f'- id={s["id"]}: {s["enunciado"]}' for s in supuestos)
    prompt = f"""Analiza si la siguiente respuesta de un usuario aporta evidencia sobre
alguno de estos supuestos de negocio. Solo evalúa los que el usuario abordó explícita
o implícitamente. Ignora los que no se mencionaron.

PREGUNTA: {pregunta}
RESPUESTA: {respuesta}

SUPUESTOS:
{lista}

Responde ÚNICAMENTE con JSON:
{{"evaluados": [{{"supuesto_id": "id", "veredicto": "validado|parcial|refutado"}}]}}
Si ninguno fue mencionado: {{"evaluados": []}}"""

    try:
        r = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=200,
            temperature=0,
        )
        return json.loads(r.choices[0].message.content).get("evaluados", [])
    except Exception:
        return []


async def _extraer_insights_jtbd(
    perfil: dict,
    historial: list[dict],
    idea_texto: str
) -> dict:
    """Extrae insights estructurados JTBD de la conversación acumulada."""
    transcripcion = "\n".join(
        f"{'Emprendedor' if m['rol'] == 'emprendedor' else perfil['nombre']}: {m['contenido']}"
        for m in historial
    )

    prompt = f"""Analiza esta conversación de entrevista de usuario y extrae los insights clave.

PERFIL ENTREVISTADO: {perfil['nombre']}, {perfil['ocupacion']}
IDEA EVALUADA: {idea_texto}

CONVERSACIÓN:
{transcripcion}

Responde ÚNICAMENTE con un JSON:
{{
  "job_funcional": "tarea concreta que emerge de la conversación",
  "job_emocional": "sentimiento o estado emocional que busca",
  "job_social": "cómo quiere ser percibido",
  "fricciones": ["fricción 1 mencionada o implícita", "fricción 2"],
  "temores": ["temor 1 revelado", "temor 2"],
  "resultado_deseado": "qué éxito concreto busca",
  "cita_clave": "frase textual más reveladora del entrevistado",
  "nivel_confianza": 0.8
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=600,
        temperature=0.2
    )

    return json.loads(response.choices[0].message.content)


# ── Nodo 3 (exploración): Detección de patrones por stakeholder ───────────────
async def detectar_patrones(
    stakeholder_id: str,
    stakeholder_nombre: str,
    idea_texto: str,
    insights_por_perfil: list[dict]
) -> dict:
    """
    Analiza los insights de múltiples perfiles del mismo stakeholder,
    encuentra patrones comunes, divergencias y el job principal del segmento.
    """
    insights_texto = ""
    for i, ins in enumerate(insights_por_perfil, 1):
        insights_texto += f"\n--- Perfil {i} ---\n"
        insights_texto += f"Job funcional: {ins.get('job_funcional', '')}\n"
        insights_texto += f"Job emocional: {ins.get('job_emocional', '')}\n"
        insights_texto += f"Job social: {ins.get('job_social', '')}\n"
        insights_texto += f"Fricciones: {', '.join(ins.get('fricciones', []))}\n"
        insights_texto += f"Temores: {', '.join(ins.get('temores', []))}\n"
        insights_texto += f"Resultado deseado: {ins.get('resultado_deseado', '')}\n"
        if ins.get('cita_clave'):
            insights_texto += f"Cita clave: \"{ins['cita_clave']}\"\n"

    prompt = f"""Eres un analista experto en síntesis de investigación de usuarios.

STAKEHOLDER ANALIZADO: {stakeholder_nombre}
IDEA DEL EMPRENDEDOR: {idea_texto}

INSIGHTS DE {len(insights_por_perfil)} PERFILES DISTINTOS:
{insights_texto}

Analiza estos insights y encuentra patrones. No todos los perfiles tienen que coincidir —
las divergencias son igual de valiosas que los acuerdos.

Responde ÚNICAMENTE con un JSON:
{{
  "job_principal": "el job to be done más importante y compartido por este segmento",
  "patrones_comunes": [
    "patrón 1 que aparece en mayoría de perfiles",
    "patrón 2 compartido"
  ],
  "divergencias": [
    "aspecto donde los perfiles difieren significativamente",
    "otra divergencia importante"
  ],
  "fricciones_criticas": [
    "fricción que bloquea la adopción mencionada por varios perfiles",
    "otra fricción crítica"
  ],
  "oportunidad_clave": "la oportunidad más clara que revelan estos insights",
  "segmentos_identificados": [
    {{
      "nombre": "Sub-segmento A",
      "descripcion": "quiénes son y qué los define",
      "job_especifico": "su job particular dentro del stakeholder"
    }}
  ]
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        temperature=0.3
    )

    result = json.loads(response.choices[0].message.content)
    result["stakeholder_id"] = stakeholder_id
    return result


# ── Síntesis de exploración ───────────────────────────────────────────────────
async def sintetizar_exploracion(datos: SintesisInput) -> SintesisExploracion:
    """
    Recibe el historial completo de todas las conversaciones de la sesión de exploración
    y genera un informe de síntesis estructurado con jobs, patrones, fricciones y
    una validación del problema desde múltiples perspectivas.
    """
    # Construir resumen de conversaciones para el prompt
    total_perfiles = 0
    resumen_conversaciones = ""

    for conv in datos.conversaciones:
        resumen_conversaciones += f"\n{'='*50}\n"
        resumen_conversaciones += f"STAKEHOLDER: {conv.stakeholder_nombre}\n"
        resumen_conversaciones += f"{'='*50}\n"

        for perfil in conv.perfiles:
            total_perfiles += 1
            resumen_conversaciones += f"\nPerfil: {perfil.nombre} ({perfil.ocupacion})\n"
            resumen_conversaciones += f"Variante: {perfil.variante_descripcion}\n"

            # Incluir insights JTBD si están disponibles (más compacto que el historial crudo)
            if perfil.insights_jtbd:
                ins = perfil.insights_jtbd
                resumen_conversaciones += f"  Job funcional: {ins.get('job_funcional', '')}\n"
                resumen_conversaciones += f"  Job emocional: {ins.get('job_emocional', '')}\n"
                resumen_conversaciones += f"  Job social: {ins.get('job_social', '')}\n"
                resumen_conversaciones += f"  Fricciones: {', '.join(ins.get('fricciones', []))}\n"
                resumen_conversaciones += f"  Temores: {', '.join(ins.get('temores', []))}\n"
                resumen_conversaciones += f"  Resultado deseado: {ins.get('resultado_deseado', '')}\n"
                if ins.get('cita_clave'):
                    resumen_conversaciones += f"  Cita clave: \"{ins['cita_clave']}\"\n"
            else:
                # Si no hay insights extraídos, incluir las últimas líneas del historial
                for msg in perfil.historial[-6:]:
                    rol_label = "Emprendedor" if msg.get("rol") == "emprendedor" else perfil.nombre
                    resumen_conversaciones += f"  {rol_label}: {msg.get('contenido', '')[:200]}\n"

    prompt = f"""Eres un investigador de UX y Customer Discovery senior. Acabas de supervisar una sesión
completa de entrevistas con usuarios sintéticos para validar una idea de negocio.

IDEA DEL EMPRENDEDOR:
{datos.idea_texto}

RESUMEN DE {total_perfiles} PERFILES ENTREVISTADOS EN {len(datos.conversaciones)} SEGMENTOS:
{resumen_conversaciones}

Analiza toda esta información y genera el informe de síntesis de exploración.
Sé específico, usa evidencia concreta de las conversaciones y sé honesto sobre
el nivel de validación del problema.

Responde ÚNICAMENTE con un JSON con esta estructura:
{{
  "resumen_problema": "síntesis clara del problema que estos usuarios realmente tienen, en 2-3 oraciones",
  "jobs_principales": [
    {{
      "stakeholder": "nombre del stakeholder",
      "job_funcional": "tarea práctica que necesitan completar",
      "job_emocional": "sentimiento que buscan alcanzar o evitar",
      "job_social": "cómo quieren ser percibidos"
    }}
  ],
  "fricciones_criticas": [
    "fricción que aparece en múltiples perfiles y bloquea la adopción"
  ],
  "temores_recurrentes": [
    "temor que se repite entre distintos perfiles"
  ],
  "patrones_por_stakeholder": [
    {{
      "stakeholder": "nombre del stakeholder",
      "patron": "patrón de comportamiento o actitud detectado",
      "evidencia": "cita textual o paráfrasis de un perfil que lo respalda"
    }}
  ],
  "oportunidades_detectadas": [
    "oportunidad concreta que revelan los insights"
  ],
  "validacion_problema": "validado|parcial|no_validado",
  "nivel_confianza": 0.0,
  "recomendacion_siguiente_paso": "acción concreta y específica para las próximas 2 semanas: qué experimento hacer, con quién, qué métrica medir y qué resultado validaría o refutaría el supuesto más crítico. Máximo 2 oraciones. NO genérico.",
  "total_perfiles_entrevistados": {total_perfiles},
  "total_stakeholders": {len(datos.conversaciones)}
}}

CRITERIOS PARA validacion_problema:
- "validado": la mayoría de perfiles confirman el problema con evidencia concreta
- "parcial": algunos perfiles confirman el problema pero hay inconsistencias o el problema varía por segmento
- "no_validado": los perfiles no muestran evidencia suficiente del problema

nivel_confianza: número entre 0.0 y 1.0 basado en la consistencia y profundidad de las evidencias.
NO incluyas texto fuera del JSON."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=2000,
        temperature=0.3
    )

    data = json.loads(response.choices[0].message.content)
    data["total_perfiles_entrevistados"] = total_perfiles
    data["total_stakeholders"] = len(datos.conversaciones)

    # Evaluar supuestos si fueron provistos
    supuestos_evaluados = None
    if datos.supuestos:
        supuestos_evaluados = await _evaluar_supuestos(
            datos.supuestos, resumen_conversaciones, datos.idea_texto
        )
    data["supuestos_evaluados"] = supuestos_evaluados

    return SintesisExploracion(**data)


async def _evaluar_supuestos(
    supuestos: list,
    resumen_conversaciones: str,
    idea_texto: str
) -> list:
    """Evalúa cada supuesto contra la evidencia de las conversaciones."""
    supuestos_texto = "\n".join(
        f"- [{s['id']}] ({s['tipo']}) {s['enunciado']}" for s in supuestos
    )

    prompt = f"""Eres un investigador experto en validación de supuestos de negocio.

IDEA: {idea_texto}

SUPUESTOS A EVALUAR:
{supuestos_texto}

EVIDENCIA DE ENTREVISTAS:
{resumen_conversaciones[:3000]}

Para cada supuesto, determina si la evidencia lo valida, refuta o es insuficiente.

Responde ÚNICAMENTE con un JSON:
{{
  "evaluaciones": [
    {{
      "supuesto_id": "id_del_supuesto",
      "enunciado": "enunciado original",
      "tipo": "tipo original",
      "veredicto": "validado|parcial|refutado|sin_datos",
      "evidencia": ["cita o paráfrasis concreta de entrevista que respalda el veredicto"],
      "nivel_confianza": 0.0
    }}
  ]
}}

CRITERIOS veredicto:
- "validado": mayoría de perfiles confirma el supuesto con evidencia directa
- "parcial": algunos lo confirman, otros lo contradicen
- "refutado": la evidencia contradice el supuesto
- "sin_datos": no hubo conversaciones relevantes sobre este tema

nivel_confianza: 0.0-1.0 según cantidad y consistencia de evidencia"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1500,
        temperature=0.2
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("evaluaciones", [])