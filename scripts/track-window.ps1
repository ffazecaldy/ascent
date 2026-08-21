<#
.SYNOPSIS
    ASCEND Auto-Tracker - Window Activity Tracker (PowerShell Native)
.DESCRIPTION
    Traccia la finestra attiva ogni N secondi e scrive JSONL in %LOCALAPPDATA%\Ascend\pc-usage\
    Zero dipendenze esterne, solo PowerShell nativo + user32.dll P/Invoke.
    Target: <0.2% CPU, <15 MB RAM, zero install.
.NOTES
    Installazione: install.bat (come admin) -> crea Scheduled Task all'avvio
    Dati: %LOCALAPPDATA%\Ascend\pc-usage\pc-usage-YYYY-MM-DD.jsonl
    Disinstallazione: uninstall.bat (come admin)
#>

# ------------------------------------------------------------
# CONFIGURAZIONE (modificabile via variabili d'ambiente)
# ------------------------------------------------------------
$IntervalSec = $env:INTERVAL_SEC ?? 30          # secondi tra campioni (default 30s)
$DataDir     = "$env:LOCALAPPDATA\Ascend\pc-usage"
$LogErrors   = $true                            # log errori su stderr

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

    $pid = 0
    [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
    if ($pid -eq 0) { return $null }

    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
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
        pid  = $pid
        hwnd = [int]$hwnd
        path = $path
    }
}

# ------------------------------------------------------------
# SCRITTURA ATOMICA JSONL (tmp + rename)
# ------------------------------------------------------------
function Write-JsonlAtomic {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][object]$Object
    )
    $dir = Split-Path -Parent $FilePath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $json = $Object | ConvertTo-Json -Compress -Depth 5
    $tmp = "$FilePath.tmp.$([guid]::NewGuid())"
    try {
        Set-Content -Path $tmp -Value $json -Encoding UTF8 -NoNewline
        Add-Content -Path $tmp -Value "`n" -Encoding UTF8
        Move-Item -Path $tmp -Destination $FilePath -Force
    } catch {
        if (Test-Path $tmp) { Remove-Item -Force $tmp -ErrorAction SilentlyContinue }
        Write-Error "Scrittura fallita: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------
# ROTAZIONE GIORNALIERA
# ------------------------------------------------------------
function Get-DailyFilePath {
    $date = (Get-Date).ToString("yyyy-MM-dd")
    return Join-Path $DataDir "pc-usage-$date.jsonl"
}

# ------------------------------------------------------------
# MAIN LOOP
# ------------------------------------------------------------
function Start-Tracker {
    Write-Host "Ascend Window Tracker avviato (interval: ${IntervalSec}s, dir: $DataDir)" -ForegroundColor Green

    $lastDay = (Get-Date).DayOfYear

    try {
        while ($true) {
            # Controlla rotazione mezzanotte
            $now = Get-Date
            if ($now.DayOfYear -ne $lastDay) {
                $lastDay = $now.DayOfYear
                # nuovo file verrà creato automaticamente da Get-DailyFilePath
            }

            $info = Get-ActiveWindowInfo
            if ($info) {
                $file = Get-DailyFilePath
                Write-JsonlAtomic -FilePath $file -Object $info
            }

            Start-Sleep -Seconds $IntervalSec
        }
    } catch {
        $msg = "TRACKER ERROR: $($_.Exception.Message)"
        Write-Error $msg
        if ($LogErrors) { $msg | Out-File -FilePath (Join-Path $DataDir "tracker-errors.log") -Encoding UTF8 -Append }
    } finally {
        Write-Host "Tracker terminato." -ForegroundColor Yellow
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
        $info = Get-ActiveWindowInfo
        if ($info) {
            $file = Get-DailyFilePath
            Write-JsonlAtomic -FilePath $file -Object $info
            Write-Host "Campione scritto in $file"
        } else {
            Write-Warning "Nessuna finestra attiva valida"
        }
        exit 0
    }
}

Start-Tracker