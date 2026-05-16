from openai import AsyncOpenAI
from tavily import TavilyClient
from app.schemas import ContextoDetectado
from dotenv import load_dotenv
import asyncio
import os
import json

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))


# ── Nodo 1: Detección de contexto ────────────────────────────────────────────
async def detectar_contexto(idea_texto: str) -> ContextoDetectado:
    prompt = f"""Eres un analizador experto de ideas de negocio.
Analiza la siguiente idea y extrae el contexto estructurado.

IDEA DEL EMPRENDEDOR:
{idea_texto}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{{
  "sector": "sector principal del negocio",
  "pais": "país detectado o inferido",
  "region": "ciudad o región si se menciona, null si no",
  "idioma": "español",
  "usuarios_objetivo": "descripción del segmento de usuarios principales",
  "modelo_negocio": "tipo de modelo de negocio",
  "riesgos_detectados": ["riesgo 1", "riesgo 2", "riesgo 3"],
  "agentes": [
    {{"rol": "Usuario Objetivo", "tipo": "esencial", "peso": 0.20, "categoria": "M"}},
    {{"rol": "Analista de Negocio", "tipo": "esencial", "peso": 0.20, "categoria": "E"}},
    {{"rol": "Experto Técnico", "tipo": "esencial", "peso": 0.20, "categoria": "E"}},
    {{"rol": "Analista de Contexto", "tipo": "esencial", "peso": 0.20, "categoria": "E"}},
    {{"rol": "Analista de Riesgos", "tipo": "esencial", "peso": 0.20, "categoria": "E"}}
  ]
}}

REGLAS:
- Los 5 agentes esenciales SIEMPRE deben estar presentes
- Si el proyecto es digital/app agrega "Analista de Crecimiento" con peso 0.10
- Si requiere regulación agrega "Asesor Legal" con peso 0.10
- Si hay sector muy específico agrega "Especialista de Rubro" con peso 0.10
- La suma de pesos debe ser exactamente 1.0
- NO incluyas texto fuera del JSON"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=800,
        temperature=0.3
    )

    data = json.loads(response.choices[0].message.content)
    return ContextoDetectado(**data)


# ── Nodo 2: Búsqueda web con Tavily ──────────────────────────────────────────
async def buscar_contexto_web(contexto: ContextoDetectado) -> dict:
    queries = [
        f"{contexto.sector} {contexto.pais} tendencias mercado 2024 2025",
        f"consumidor {contexto.usuarios_objetivo} {contexto.pais} comportamiento",
        f"barreras adopcion {contexto.sector} {contexto.pais} problemas",
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
  "contexto_cultural": "aspectos culturales y locales relevantes"
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=500,
        temperature=0.3
    )

    return json.loads(response.choices[0].message.content)

# ── Nodo 3: Generación de perfiles sintéticos (protocolo Innogyzer) ───────────
async def generar_perfil_agente(
    agente: dict,
    contexto: ContextoDetectado,
    datos_web: dict
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

Responde ÚNICAMENTE con un JSON con esta estructura:
{{
  "nombre": "nombre completo creíble y apropiado para {contexto.pais}",
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
  "postura_debate": "su postura crítica específica sobre esta idea de negocio en 1-2 oraciones",
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

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        temperature=0.8
    )

    perfil = json.loads(response.choices[0].message.content)
    perfil["rol"] = agente["rol"]
    perfil["categoria"] = agente["categoria"]
    perfil["peso"] = agente["peso"]
    perfil["tipo"] = agente["tipo"]
    return perfil


async def generar_todos_los_perfiles(
    contexto: ContextoDetectado,
    datos_web: dict
) -> list[dict]:
    """
    Genera los perfiles de todos los agentes en paralelo usando asyncio.gather().
    """
    tareas = [
        generar_perfil_agente(
            agente=agente.model_dump(),
            contexto=contexto,
            datos_web=datos_web
        )
        for agente in contexto.agentes
    ]

    perfiles = await asyncio.gather(*tareas)
    return list(perfiles)