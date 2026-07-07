from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = "dnt-synthetic-users-secret-key-2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Usuarios hardcodeados — 2 cuentas del equipo
USERS = {
    "spacherrest1@upao.edu.pe": {
        "nombre": "Santiago Pacherres",
        "email": "spacherrest1@upao.edu.pe",
        "hashed_password": "$2b$12$PQEHVwaN4HxqQcml82dDwOffYID/BrKJxWSmfn0oh98KgkqgUnC3K",  # pass123
    },
    "rlavadof1@upao.edu.pe": {
        "nombre": "Renzo Lavado",
        "email": "rlavadof1@upao.edu.pe",
        "hashed_password": "$2b$12$QLKJ3EXV02Nx0BMpvE/ONuVO34iv.XLVKCBIfH0PIvkP4Y5unnJL6",  # pass456
    },
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = USERS.get(email)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


async def authenticate_user_async(email: str, password: str) -> Optional[dict]:
    """Check hardcoded users first, then DB users."""
    from app.db import get_user_by_email
    user = USERS.get(email) or await get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = USERS.get(email)
    if not user:
        raise credentials_exception
    return user
