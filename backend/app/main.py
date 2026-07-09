from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
from app.api import router
from app.db import init_db
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from app.vector_store import init_tables
    await init_tables()
    yield

app = FastAPI(
    lifespan=lifespan,
    title="Synthetic Users DNT",
    description="Sistema multiagente de usuarios sintéticos basados en LLMs",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://synthetic-users-dnt-three.vercel.app",
        "*"
    ],
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
