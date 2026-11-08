# HALO - made by hworks (ecchworks@gmail.com)
# One-click publisher: installs Git + GitHub CLI if needed, logs you in (browser, once), creates the public repo,
# uploads this folder, turns on GitHub Pages and publishes the first release (the installer is built on GitHub).
param([string]$RepoName = 'halo')
Set-Location $PSScriptRoot
$ErrorActionPreference = 'Continue'

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

Say '[1/6] Checking tools...'
Need 'git' 'Git.Git' 'https://git-scm.com/download/win'
Need 'gh'  'GitHub.cli' 'https://cli.github.com'

Say '[2/6] Logging in to GitHub (a browser window will open - just approve it)...'
& gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & gh auth login --web -p https -h github.com -s 'repo,workflow'
  if ($LASTEXITCODE -ne 0) { Fail 'GitHub login did not finish.' }
}
& gh auth setup-git 2>$null | Out-Null
$owner = (& gh api user --jq .login).Trim()
if (-not $owner) { Fail 'Could not read your GitHub username.' }
$version = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "Logged in as $owner - publishing HALO $version as $owner/$RepoName"

Say '[3/6] Preparing the project...'
if (-not (Test-Path '.git')) { & git init -b main | Out-Null }
if (-not (& git config user.name))  { & git config user.name  'hworks' }
if (-not (& git config user.email)) { & git config user.email 'ecchworks@gmail.com' }
& git add -A
& git commit -m "HALO $version" 2>$null | Out-Null
& git branch -M main

Say '[4/6] Creating the repository and uploading...'
& gh repo view "$owner/$RepoName" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & gh repo create $RepoName --public --description 'HALO - a Dynamic Island for Windows' --source=. --remote=origin
  if ($LASTEXITCODE -ne 0) { Fail 'Could not create the repository.' }
} elseif (-not (& git remote)) {
  & git remote add origin "https://github.com/$owner/$RepoName.git"
}
& git push -u origin main
if ($LASTEXITCODE -ne 0) { Fail 'Upload (git push) failed.' }

Say '[5/6] Turning on the download page (GitHub Pages)...'
& gh api -X POST "repos/$owner/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null
& gh api -X PUT  "repos/$owner/$RepoName/pages" -f build_type=workflow 2>$null | Out-Null
Start-Sleep -Seconds 5
& gh workflow run pages.yml --repo "$owner/$RepoName" 2>$null | Out-Null

Say '[6/6] Publishing the first release (the installer gets built on GitHub)...'
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
Write-Host ''
Read-Host 'Press Enter to close'
