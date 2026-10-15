@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Transforma uma conta do site em administrador.
echo (A conta precisa ter sido criada antes pela pagina de Cadastro.)
echo.
set /p EMAIL=Digite o e-mail da conta:
set PY=python
py --version >nul 2>&1 && set PY=py
%PY% servidor.py --admin "%EMAIL%"
echo.
pause
