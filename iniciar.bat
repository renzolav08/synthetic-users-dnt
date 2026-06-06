@echo off
echo Iniciando Synthetic Users DNT...
echo.

:: Limpiar cache de Next.js
if exist "frontend\.next" (
    echo Limpiando cache...
    rmdir /s /q "frontend\.next"
)

:: Iniciar Backend
echo Iniciando Backend (puerto 8000)...
start "Backend - FastAPI" cmd /k "cd backend && python -m uvicorn app.main:app --reload --port 8000"

:: Esperar 3 segundos
timeout /t 3 /nobreak > nul

:: Iniciar Frontend
echo Iniciando Frontend (puerto 3000)...
start "Frontend - Next.js" cmd /k "cd frontend && node node_modules/next/dist/bin/next dev"

echo.
echo Listo! Espera unos segundos y abre:
echo   http://localhost:3000
echo.
pause
