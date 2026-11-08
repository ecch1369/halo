# HALO - made by hworks (ecchworks@gmail.com)
# Runs as "NotifyHost.exe" (a copy of powershell.exe that has package identity).
# Prints one JSON line per NEW Windows toast notification to stdout.
param([int]$ParentPid = 0)
$utf8 = New-Object System.Text.UTF8Encoding $false
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$out.AutoFlush = $true
function Emit($o) { $out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)) }
$ErrorActionPreference = 'Stop'
Emit @{ type = 'hello'; script = 'notif-identity'; ps = $PSVersionTable.PSVersion.ToString() }

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime]
  $null = [Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus,Windows.UI.Notifications,ContentType=WindowsRuntime]
  $null = [Windows.UI.Notifications.NotificationKinds,Windows.UI.Notifications,ContentType=WindowsRuntime]
  $null = [Windows.UI.Notifications.UserNotification,Windows.UI.Notifications,ContentType=WindowsRuntime]
  $null = [Windows.UI.Notifications.KnownNotificationBindings,Windows.UI.Notifications,ContentType=WindowsRuntime]

  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
    [void]$task.Wait(-1)
    return $task.Result
  }

  $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
  $access = Await ($listener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
  Emit @{ type = 'status'; access = [string]$access }
  if ([string]$access -ne 'Allowed') { exit 2 }

  function Get-Toast($n) {
    $app = ''
    $aumid = ''
    try { $app = $n.AppInfo.DisplayInfo.DisplayName } catch {}
    try { $aumid = [string]$n.AppInfo.AppUserModelId } catch {}
    $texts = @()
    try {
      $b = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
      if ($b) { $texts = @($b.GetTextElements() | ForEach-Object { $_.Text }) }
    } catch {}
    $title = ''
    if ($texts.Count -gt 0) { $title = [string]$texts[0] }
    $body = ''
    if ($texts.Count -gt 1) { $body = ($texts[1..($texts.Count - 1)] -join "`n") }
    return @{ type = 'toast'; id = [string]$n.Id; app = [string]$app; aumid = $aumid; title = $title; body = $body }
  }

  $seen = @{}
  $lastCount = -1
  $first = $true   # notifications already in Action Center at start are not replayed
  while ($true) {
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
    try {
      $list = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
      if ($list.Count -ne $lastCount) { $lastCount = $list.Count; Emit @{ type = 'debug'; count = $lastCount } }
      $now = @{}
      foreach ($n in $list) {
        $id = [string]$n.Id
        $now[$id] = 1
        if (-not $first -and -not $seen.ContainsKey($id)) { Emit (Get-Toast $n) }
      }
      $seen = $now
      $first = $false
    } catch {
      Emit @{ type = 'error'; message = [string]$_.Exception.Message }
      Start-Sleep -Seconds 3
    }
    Start-Sleep -Milliseconds 400
  }
} catch {
  Emit @{ type = 'fatal'; message = [string]$_.Exception.Message }
  exit 1
}
