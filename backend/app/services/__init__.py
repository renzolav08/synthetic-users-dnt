from openai import AsyncOpenAI
from app.schemas import ContextoDetectado
from dotenv import load_dotenv
import os
import json

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Nodo 1: Detección de contexto ─────────────────────────────────────────────
async def detectar_contexto(idea_texto: str) -> ContextoDetectado:
    """
    Recibe la idea en texto libre y devuelve el contexto estructurado
    que el orquestador usará para crear los agentes.
    """

    prompt = f"""Eres un analizador experto de ideas de negocio. 
Analiza la siguiente idea y extrae el contexto estructurado.

IDEA DEL EMPRENDEDOR:
{idea_texto}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{{
  "sector": "sector principal del negocio (ej: tecnología, salud, educación, retail)",
  "pais": "país detectado o inferido (ej: Perú, México, Colombia, España)",
  "region": "ciudad o región si se menciona, null si no",
  "idioma": "español",
  "usuarios_objetivo": "descripción del segmento de usuarios principales",
  "modelo_negocio": "tipo de modelo (ej: marketplace, SaaS, servicio, producto físico)",
  "riesgos_detectados": ["riesgo 1", "riesgo 2", "riesgo 3"],
  "agentes": [
    {{
      "rol": "Usuario Objetivo",
      "tipo": "esencial",
      "peso": 0.20,
      "categoria": "M"
    }},
    {{
      "rol": "Analista de Negocio",
      "tipo": "esencial",
      "peso": 0.20,
      "categoria": "E"
    }},
    {{
      "rol": "Experto Técnico",
      "tipo": "esencial",
      "peso": 0.20,
      "categoria": "E"
    }},
    {{
      "rol": "Analista de Contexto",
      "tipo": "esencial",
      "peso": 0.20,
      "categoria": "E"
    }},
    {{
      "rol": "Analista de Riesgos",
      "tipo": "esencial",
      "peso": 0.20,
      "categoria": "E"
    }}
  ]
}}

REGLAS:
- Los 5 agentes esenciales SIEMPRE deben estar presentes
- Si el proyecto es digital/app, agrega un agente dinámico "Analista de Crecimiento" con peso 0.10 y reduce los esenciales proporcionalmente
- Si el proyecto requiere regulación (salud, fintech, educación), agrega "Asesor Legal" con peso 0.10
- Si hay un sector muy específico, agrega "Especialista de Rubro" con peso 0.10
- La suma de todos los pesos debe ser exactamente 1.0
- NO incluyas texto fuera del JSON"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=800,
        temperature=0.3
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)
    return ContextoDetectado(**data)