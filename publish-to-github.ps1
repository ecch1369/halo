# HALO - made by hworks (ecchworks@gmail.com)
# One-click publisher: installs Git + GitHub CLI if needed, logs in to the HALO GitHub account, creates the public repo,
# uploads this folder, turns on GitHub Pages and publishes a release (the installer is built on GitHub).
#
# Your OTHER GitHub logins (Cursor, git, other gh accounts) are never touched:
#  - HALO uses its own private GitHub CLI profile (folder %LOCALAPPDATA%\HALO-gh)
#  - git is told to use that profile only for this one push (no global git settings are changed)
param([string]$RepoName = 'halo', [string]$Account = 'ecch1369')
Set-Location $PSScriptRoot
$ErrorActionPreference = 'Continue'
$env:GH_CONFIG_DIR = Join-Path $env:LOCALAPPDATA 'HALO-gh'
$gitAuth = @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential')

function Say($m)  { Write-Host ''; Write-Host $m -ForegroundColor Cyan }
function Fail($m) { Write-Host ''; Write-Host ('ERROR: ' + $m) -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
function Has($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Need($cmd, $wingetId, $url) {
  if (Has $cmd) { return }
  if (-not (Has 'winget')) { Fail "$cmd is missing and winget isn't available. Install it from $url and run this again." }
  Say "Installing $cmd (one time)..."
  & winget install --id $wingetId -e --source winget --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Has $cmd)) { Fail "$cmd was installed but isn't visible yet. Close this window and run the script again." }
}
# Older versions of this script ran "gh auth setup-git", which changes your global git settings. Undo that if it is there.
function Undo-GhGitHelper {
  foreach ($u in 'https://github.com', 'https://gist.github.com') {
    $key = "credential.$u.helper"
    $vals = (& git config --global --get-all $key 2>$null) -join ' '
    if ($vals -match 'gh') {
      & git config --global --unset-all $key
      Write-Host "Restored your default git login for $u (removed the GitHub CLI helper)." -ForegroundColor DarkGray
    }
  }
}

Write-Host "HALO publisher - uses the GitHub account '$Account'. Your other GitHub logins are not touched." -ForegroundColor Green

Say '[1/6] Checking tools...'
Need 'git' 'Git.Git' 'https://git-scm.com/download/win'
Need 'gh'  'GitHub.cli' 'https://cli.github.com'

Say "[2/6] Logging in to GitHub as '$Account'..."
$loggedIn = $false
& gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $who = (& gh api user --jq .login 2>$null)
  if ($who -and $who.Trim() -eq $Account) { $loggedIn = $true }
  elseif ($who) {
    Write-Host "HALO's private profile was logged in as '$($who.Trim())' - signing it out (your other logins are not affected)."
    & gh auth logout -h github.com -u $who.Trim() 2>$null | Out-Null
  }
}
if (-not $loggedIn) {
  Write-Host ''
  Write-Host "A PRIVATE (incognito) browser window will open. Sign in there as '$Account' and type the one-time code shown below." -ForegroundColor Yellow
  Write-Host "If you are asked 'Authenticate Git with your GitHub credentials?' answer N." -ForegroundColor Yellow
  $url = 'https://github.com/login/device'
  $opened = $false
  $cands = @(
    @{ exe = 'msedge.exe';  arg = '-inprivate' },
    @{ exe = 'chrome.exe';  arg = '--incognito' },
    @{ exe = 'firefox.exe'; arg = '-private-window' },
    @{ exe = 'brave.exe';   arg = '--incognito' }
  )
  foreach ($c in $cands) {
    try { Start-Process $c.exe -ArgumentList @($c.arg, $url) -ErrorAction Stop; $opened = $true; break } catch { }
  }
  if (-not $opened) { Write-Host "Could not open a private window automatically. Open a private/incognito window yourself and go to $url" -ForegroundColor Yellow }
  # Newer gh versions dropped --skip-browser, so we just make gh's own browser launch harmless (we already opened the private window).
  $env:GH_BROWSER = 'cmd /c echo'
  & gh auth login --web --clipboard -p https -h github.com -s 'repo,workflow'
  if ($LASTEXITCODE -ne 0) { Fail 'GitHub login did not finish.' }
}
Undo-GhGitHelper
$owner = (& gh api user --jq .login).Trim()
if ($owner -ne $Account) {
  & gh auth logout -h github.com -u $owner 2>$null | Out-Null
  Fail "You signed in as '$owner' but HALO publishes as '$Account'. Run again and sign in as '$Account' in the private window."
}
$version = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "Logged in as $owner - publishing HALO $version as $owner/$RepoName"

