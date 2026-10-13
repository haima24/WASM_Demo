[CmdletBinding()]
param(
    [switch]$SkipWasm,   # skip the Rust -> WASM build
    [switch]$SkipApi     # run only the web UI
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ui   = Join-Path $root 'web-ui'
$api  = Join-Path $root 'dotnet-api'

$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
    $env:PATH = "$cargoBin;$env:PATH"
}

function Test-Tool($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' not found on PATH."
    }
}

Test-Tool npm
if (-not $SkipApi) { Test-Tool dotnet }

if (-not (Test-Path (Join-Path $ui 'node_modules'))) {
    Write-Host '>> npm install' -ForegroundColor Cyan
    Push-Location $ui; try { npm install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

if (-not $SkipWasm) {
    Write-Host '>> Building Rust -> WASM' -ForegroundColor Cyan
    Test-Tool cargo
    Push-Location $ui; try { npm run build:wasm } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'WASM build failed' }
}

$apiProc = $null
try {
    if (-not $SkipApi) {
        $busy = Get-NetTCPConnection -LocalPort 5080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($busy) {
            $owner = (Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).ProcessName
            Write-Warning "Port 5080 already in use by '$owner' (pid $($busy.OwningProcess)); reusing it. Stop that process to start a fresh API."
        }
        else {
            Write-Host '>> Starting API on http://localhost:5080' -ForegroundColor Cyan
            $apiProc = Start-Process dotnet -ArgumentList 'run', '--urls', 'http://localhost:5080' `
                -WorkingDirectory $api -PassThru -NoNewWindow
        }
    }

    Write-Host '>> Starting UI on http://localhost:5173 (Ctrl+C to stop)' -ForegroundColor Cyan
    Push-Location $ui
    try { npm run dev } finally { Pop-Location }
}
finally {
    if ($apiProc -and -not $apiProc.HasExited) {
        # /T kills the dotnet child process tree
        taskkill /PID $apiProc.Id /T /F | Out-Null
    }
}
