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

# ── Nodo 4: Debate adversarial por agente ─────────────────────────────────────
async def generar_argumento_agente(
    perfil: dict,
    idea_texto: str,
    contexto: ContextoDetectado
) -> dict:
    """
    Genera el argumento adversarial de UN agente sobre la idea.
    El agente habla desde su identidad y postura crítica — no complace.
    """

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
        f"LA IDEA QUE DEBES EVALUAR:\n{idea_texto}\n\n"
        f"TU ROL EN ESTE DEBATE: {perfil['rol']}\n\n"
        "REGLAS ESTRICTAS:\n"
        "- Habla SIEMPRE en primera persona como ese personaje\n"
        "- NO menciones que eres una IA\n"
        "- NO uses frases genéricas como 'Como experto...'\n"
        "- USA tu vocabulario y tono característico\n"
        "- Se CRÍTICO y ESPECÍFICO — no valides sin cuestionar\n"
        "- Menciona al menos UN punto débil concreto de la idea\n"
        "- Responde en máximo 4 oraciones directas y contundentes\n"
        "- NO uses listas ni bullets — habla naturalmente\n\n"
        "Ahora da tu argumento sobre esta idea:"
    )

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300,
        temperature=0.85
    )

    argumento = response.choices[0].message.content

    # Clasificar posición automáticamente
    prompt_clasif = (
        f"Clasifica este argumento en una sola palabra: pro, contra, o neutral.\n"
        f"Argumento: {argumento}\n"
        f"Responde solo con: pro, contra, o neutral"
    )

    clasif = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt_clasif}],
        max_tokens=5,
        temperature=0
    )

    posicion = clasif.choices[0].message.content.strip().lower()
    if posicion not in ["pro", "contra", "neutral"]:
        posicion = "neutral"

    return {
        "agente_rol": perfil["rol"],
        "agente_nombre": perfil["nombre"],
        "agente_categoria": perfil["categoria"],
        "agente_peso": perfil["peso"],
        "argumento": argumento,
        "posicion": posicion
    }


async def ejecutar_debate(
    perfiles: list,
    idea_texto: str,
    contexto: ContextoDetectado
) -> list:
    """
    Ejecuta el debate completo: todos los agentes argumentan en paralelo.
    """
    tareas = [
        generar_argumento_agente(perfil, idea_texto, contexto)
        for perfil in perfiles
    ]
    argumentos = await asyncio.gather(*tareas)
    return list(argumentos)

# ── Nodo 5: Consenso ponderado y árbol de argumentos ─────────────────────────
async def generar_consenso(
    argumentos: list,
    idea_texto: str,
    contexto: ContextoDetectado
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

    prompt = (
        "Eres un sintetizador experto de debates de evaluación de ideas de negocio.\n\n"
        f"IDEA EVALUADA:\n{idea_texto}\n\n"
        f"DEBATE ENTRE AGENTES ESPECIALIZADOS:\n{resumen_debate}\n\n"
        "Analiza el debate y genera el árbol de argumentos estructurado.\n"
        "Ten en cuenta el PESO de cada agente al calcular el consenso "
        "(mayor peso = mayor influencia en la recomendación).\n\n"
        "Responde ÚNICAMENTE con un JSON con esta estructura:\n"
        "{\n"
        '  "acuerdos": [\n'
        '    {"punto": "descripción del acuerdo", "agentes": ["rol1", "rol2"]}\n'
        "  ],\n"
        '  "divergencias": [\n'
        '    {"punto": "descripción del desacuerdo", "agente_a": "rol1", "agente_b": "rol2"}\n'
        "  ],\n"
        '  "fortalezas_idea": ["fortaleza 1", "fortaleza 2"],\n'
        '  "debilidades_idea": ["debilidad 1", "debilidad 2"],\n'
        '  "recomendacion": "viable|no_viable|condicionalmente_viable",\n'
        '  "nivel_confianza": 0.75,\n'
        '  "condiciones": ["condición 1 si es condicionalmente viable", "condición 2"],\n'
        '  "resumen_ejecutivo": "resumen del debate en 2-3 oraciones para el emprendedor"\n'
        "}"
    )

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        temperature=0.3
    )

    return json.loads(response.choices[0].message.content)