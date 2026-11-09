# HALO - made by hworks (ecchworks@gmail.com)
# Reads the Windows "System Media Transport Controls" (the same source as the volume flyout):
# Chrome / Edge / Firefox (YouTube, podcasts, web players), Spotify, etc.
# Prints JSON lines with the current track; accepts commands on stdin:
#   toggle | play | pause | next | prev | seek <seconds>
param([int]$ParentPid = 0)
$utf8 = New-Object System.Text.UTF8Encoding $false
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$out.AutoFlush = $true
function Emit($o) { $out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)) }
$ErrorActionPreference = 'Stop'
try { [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {}
Emit @{ type = 'hello'; script = 'media'; ps = $PSVersionTable.PSVersion.ToString() }

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSession,Windows.Media.Control,ContentType=WindowsRuntime]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]

  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
    [void]$task.Wait(-1)
    return $task.Result
  }

  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Await ($mgrType::RequestAsync()) ($mgrType)

  $stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
  $readTask = $stdin.ReadLineAsync()
  $lastIds = ''
  $session = $null
  $props = $null
  $lastKey = ''
  $lastSig = ''
  $tick = 0
  $hadSession = $false

  while ($true) {
    $tick++
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }

    # ---- commands from HALO ----
    if ($readTask.IsCompleted) {
      $line = $readTask.Result
      if ($null -eq $line) { exit 0 }            # HALO closed
      $readTask = $stdin.ReadLineAsync()
      if ($session) {
        try {
          if ($line -match '^toggle')      { [void](Await ($session.TryTogglePlayPauseAsync()) ([bool])) }
          elseif ($line -match '^play')    { [void](Await ($session.TryPlayAsync()) ([bool])) }
          elseif ($line -match '^pause')   { [void](Await ($session.TryPauseAsync()) ([bool])) }
          elseif ($line -match '^next')    { [void](Await ($session.TrySkipNextAsync()) ([bool])) }
          elseif ($line -match '^prev')    { [void](Await ($session.TrySkipPreviousAsync()) ([bool])) }
          elseif ($line -match '^seek\s+([0-9.]+)') {
            $ticks = [long]([double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture) * 10000000)
            [void](Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool]))
          }
        } catch {}
      }
    }

    # ---- pick the session (ignore HALO's own player) ----
    try {
      $cands = @($mgr.GetSessions() | Where-Object { ([string]$_.SourceAppUserModelId) -notmatch 'halo' })
      $current = $mgr.GetCurrentSession()
      $ids = (@($mgr.GetSessions() | ForEach-Object { [string]$_.SourceAppUserModelId }) -join ', ')
      if ($ids -ne $lastIds) { $lastIds = $ids; Emit @{ type = 'debug'; sessions = $ids } }
      $session = $null
      if ($cands.Count -gt 0) {
        $playing = @($cands | Where-Object { ([string]$_.GetPlaybackInfo().PlaybackStatus) -eq 'Playing' })
        $pool = if ($playing.Count -gt 0) { $playing } else { $cands }
        if ($current) { $session = $pool | Where-Object { $_.SourceAppUserModelId -eq $current.SourceAppUserModelId } | Select-Object -First 1 }
        if (-not $session) { $session = $pool[0] }
      }

      if (-not $session) {
        if ($hadSession) { Emit @{ type = 'media'; none = $true }; $hadSession = $false; $lastKey = ''; $lastSig = '' }
      } else {
        $key = [string]$session.SourceAppUserModelId
        $info = $session.GetPlaybackInfo()
        $tl = $session.GetTimelineProperties()
        $status = [string]$info.PlaybackStatus

        if (($tick % 2) -eq 0 -or $key -ne $lastKey -or $null -eq $props) {
          try { $props = Await ($session.TryGetMediaPropertiesAsync()) ($propType) } catch {}
        }
        $title = ''; $artist = ''; $album = ''
        if ($props) { $title = [string]$props.Title; $artist = [string]$props.Artist; $album = [string]$props.AlbumTitle }

        $sig = "$key|$title|$artist"
        $sendArt = $false
        $art = $null
        if ($sig -ne $lastSig) {
          $lastSig = $sig
          $sendArt = $true
          try {
            if ($props -and $props.Thumbnail) {
              $st = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
              $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
              $ms = New-Object System.IO.MemoryStream
              $net.CopyTo($ms)
              if ($ms.Length -gt 0 -and $ms.Length -lt 1500000) {
                $art = 'data:' + $st.ContentType + ';base64,' + [Convert]::ToBase64String($ms.ToArray())
              }
              $st.Dispose()
            }
          } catch {}
        }

        $start = $tl.StartTime.TotalSeconds
        $dur = [math]::Max(0, $tl.EndTime.TotalSeconds - $start)
        $pos = [math]::Max(0, $tl.Position.TotalSeconds - $start)
        $m = @{ type = 'media'; sig = $sig; app = $key; title = $title; artist = $artist; album = $album;
                status = $status; pos = $pos; dur = $dur }
        if ($sendArt) { $m.art = $art; $m.artChanged = $true }
        Emit $m
        $lastKey = $key
        $hadSession = $true
      }
    } catch {
      Emit @{ type = 'error'; message = [string]$_.Exception.Message }
      Start-Sleep -Seconds 2
    }
    Start-Sleep -Milliseconds 500
  }
} catch {
  Emit @{ type = 'fatal'; message = [string]$_.Exception.Message }
  exit 1
}
