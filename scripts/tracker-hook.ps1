# ============================================================
# ASCEND Window Tracker — HOOK event-driven (foreground via WinEvent)
# Registra OGNI cambio di finestra attiva (EVENT_SYSTEM_FOREGROUND)
# stampando una riga JSONL su stdout. CPU ~0 (nessun polling).
# Gestito da tracker-server.mjs come processo figlio.
# ============================================================
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

public static class WHT {
  public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
  public const uint WINEVENT_OUTOFCONTEXT = 0x0000;

  [DllImport("user32.dll")]
  public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);

  [DllImport("user32.dll")]
  public static extern bool UnhookWinEvent(IntPtr hWinEventHook);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int n);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hwnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hwnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hwnd);
}
'@

# variabile globale per tenere vivo il delegate (evita GC)
$script:callback = $null

function Emit-Sample {
  param([string]$Title, [int]$ProcId, [long]$Hwnd)
  $exe = "unknown.exe"
  try { $p = Get-Process -Id $ProcId -ErrorAction Stop; $exe = $p.ProcessName + ".exe" } catch {}
  $obj = [ordered]@{
    ts    = (Get-Date).ToString("o")
    exe   = $exe
    title = $Title
    pid   = $ProcId
    hwnd  = $Hwnd
  }
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$script:callback = [WinEventDelegate]{
  param($hook, $evt, $hwnd, $idObj, $idChild, $dwThread, $dwTime)
  if ($null -eq $hwnd -or $hwnd -eq [IntPtr]::Zero) { return }
  if ($idObj -ne 0) { return }
  if (-not [WHT]::IsWindowVisible($hwnd) -or [WHT]::IsIconic($hwnd)) { return }
  $len = [WHT]::GetWindowTextLength($hwnd)
  if ($len -le 0) { return }
  $sb = New-Object System.Text.StringBuilder($len + 1)
  [void][WHT]::GetWindowText($hwnd, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return }
  $procId = 0
  [void][WHT]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  Emit-Sample -Title $title -ProcId $procId -Hwnd $hwnd.ToInt64()
}

$hookId = [WHT]::SetWinEventHook(
  [WHT]::EVENT_SYSTEM_FOREGROUND, [WHT]::EVENT_SYSTEM_FOREGROUND,
  [IntPtr]::Zero, $script:callback, 0, 0, [WHT]::WINEVENT_OUTOFCONTEXT
)

if ($hookId -eq [IntPtr]::Zero) {
  [Console]::Error.WriteLine("HOOK_FAILED")
  [Console]::Error.Flush()
  exit 1
}

[Console]::Out.WriteLine('{"ts":"' + (Get-Date).ToString("o") + '","exe":"(hook-ready)","title":"hook ready","pid":0,"hwnd":0}')
[Console]::Out.Flush()

# Pump messaggi: necessario perché i WinEvent vengano consegnati
[System.Windows.Forms.Application]::Run()
