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