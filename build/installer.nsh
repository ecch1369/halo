; HALO - made by hworks (ecchworks@gmail.com)
; Runs silently during install: registers the notification helper so no manual steps are needed.
!macro customInstall
  DetailPrint "Configuring HALO notification access..."
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\helpers\setup-notifications.ps1" -Silent -Src "$INSTDIR\resources\helpers"'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-Process NotifyHost -ErrorAction SilentlyContinue | Stop-Process -Force; Get-AppxPackage -Name hworks.HALO.NotificationHost | Remove-AppxPackage; Remove-Item -Recurse -Force $$env:LOCALAPPDATA\HALO"'
  Pop $0
!macroend
