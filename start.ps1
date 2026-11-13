# Iniciar KryptaPay Platform
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "       KRYPTAPAY — GATEWAY DE PAGAMENTOS DE ELITE       " -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "Iniciando servidor local com Mapa 3D e Notificacoes..." -ForegroundColor Cyan
Write-Host "Acesse em seu navegador: http://localhost:3000" -ForegroundColor Green
$env:ELECTRON_RUN_AS_NODE = "1"
& "C:\Users\Usuario\AppData\Local\Programs\antigravity\Antigravity.exe" "$PSScriptRoot\backend\server.js"
