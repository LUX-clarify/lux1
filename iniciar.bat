@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem no Windows o Python costuma vir como "py"; "python" pode ser só o atalho da Microsoft Store
set PY=python
py --version >nul 2>&1 && set PY=py
%PY% --version >nul 2>&1 || (
    echo Python nao encontrado. Instale em https://www.python.org/downloads/ e marque "Add python.exe to PATH".
    pause
    exit /b 1
)
echo Iniciando o site da LUX...
rem abre o navegador 2 segundos depois, quando o servidor já está pronto
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8000"
%PY% servidor.py
pause
