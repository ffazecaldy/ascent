<#
.SYNOPSIS
    ASCEND Auto-Tracker - Window Activity Tracker (PowerShell Native)
.DESCRIPTION
    Traccia la finestra attiva ogni N secondi e scrive JSONL in %LOCALAPPDATA%\Ascend\pc-usage\
    Zero dipendenze esterne, solo PowerShell nativo + user32.dll P/Invoke.
    Target: <0.2% CPU, <15 MB RAM, zero install.

    Single-instance: lock file .lock nel data dir (pid + staleness check).
    Se un'altra istanza è già attiva, esce subito con un messaggio
    (round-robin: una sola scrive i dati — niente duplicati né righe perse).

    Scritture: APPEND di righe JSONL (una riga = un campione), niente
    read-modify-write. Retention: i JSONL più vecchi di ASCEND_RETENTION_DAYS
    (default 90) vengono rimossi all'avvio e una volta al giorno.
.NOTES
    Installazione: install.bat (come admin) -> crea Scheduled Task all'avvio
                      (restart on failure: RestartCount 999, intervallo 1 min)
    Dati: %LOCALAPPDATA%\Ascend\pc-usage\pc-usage-YYYY-MM-DD.jsonl
    Disinstallazione: uninstall.bat (come admin)
#>

# ------------------------------------------------------------
# CONFIGURAZIONE (modificabile via variabili d'ambiente)
# ------------------------------------------------------------
$IntervalSec = 30                                   # secondi tra campioni (default 30s)
if ($env:INTERVAL_SEC -and $env:INTERVAL_SEC -match '^\d{1,4}$') { $IntervalSec = [int]$env:INTERVAL_SEC }
$DataDir     = "$env:LOCALAPPDATA\Ascend\pc-usage"
if ($env:ASCEND_DATA_DIR) { $DataDir = $env:ASCEND_DATA_DIR }   # override (test/dev)
$LogErrors   = $true                            # log errori su stderr
$RetentionDays = 90
if ($env:ASCEND_RETENTION_DAYS -and $env:ASCEND_RETENTION_DAYS -match '^\d{1,4}$') { $RetentionDays = [int]$env:ASCEND_RETENTION_DAYS }

# ------------------------------------------------------------
# P/INVOKE user32.dll - solo ciò che serve
# ------------------------------------------------------------
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Win32 {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@

# ------------------------------------------------------------
# LOCK SINGLE-INSTANCE (pid + staleness check)
# ------------------------------------------------------------
$script:LockAcquired = $false
$script:LockPath = Join-Path $DataDir ".lock"

function Test-AcquireLock {
    # Crea il lock in modo ATOMICO (CreateNew fallisce se esiste già).
    # Se esiste un lock con pid morto (crash) o corrotto, lo prende.
    if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        try {
            $fs = [System.IO.File]::Open($script:LockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            try {
                $bytes = [System.Text.Encoding]::ASCII.GetBytes("$PID")
                $fs.Write($bytes, 0, $bytes.Length)
            } finally {
                $fs.Close()
            }
            $script:LockAcquired = $true
            return $true
        } catch {
            # lock già esistente: è di un processo ancora vivo?
            $oldPid = 0
            try { $oldPid = [int]((Get-Content -Path $script:LockPath -Raw -ErrorAction Stop).Trim()) } catch { $oldPid = 0 }
            if ($oldPid -le 0 -or -not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
                # pid morto o file corrotto → prendi possesso
                Remove-Item -Path $script:LockPath -Force -ErrorAction SilentlyContinue
                continue
            }
            return $false
        }
    }
    return $false
}

function Remove-Lock {
    if (-not $script:LockAcquired) { return }
    try {
        if (Test-Path $script:LockPath) {
            $content = (Get-Content -Path $script:LockPath -Raw -ErrorAction Stop).Trim()
            if ($content -eq "$PID") { Remove-Item -Path $script:LockPath -Force -ErrorAction SilentlyContinue }
        }
    } catch { }
    $script:LockAcquired = $false
}

# ------------------------------------------------------------
# HELPER: ottieni info finestra attiva
# ------------------------------------------------------------
function Get-ActiveWindowInfo {
    $hwnd = [Win32]::GetForegroundWindow()
    if (-not $hwnd -or $hwnd -eq [IntPtr]::Zero) { return $null }

    if (-not [Win32]::IsWindowVisible($hwnd) -or [Win32]::IsIconic($hwnd)) { return $null }

    $len = [Win32]::GetWindowTextLength($hwnd)
    if ($len -eq 0) { return $null }

    $sb = New-Object System.Text.StringBuilder($len + 1)
    [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
    $title = $sb.ToString()
    if ([string]::IsNullOrWhiteSpace($title)) { return $null }

    $winPid = 0
    [Win32]::GetWindowThreadProcessId($hwnd, [ref]$winPid) | Out-Null
    if ($winPid -eq 0) { return $null }

    try {
        $proc = Get-Process -Id $winPid -ErrorAction Stop
        $exe = $proc.ProcessName + ".exe"
        $path = $proc.Path
    } catch {
        $exe = "unknown.exe"
        $path = ""
    }

    return @{
        ts   = (Get-Date).ToString("o")  # ISO 8601 con offset
        exe  = $exe
        title = $title
        winPid = $winPid
        pid  = $winPid
        hwnd = [int]$hwnd
        path = $path
    }
}

# ------------------------------------------------------------
# SCRITTURA APPEND JSONL (una riga = un campione, UTF-8 senza BOM).
# Single-instance garantisce un solo scrittore: nessuna interleaving.
# ------------------------------------------------------------
function Write-JsonlAppend {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][object]$Object
    )
    $dir = Split-Path -Parent $FilePath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $json = $Object | ConvertTo-Json -Compress -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($FilePath, $json + "`n", $utf8NoBom)
}

