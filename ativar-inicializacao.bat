@echo off
chcp 65001 >nul
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_HTML=c:\Users\pedro\OneDrive\Desktop\FormgivaWeb\index.html"
set "SHORTCUT_SCRIPT=%STARTUP_FOLDER%\Abrir-FormgivaWeb.bat"

echo @echo off > "%SHORTCUT_SCRIPT%"
echo start "" "%TARGET_HTML%" >> "%SHORTCUT_SCRIPT%"

echo ========================================================
echo Pronto! O FormgivaWeb agora vai abrir automaticamente
echo toda vez que voce ligar o computador.
echo Local configurado: %SHORTCUT_SCRIPT%
echo ========================================================
pause
