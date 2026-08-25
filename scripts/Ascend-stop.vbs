' Ascend — spegni tutto (app :3000, tracker :4877, sync :4878)
' Doppio click = stop completo. Non tocca nient'altro del PC.
Option Explicit
Dim fso, sh, node, script
Set fso = CreateObject("Scripting.FileSystemObject")
node = "C:\Program Files\nodejs\node.exe"
script = "C:\Users\Admin\OneDrive - Florian Elmazi\Documenti\ProgettiAtigravity\ASCEBT\scripts\launch-web.mjs"
If Not fso.FileExists(node) Then WScript.Quit 0
If Not fso.FileExists(script) Then WScript.Quit 0
Set sh = CreateObject("WScript.Shell")
sh.Run """" & node & """ """ & script & """ stop", 0, False