# ------------------------------------------------------------
# ROTAZIONE GIORNALIERA
# ------------------------------------------------------------
function Get-DailyFilePath {
    $date = (Get-Date).ToString("yyyy-MM-dd")
    return Join-Path $DataDir "pc-usage-$date.jsonl"
}

# ------------------------------------------------------------
# RETENTION: rimuovi i JSONL più vecchi di $RetentionDays giorni
# (confronto sulla data nel nome file, non su mtime)
# ------------------------------------------------------------
function Remove-OldData {
    try {
        $cutoff = (Get-Date).AddDays(-$RetentionDays).ToString("yyyy-MM-dd")
        Get-ChildItem -Path $DataDir -Filter "pc-usage-*.jsonl" -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.BaseName -match '^pc-usage-(\d{4}-\d{2}-\d{2})$' -and $matches[1] -lt $cutoff) {
                Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    } catch { }
}

# ------------------------------------------------------------
# MAIN LOOP
# ------------------------------------------------------------
function Start-Tracker {
    Write-Host "Ascend Window Tracker avviato (interval: ${IntervalSec}s, dir: $DataDir)" -ForegroundColor Green

    $lastDay = (Get-Date).DayOfYear
    Remove-OldData   # prune all'avvio

    while ($true) {
        try {
            # Controlla rotazione mezzanotte + prune giornaliero
            $now = Get-Date
            if ($now.DayOfYear -ne $lastDay) {
                $lastDay = $now.DayOfYear
                Remove-OldData
                # nuovo file verrà creato automaticamente da Get-DailyFilePath
            }

            $info = Get-ActiveWindowInfo
            if ($info) {
                $file = Get-DailyFilePath
                Write-JsonlAppend -FilePath $file -Object $info
            }
        } catch {
            # Errore I/O transitorio (es. disco occupato): logga e CONTINUA.
            # Il try/catch dentro il loop impedisce che un singolo errore
            # uccida il tracker per ore di attività perse.
            $msg = "TRACKER ERROR: $($_.Exception.Message)"
            Write-Error $msg
            if ($LogErrors) {
                try { $msg | Out-File -FilePath (Join-Path $DataDir "tracker-errors.log") -Encoding UTF8 -Append } catch { }
            }
        }
        Start-Sleep -Seconds $IntervalSec
    }
}

# ------------------------------------------------------------
# ENTRY POINT
# ------------------------------------------------------------
# Supporto parametri CLI
if ($args.Count -gt 0) {
    if ($args[0] -eq "--test") {
        Write-Host "Test singolo campione..."
        $info = Get-ActiveWindowInfo
        $info | ConvertTo-Json -Depth 5
        exit 0
    }
    if ($args[0] -eq "--once") {
        if (-not (Test-AcquireLock)) {
            Write-Host "Un'altra istanza del tracker e' gia' attiva (lock $script:LockPath) - esco." -ForegroundColor Yellow
            exit 1
        }
        try {
            $info = Get-ActiveWindowInfo
            if ($info) {
                $file = Get-DailyFilePath
                Write-JsonlAppend -FilePath $file -Object $info
                Write-Host "Campione scritto in $file"
            } else {
                Write-Warning "Nessuna finestra attiva valida"
            }
        } finally {
            Remove-Lock
        }
        exit 0
    }
    if ($args[0] -eq "--prune") {
        Write-Host "Prune retention (${RetentionDays}g) su $DataDir ..."
        Remove-OldData
        Write-Host "Fatto."
        exit 0
    }
}

if (-not (Test-AcquireLock)) {
    Write-Host "Un'altra istanza del tracker e' gia' attiva (lock $script:LockPath) - esco." -ForegroundColor Yellow
    exit 1
}

try {
    Start-Tracker
} finally {
    Remove-Lock
}