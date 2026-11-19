Option Explicit

Dim shell, http, url, root
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:3780/"

If Not ServerResponding(url) Then
  shell.CurrentDirectory = root & "\server"
  shell.Run "node server.js", 0, False
End If

Dim attempts
attempts = 0
Do While attempts < 30
  If ServerResponding(url) Then
    shell.Run url, 1, False
    WScript.Quit 0
  End If
  WScript.Sleep 200
  attempts = attempts + 1
Loop

MsgBox "No se pudo iniciar Cerámica EL LAPACHO. Compruebe que Node.js este instalado.", vbExclamation, "Cerámica EL LAPACHO"

Function ServerResponding(address)
  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.Open "GET", address, False
  http.SetTimeouts 500, 500, 500, 500
  http.Send
  ServerResponding = (Err.Number = 0 And http.Status >= 200 And http.Status < 500)
  Set http = Nothing
  On Error GoTo 0
End Function
