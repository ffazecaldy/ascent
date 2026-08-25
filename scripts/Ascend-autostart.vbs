' Ascend — avvio automatico al boot (web-only, nessuna finestra console)
' Avvia scripts/launch-web.mjs: sync + tracker + next start + finestra app.
' Se i servizi sono gia' attivi, li riusa. I dati vivono nel profilo Edge
' normale + mirror su file: nessun profilo dedicato, nessun exe.
Option Explicit
Dim fso, sh, node, script
Set fso = CreateObject("Scripting.FileSystemObject")
node = "C:\Program Files\nodejs\node.exe"
script = "C:\Users\Admin\OneDrive - Florian Elmazi\Documenti\ProgettiAtigravity\ASCEBT\scripts\launch-web.mjs"
If Not fso.FileExists(node) Then WScript.Quit 0
If Not fso.FileExists(script) Then WScript.Quit 0
Set sh = CreateObject("WScript.Shell")
sh.Run """" & node & """ """ & script & """", 0, False
