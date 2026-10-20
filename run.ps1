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

function Test-Tool($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' not found on PATH. $hint"
    }
}

# Prerequisites: Node.js, .NET SDK 10, Rust (rustup) + wasm32-unknown-unknown target
Test-Tool node 'Install Node.js from https://nodejs.org'
Test-Tool npm  'Install Node.js from https://nodejs.org'

if (-not $SkipApi) {
    Test-Tool dotnet 'Install the .NET SDK 10 from https://dotnet.microsoft.com/download'
    $hasSdk10 = dotnet --list-sdks | Where-Object { $_ -match '^10\.' }
    if (-not $hasSdk10) {
        throw '.NET SDK 10 not found (dotnet-api targets net10.0). Install it from https://dotnet.microsoft.com/download'
    }
}

if (-not $SkipWasm) {
    Test-Tool rustup 'Install Rust from https://rustup.rs'
    Test-Tool cargo  'Install Rust from https://rustup.rs'
    if (-not (rustup target list --installed | Where-Object { $_ -eq 'wasm32-unknown-unknown' })) {
        Write-Host '>> rustup target add wasm32-unknown-unknown' -ForegroundColor Cyan
        rustup target add wasm32-unknown-unknown
        if ($LASTEXITCODE -ne 0) { throw 'rustup target add wasm32-unknown-unknown failed' }
    }
}

if (-not (Test-Path (Join-Path $ui 'node_modules'))) {
    Write-Host '>> npm install' -ForegroundColor Cyan
    Push-Location $ui; try { npm install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

if (-not $SkipWasm) {
    Write-Host '>> Building Rust -> WASM' -ForegroundColor Cyan
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
