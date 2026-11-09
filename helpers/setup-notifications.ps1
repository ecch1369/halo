# HALO - made by hworks (ecchworks@gmail.com)
# Gives a copy of powershell.exe "package identity" so Windows lets HALO read notifications
# (UserNotificationListener). Runs silently from the installer; also used as an in-app fallback.
param([string]$Src, [string]$Target, [switch]$Silent)
$ErrorActionPreference = 'Stop'
if (-not $Src) { $Src = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Target) { $Target = Join-Path $env:LOCALAPPDATA 'HALO\Notify' }
function Log($m) {
  if (-not $Silent) { Write-Host $m }
  try { New-Item -ItemType Directory -Force -Path $Target | Out-Null; Add-Content -Path (Join-Path $Target 'setup.log') -Value ((Get-Date -Format o) + '  ' + $m) } catch {}
}
try {
  if (-not $Silent) { $Host.UI.RawUI.WindowTitle = 'HALO - notification setup' }
  if ([Environment]::OSVersion.Version.Build -lt 19041) { throw 'Windows 10 version 2004 (build 19041) or newer is required.' }

  Log '[1/4] Enabling developer mode (needed to register the notification host)...'
  $k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
  if (-not (Test-Path $k)) { New-Item $k -Force | Out-Null }
  Set-ItemProperty $k -Name AllowDevelopmentWithoutDevLicense -Value 1 -Type DWord
  Set-ItemProperty $k -Name AllowAllTrustedApps -Value 1 -Type DWord

  Log '[2/4] Copying files...'
  Get-Process -Name 'NotifyHost' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($old in 'hworks.HALO.NotificationHost', 'WindowsIsland.NotificationHost') {
    Get-AppxPackage -Name $old -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue
  }
  Remove-Item (Join-Path $Target 'registered.txt') -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Join-Path $Target 'pkg') | Out-Null
  Copy-Item "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" (Join-Path $Target 'NotifyHost.exe') -Force
  Copy-Item (Join-Path $Src 'listener.ps1') (Join-Path $Target 'listener.ps1') -Force
  foreach ($f in 'AppxManifest.xml', 'icon44.png', 'icon150.png') { Copy-Item (Join-Path $Src $f) (Join-Path $Target 'pkg') -Force }

  Log '[3/4] Registering package identity...'
  Add-AppxPackage -Register (Join-Path $Target 'pkg\AppxManifest.xml') -ExternalLocation $Target

  Log '[4/4] Done.'
  Set-Content -Path (Join-Path $Target 'registered.txt') -Value (Get-Date -Format o)
  if (-not $Silent) { Write-Host ''; Write-Host 'Done! HALO will now show notifications.' -ForegroundColor Green; Start-Sleep -Seconds 3 }
  exit 0
} catch {
  Log ('FAILED: ' + $_.Exception.Message)
  if (-not $Silent) {
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Take a screenshot of this window and send it to hworks (ecchworks@gmail.com).'
    Read-Host 'Press Enter to close'
  }
  exit 1
}
