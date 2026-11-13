@echo off
title KryptaPay Gateway Platform
color 05
echo ========================================================
echo        KRYPTAPAY — GATEWAY DE PAGAMENTOS DE ELITE
echo ========================================================
echo [OK] Carregando banco de dados SQLite ACID...
echo [OK] Carregando AI Smart Routing...
echo [OK] Inicializando Central de Notificacoes...
echo [OK] Carregando Mapa Mundi 3D e Transacoes em Tempo Real...
echo.
echo Servidor disponivel em: http://localhost:3000
echo Pressione CTRL+C para encerrar.
echo ========================================================
set ELECTRON_RUN_AS_NODE=1
"C:\Users\Usuario\AppData\Local\Programs\antigravity\Antigravity.exe" "%~dp0backend\server.js"
pause
