@echo off
chcp 65001 >nul
set "SHORTCUT_SCRIPT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Abrir-FormgivaWeb.bat"

if exist "%SHORTCUT_SCRIPT%" (
    del "%SHORTCUT_SCRIPT%"
    echo Inicializacao automatica do FormgivaWeb foi DESATIVADA com sucesso!
) else (
    echo A inicializacao automatica ja estava desativada.
)
pause
