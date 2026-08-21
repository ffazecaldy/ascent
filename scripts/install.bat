@echo off
REM ============================================================
REM ASCEND Auto-Tracker - Installazione Windows
REM Doppio click per installare. Richiede diritti admin per Scheduled Task.
REM ============================================================

@echo on
echo ============================================================
echo ASCEND Auto-Tracker - Installazione
echo ============================================================
echo.

REM Verifica admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERRORE: Devi eseguire come Amministratore.
    echo Tasto destro su install.bat -> "Esegui come amministratore"
    pause
    exit /b 1
)

SETLOCAL ENABLEEXTENSIONS

REM Percorsi
set "APPDATA_DIR=%LOCALAPPDATA%\Ascend"
set "TRACKER_DIR=%APPDATA_DIR%\tracker"
set "DATA_DIR=%APPDATA_DIR%\pc-usage"
set "SCRIPT_NAME=track-window.ps1"
set "SCRIPT_SRC=%~dp0track-window.ps1"
set "SCRIPT_DST=%TRACKER_DIR%\%SCRIPT_NAME%"
set "TASK_NAME=AscendWindowTracker"

echo [1/6] Creazione cartelle...
mkdir "%APPDATA_DIR%" 2>nul
mkdir "%TRACKER_DIR%" 2>nul
mkdir "%DATA_DIR%" 2>nul
echo OK

echo [2/6] Copia script tracker...
if not exist "%SCRIPT_SRC%" (
    echo ERRORE: %SCRIPT_SRC% non trovato. Metti track-window.ps1 accanto a install.bat
    pause
    exit /b 1
)
copy /Y "%SCRIPT_SRC%" "%SCRIPT_DST%" >nul
echo OK: %SCRIPT_DST%

echo [3/6] Verifica PowerShell execution policy...
powershell -NoProfile -Command "Get-ExecutionPolicy" | findstr /R "RemoteSigned Unrestricted Bypass" >nul
if %errorLevel% neq 0 (
    echo Impostazione ExecutionPolicy su RemoteSigned per l'utente corrente...
    powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" >nul 2>&1
    if %errorLevel% neq 0 (
        echo ATTENZIONE: Impossibile impostare ExecutionPolicy. Potresti doverlo fare manualmente:
        echo   powershell -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"
    ) else (
        echo OK
    )
) else (
    echo OK: ExecutionPolicy gia' permissiva
)

echo [4/6] Creazione Scheduled Task (avvio al login, massimi privilegi)...
REM Rimuovi task esistente se presente
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    echo Task esistente trovato - rimozione...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
)

schtasks /Create ^
    /TN "%TASK_NAME%" ^
    /TR "powershell.exe -Window Hidden -ExecutionPolicy Bypass -File \"%SCRIPT_DST%\"" ^
    /SC ONLOGON ^
    /RL HIGHEST ^
    /F ^
    /IT ^
    /V1

if %errorLevel% equ 0 (
    echo OK: Task "%TASK_NAME%" creato
) else (
    echo ERRORE: Impossibile creare il task. Verifica permessi.
    pause
    exit /b 1
)

echo [5/6] Avvio immediato del tracker (test)...
start /B powershell.exe -Window Hidden -ExecutionPolicy Bypass -File "%SCRIPT_DST%"
timeout /t 3 /nobreak >nul

REM Verifica che il file jsonl sia stato creato
set "TODAY=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%"
set "JSONL_FILE=%DATA_DIR%\pc-usage-%TODAY%.jsonl"
if exist "%JSONL_FILE%" (
    echo OK: File dati creato: %JSONL_FILE%
) else (
    echo ATTENZIONE: File dati non ancora visibile (il tracker scrive al primo campione).
    echo           Controlla tra 30 secondi: %JSONL_FILE%
)

echo [6/6] Pulizia e completamento...
echo.
echo ============================================================
echo INSTALLAZIONE COMPLETATA
echo ============================================================
echo.
echo Il tracker ora gira in background e si avvia automaticamente al login.
echo.
echo Dati salvati in: %DATA_DIR%
echo Script tracker:  %SCRIPT_DST%
echo Task Scheduler:  %TASK_NAME% (avvio al login, massimi privilegi)
echo.
echo Per importare in Ascend:
echo   1. Apri Ascend -> Uso PC
echo   2. Clicca "Importa auto-tracker"
echo   3. Seleziona la cartella: %DATA_DIR%
echo.
echo Per disinstallare: doppio click su uninstall.bat (come admin)
echo.
pause

exit /b 0