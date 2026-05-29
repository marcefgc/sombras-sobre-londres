@echo off
title Sombras sobre Londres
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
echo.
echo ============================================================
echo  Servidor iniciado. Tus amigos deben abrir en su navegador:
echo  http://[TU-IP-LOCAL]:3000   (mira tu IP con: ipconfig)
echo  Para detener el servidor cierra esta ventana.
echo ============================================================
echo.
node server.js
pause
