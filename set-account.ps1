# HALO - switch the GitHub account this folder publishes to.
# Usage:  set-account.bat NEW-USERNAME      (GitHub usernames: letters, digits and hyphens only - no dots)
param([Parameter(Mandatory=$true)][string]$Account)
Set-Location $PSScriptRoot
if ($Account -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' -or $Account -match '--') {
  Write-Host "'$Account' is not a valid GitHub username (only letters, digits and single hyphens; no dots)." -ForegroundColor Red
  exit 1
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Patch($file, $pattern, $replacement) {
  $p = Join-Path $PSScriptRoot $file
  $t = [IO.File]::ReadAllText($p)
  $n = [regex]::Replace($t, $pattern, $replacement)
  if ($n -eq $t) { Write-Host "  (no change) $file" -ForegroundColor DarkGray } else { [IO.File]::WriteAllText($p, $n, $utf8); Write-Host "  updated   $file" -ForegroundColor Green }
}
Write-Host "Switching HALO to GitHub account '$Account'..."
Patch 'main.js'                  "UPDATE_OWNER = '[^']*'"          "UPDATE_OWNER = '$Account'"
Patch 'docs\index.html'          'data-repo="[^/"]*/'              "data-repo=""$Account/"
Patch 'publish-to-github.ps1'    "\[string\]\`$Account = '[^']*'"  "[string]`$Account = '$Account'"
Write-Host "Done. Now run publish-to-github.bat" -ForegroundColor Cyan
