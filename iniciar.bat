@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Iniciando o site da LUX...
rem abre o navegador 2 segundos depois, quando o servidor já está pronto
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8000"
python servidor.py
pause
