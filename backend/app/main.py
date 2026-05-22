from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from app.api import router
load_dotenv()

app = FastAPI(
    title="Synthetic Users DNT",
    description="Sistema multiagente de usuarios sintéticos basados en LLMs",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



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