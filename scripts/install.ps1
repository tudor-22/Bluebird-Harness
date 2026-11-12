# Sets Bluebird up on Windows 10/11. Run in PowerShell from the Bluebird folder:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# Installs Node.js and pnpm if missing, installs the packages, makes the local
# keys and builds the app. Bluebird's database needs PostgreSQL 17;
# this script installs it.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($text) { Write-Host "`n$text" -ForegroundColor Cyan }
function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }

function Node-Ok {
  if (-not (Have node)) { return $false }
  return ([int]((node -p "process.versions.node.split('.')[0]")) -ge 22)
}

if (-not (Node-Ok)) {
  Say "Installing Node.js"
  if (-not (Have winget)) { throw "Please install Node.js 22 or newer from https://nodejs.org and run this again." }
  winget install --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements
  Refresh-Path
}
if (-not (Node-Ok)) { throw "Node.js 22 or newer is still missing. Close this window, open a new one and run the script again." }

if (-not (Have pnpm)) {
  Say "Installing pnpm"
  corepack enable
  corepack prepare pnpm@latest --activate
  if (-not (Have pnpm)) { npm install -g pnpm }
}

if (-not (Have pg_ctl) -and -not (Test-Path "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe")) {
  Say "Installing PostgreSQL"
  if (Have winget) { winget install --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements }
}

Say "Installing Bluebird's packages"
pnpm install
Say "Creating local keys and settings"
pnpm setup:keys
Say "Building Bluebird"
pnpm build

Say "Done"
Write-Host "Create the database once (see the README), then run:  pnpm db:migrate   and   scripts\bluebird.ps1 start"
