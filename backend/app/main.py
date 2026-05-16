from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from app.api import router
# Cargar variables de entorno del archivo .env
load_dotenv()

# Crear la aplicación FastAPI
app = FastAPI(
    title="Synthetic Users DNT",
    description="Sistema multiagente de usuarios sintéticos basados en LLMs",
    version="1.0.0"
)

# Configurar CORS — permite que el frontend Next.js se comunique con el backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL del frontend en desarrollo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Endpoints base ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "proyecto": "Synthetic Users DNT",
        "version": "1.0.0",
        "estado": "activo"
    }

@app.get("/health")
def health_check():
    return {
        "status": "OK",
        "environment": os.getenv("ENVIRONMENT", "development")
    }

app.include_router(router, prefix="/api")