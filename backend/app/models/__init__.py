from sqlalchemy import Column, String, Float, Integer, DateTime, Text, JSON
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Team(Base):
    __tablename__ = "teams"
    id = Column(String, primary_key=True, default=generate_uuid)
    nombre = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class DebateSession(Base):
    __tablename__ = "debate_sessions"
    id = Column(String, primary_key=True, default=generate_uuid)
    team_id = Column(String, nullable=True)
    idea_texto = Column(Text, nullable=False)
    contexto_json = Column(JSON, nullable=True)
    agentes_json = Column(JSON, nullable=True)
    veredicto = Column(String(50), nullable=True)
    confianza = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)

class AgentArgument(Base):
    __tablename__ = "agent_arguments"
    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, nullable=False)
    agent_role = Column(String(100), nullable=False)
    agent_profile_json = Column(JSON, nullable=True)
    argument_text = Column(Text, nullable=False)
    posicion = Column(String(50), nullable=True)
    turno = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ConsensusResult(Base):
    __tablename__ = "consensus_results"
    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, nullable=False)
    acuerdos_json = Column(JSON, nullable=True)
    divergencias_json = Column(JSON, nullable=True)
    recomendacion = Column(String(50), nullable=True)
    nivel_confianza = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SurveyResponse(Base):
    __tablename__ = "survey_responses"
    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, nullable=False)
    dim_utilidad = Column(Integer, nullable=True)
    dim_facilidad = Column(Integer, nullable=True)
    dim_calidad = Column(Integer, nullable=True)
    dim_reuso = Column(Integer, nullable=True)
    dim_confianza = Column(Integer, nullable=True)
    comentario = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())