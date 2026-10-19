@echo off
title FormgivaWeb - Enviar Alteracoes para o GitHub
echo ============================================
echo   FormgivaWeb - Sincronizacao com GitHub
echo ============================================
cd /d "%~dp0"

set "GIT_EXE=%LOCALAPPDATA%\GitHubDesktop\app-3.6.7\resources\app\git\cmd\git.exe"

if not exist "%GIT_EXE%" (
    for /d %%i in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
        if exist "%%i\resources\app\git\cmd\git.exe" set "GIT_EXE=%%i\resources\app\git\cmd\git.exe"
    )
)

echo 1. Preparando arquivos modificados...
"%GIT_EXE%" add index.html styles.css app.js image-editor.js html-editor.js font-detector.js

echo 2. Registrando atualizacao...
"%GIT_EXE%" commit -m "FormgivaWeb: Atualizacao do sistema"

echo 3. Enviando para o GitHub Pages...
"%GIT_EXE%" push origin main

echo ============================================
echo   Sucesso! Publicado em:
echo   https://pedrodasilva1001.github.io/formgivaweb/
echo ============================================
pause
