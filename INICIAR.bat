@echo off
chcp 65001 >nul
title Cerámica EL LAPACHO — Servidor
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js no esta instalado.
  echo Descarguelo desde https://nodejs.org e instalelo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias la primera vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

echo.
echo ============================================
echo   CERÁMICA EL LAPACHO
echo ============================================
echo   Abriendo el sistema en el navegador...
echo   NO cierre esta ventana mientras lo use.
echo ============================================
echo.

start "" "http://localhost:3780/"
node server.js
pause
