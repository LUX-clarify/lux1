@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Envia um e-mail de teste para a caixa da LUX usando a senha do arquivo .env.
echo.
set PY=python
py --version >nul 2>&1 && set PY=py
%PY% servidor.py --testar-email
echo.
pause
