# Starts and stops Bluebird on Windows:  scripts\bluebird.ps1 [start|stop|status]
param([string]$Action = "start")
$root = Split-Path -Parent $PSScriptRoot
$run = Join-Path $root ".data\run"
New-Item -ItemType Directory -Force $run | Out-Null
$port = if ($env:BLUEBIRD_PORT) { $env:BLUEBIRD_PORT } else { "3000" }

function Running($name) {
  $file = Join-Path $run "$name.pid"
  if (-not (Test-Path $file)) { return $false }
  return [bool](Get-Process -Id ([int](Get-Content $file)) -ErrorAction SilentlyContinue)
}

switch ($Action) {
  "start" {
    Set-Location $root
    if (-not (Running "api")) {
      $p = Start-Process -FilePath "pnpm.cmd" -ArgumentList "start" -WorkingDirectory (Join-Path $root "apps\api") -WindowStyle Hidden -PassThru
      $p.Id | Set-Content (Join-Path $run "api.pid")
    }
    if (-not (Running "web")) {
      $p = Start-Process -FilePath "pnpm.cmd" -ArgumentList "exec", "next", "start", "-p", $port -WorkingDirectory (Join-Path $root "apps\web") -WindowStyle Hidden -PassThru
      $p.Id | Set-Content (Join-Path $run "web.pid")
    }
    Start-Sleep -Seconds 6
    Start-Process "http://localhost:$port"
  }
  "stop" {
    foreach ($name in "web", "api") {
      if (Running $name) { taskkill /PID (Get-Content (Join-Path $run "$name.pid")) /T /F | Out-Null }
      Remove-Item (Join-Path $run "$name.pid") -ErrorAction SilentlyContinue
    }
  }
  "status" { foreach ($name in "api", "web") { "{0}: {1}" -f $name, $(if (Running $name) { "running" } else { "stopped" }) } }
}