Say '[3/6] Preparing the project...'
$freshInit = $false
if (-not (Test-Path '.git')) { & git init -b main | Out-Null; $freshInit = $true }
if (-not (& git config user.name))  { & git config user.name  'hworks' }
if (-not (& git config user.email)) { & git config user.email 'ecchworks@gmail.com' }
& git add -A
& git commit -m "HALO $version" 2>$null | Out-Null
& git branch -M main

Say '[4/6] Creating the repository and uploading...'
$want = "https://github.com/$owner/$RepoName.git"
& gh repo view "$owner/$RepoName" 2>$null | Out-Null
$repoExisted = ($LASTEXITCODE -eq 0)
if (-not $repoExisted) {
  & gh api -X POST user/repos -f name="$RepoName" -F private=false -f description='HALO - a Dynamic Island for Windows' | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail 'Could not create the repository.' }
}
$curUrl = (& git remote get-url origin 2>$null)
if (-not $curUrl) { & git remote add origin $want }
elseif ($curUrl.Trim() -ne $want) { & git remote set-url origin $want }
if ($repoExisted -and $freshInit) {
  Write-Host 'Repository already exists - replacing its content with this (newer) folder...'
  & git @gitAuth push -u origin main --force
} else {
  & git @gitAuth push -u origin main
}
if ($LASTEXITCODE -ne 0) { Fail 'Upload (git push) failed.' }

Say '[5/6] Turning on the download page (GitHub Pages)...'
& gh api -X POST "repos/$owner/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null
& gh api -X PUT  "repos/$owner/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null
Start-Sleep -Seconds 5
& gh workflow run pages.yml --repo "$owner/$RepoName" 2>$null | Out-Null

# Repo polish: description, website link and search topics (safe to run again).
& gh repo edit "$owner/$RepoName" --description 'HALO - a free Dynamic Island for Windows: music, browser media controls, notifications and timer' --homepage "https://$owner.github.io/$RepoName/" --add-topic windows --add-topic windows-11 --add-topic dynamic-island --add-topic electron --add-topic media-controls --add-topic notifications --add-topic desktop-widget --add-topic customization 2>$null | Out-Null

Say '[6/6] Publishing the release (the installer gets built on GitHub)...'
& gh release view "v$version" --repo "$owner/$RepoName" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & gh release create "v$version" --repo "$owner/$RepoName" --title "HALO $version" --notes "HALO $version - free. If Windows says 'Windows protected your PC', click More info > Run anyway."
  if ($LASTEXITCODE -ne 0) { Fail 'Could not create the release.' }
} else { Write-Host "Release v$version already exists - skipping." }

Write-Host ''
Write-Host 'All done. GitHub is now building the installer - this takes about 5-10 minutes.' -ForegroundColor Green
Write-Host "  Download page : https://$owner.github.io/$RepoName/"
Write-Host "  Progress      : https://github.com/$owner/$RepoName/actions"
Write-Host "  Releases      : https://github.com/$owner/$RepoName/releases"
Start-Process "https://github.com/$owner/$RepoName/actions"

Say 'Waiting for GitHub to build the installer...'
$runId = ''
for ($i = 0; $i -lt 18 -and -not $runId; $i++) {
  Start-Sleep -Seconds 5
  $runId = (& gh run list --repo "$owner/$RepoName" --workflow release.yml --branch "v$version" --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null)
}
if ($runId) {
  & gh run watch $runId --repo "$owner/$RepoName" --exit-status
  if ($LASTEXITCODE -eq 0) { Write-Host "UPDATE v$version IS LIVE. Installed copies of HALO will pick it up (tray icon > Check for updates)." -ForegroundColor Green }
  else { Write-Host 'The build FAILED - open the Actions link above and send the error to hworks.' -ForegroundColor Red }
} else { Write-Host 'Could not find the build run - check the Actions link above.' -ForegroundColor Yellow }
Write-Host ''
Read-Host 'Press Enter to close'
