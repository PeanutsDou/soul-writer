Set ws = CreateObject("Wscript.Shell")
ws.CurrentDirectory = "D:\douzhongjun\soul writer"

' Start Vite hidden
ws.Run "node node_modules\vite\bin\vite.js --config config\vite.config.ts", 0, False

' Wait for Vite
WScript.Sleep 4000

' Start Tauri
ws.Run "src-tauri\target\debug\soul-writer.exe", 0, False
