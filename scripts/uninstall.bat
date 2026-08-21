@echo off
REM ============================================================
REM ASCEND Auto-Tracker - Disinstallazione Windows
REM Doppio click per disinstallare. Richiede diritti admin.
REM ============================================================

@echo on
echo ============================================================
echo ASCEND Auto-Tracker - Disinstallazione
echo ============================================================
echo.

REM Verifica admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERRORE: Devi eseguire come Amministratore.
    echo Tasto destro su uninstall.bat -> "Esegui come amministratore"
    pause
    exit /b 1
)

SETLOCAL ENABLEEXTENSIONS

set "TASK_NAME=AscendWindowTracker"
set "APPDATA_DIR=%LOCALAPPDATA%\Ascend"
set "TRACKER_DIR=%APPDATA_DIR%\tracker"
set "DATA_DIR=%APPDATA_DIR%\pc-usage"

echo [1/4] Arresto e rimozione Scheduled Task...
schtasks /Query /TN "AscendWindowTracker" >nul 2>&1
if %errorLevel% equ 0 (
    schtasks /End /TN "AscendWindowTracker" >nul 2>&1
    schtasks /Delete /TN "AscendWindowTracker" /F >nul 2>&1
    echo OK: Task rimosso
) else (
    echo Nessun task da rimuovere
)

echo [2/4] Terminazione processi tracker attivi...
tasklist /FI "IMAGENAME eq powershell.exe" /FI "WINDOWTITLE eq *" 2>nul | findstr /I "track-window" >nul
if %errorLevel% equ 0 (
    taskkill /F /FI "WINDOWTITLE eq *track-window*" >nul 2>&1
    echo Processi tracker terminati
) else (
    echo Nessun processo tracker attivo
)

echo [3/4] Rimozione file tracker...
if exist "%LOCALAPPDATA%\Ascend\tracker\track-window.ps1" (
    del /F /Q "%LOCALAPPDATA%\Ascend\tracker\track-window.ps1" >nul 2>&1
    rmdir "%LOCALAPPDATA%\Ascend\tracker" 2>nul
    echo File tracker rimossi
)

echo [4/4] Pulizia opzionale dati (chiede conferma)...
echo.
echo ATTENZIONE: Questa operazione CANCELLA TUTTI I DATI di tracking (%LOCALAPPDATA%\Ascend\pc-usage\).
echo I file .jsonl con lo storico dell'uso PC verranno PERMANENTEMENTE ELIMINATI.
echo.
set /p CONFIRM="Vuoi eliminare anche i dati storici? [s/N]: "
if /I "%CONFIRM%"=="S" (
    if exist "%LOCALAPPDATA%\Ascend\pc-usage" (
        rmdir /S /Q "%LOCALAPPDATA%\Ascend\pc-usage" 2>nul
        echo Dati cancellati
    )
    if exist "%LOCALAPPDATA%\Ascend" (
        rmdir "%LOCALAPPDATA%\Ascend" 2>nul
        echo Cartella Ascend rimossa
    )
) else (
    echo Dati conservati in: %LOCALAPPDATA%\Ascend\pc-usage\
)

echo.
echo ============================================================
echo DISINSTALLAZIONE COMPLETATA
echo ============================================================
echo Il tracker Ascend e' stato rimosso completamente.
echo.
pause
exit /b 0