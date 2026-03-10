# start.ps1 - Local development startup script (Windows Terminal)
#
# Usage:
#   .\start.ps1              # Start all services in new Windows Terminal tabs
#   .\start.ps1 -Stop        # Stop all services
#   .\start.ps1 -Service <x> # Start a single service in current terminal
#
# Requirements: Python 3.11+, Node.js 18+, Docker Desktop (for Redis + PostgreSQL)
#
# Local DB:  postgresql+asyncpg://trader:changeme@localhost:5432/trader
# To use a different password set $env:POSTGRES_PASSWORD before running.

param(
    [switch]$Stop,
    [ValidateSet("backend","worker","frontend","redis","postgres","")]
    [string]$Service = ""
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

function Write-Header { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  [.]  $msg" -ForegroundColor Gray }

function Test-Port {
    param([int]$Port)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $Port)
        $tcp.Close()
        return $true
    } catch { return $false }
}

function Wait-Http {
    param([string]$Url, [int]$Seconds = 30)
    for ($i = 0; $i -lt $Seconds; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep 1
    }
    return $false
}

# ── Stop mode ────────────────────────────────────────────────────────────────
if ($Stop) {
    Write-Header "Stopping all services..."

    foreach ($port in @(6379, 8000, 3000)) {
        $pids = (netstat -ano 2>$null | Select-String ":$port\s.*LISTENING") |
            ForEach-Object { ($_.ToString().Trim() -split '\s+')[-1] } |
            Where-Object { $_ -match '^\d+$' } | Select-Object -Unique
        foreach ($p in $pids) {
            try {
                $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                if ($proc) {
                    $proc | Stop-Process -Force
                    Write-Ok "Stopped PID $p (port $port)"
                }
            } catch {}
        }
    }

    $redisCid = docker ps -q --filter "name=trader-redis-dev" 2>$null
    if ($redisCid) {
        docker stop trader-redis-dev | Out-Null
        Write-Ok "Stopped Redis container"
    }

    $pgCid = docker ps -q --filter "name=trader-pg-dev" 2>$null
    if ($pgCid) {
        docker stop trader-pg-dev | Out-Null
        Write-Ok "Stopped PostgreSQL container"
    }

    Write-Ok "Done"
    exit 0
}

# ── Single service mode ───────────────────────────────────────────────────────
if ($Service -ne "") {
    $pgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "changeme" }

    $env:PYTHONPATH    = "src"
    $env:PYTHONUTF8    = "1"
    $env:BACKEND_URL   = "http://localhost:8000"
    $env:REDIS_URL     = "redis://localhost:6379"
    $env:DATABASE_URL  = "postgresql+asyncpg://trader:$pgPass@localhost:5432/trader"

    switch ($Service) {
        "postgres" {
            Write-Header "Starting PostgreSQL (Docker)"
            Write-Info "Data is stored in Docker volume 'trader-pg-dev-data' (persists across restarts)"
            docker run --rm --name trader-pg-dev `
                -e POSTGRES_USER=trader `
                -e POSTGRES_PASSWORD=$pgPass `
                -e POSTGRES_DB=trader `
                -p 5432:5432 `
                -v trader-pg-dev-data:/var/lib/postgresql/data `
                postgres:16-alpine
        }
        "redis" {
            Write-Header "Starting Redis (Docker)"
            docker run --rm --name trader-redis-dev -p 6379:6379 redis:7-alpine
        }
        "backend" {
            Write-Header "Starting backend"
            Write-Info "DATABASE_URL = $env:DATABASE_URL"
            Set-Location "$ScriptDir\backend"
            uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
        }
        "worker" {
            Write-Header "Starting arq worker"
            Write-Info "DATABASE_URL = $env:DATABASE_URL"
            Set-Location "$ScriptDir\backend"
            python -m src.worker.main
        }
        "frontend" {
            Write-Header "Starting frontend"
            Set-Location "$ScriptDir\frontend"
            npm run dev
        }
    }
    exit 0
}

# ── Full startup (Windows Terminal multi-tab) ─────────────────────────────────
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "   AI Stock Analyzer -- Local Dev     " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Check Windows Terminal
$wtExe = Get-Command wt -ErrorAction SilentlyContinue
if (-not $wtExe) {
    Write-Warn "Windows Terminal (wt.exe) not found"
    Write-Info "Run services manually:"
    Write-Info "  .\start.ps1 -Service postgres"
    Write-Info "  .\start.ps1 -Service redis"
    Write-Info "  .\start.ps1 -Service backend"
    Write-Info "  .\start.ps1 -Service worker"
    Write-Info "  .\start.ps1 -Service frontend"
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker Desktop not found. Redis and PostgreSQL require Docker."
    exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Err "Python not found"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js / npm not found"
    exit 1
}

Write-Header "All dependencies found, starting services..."

$selfPath = $MyInvocation.MyCommand.Definition

# Build each tab command as a separate array entry for Start-Process
# wt syntax: wt [options] <command> [args] [; new-tab args...]
# Using -ArgumentList with array avoids shell-escaping issues
$tab1 = "new-tab --title Postgres -- powershell -NoExit -ExecutionPolicy Bypass -File `"$selfPath`" -Service postgres"
$tab2 = "; new-tab --title Redis    -- powershell -NoExit -ExecutionPolicy Bypass -File `"$selfPath`" -Service redis"
$tab3 = "; new-tab --title Backend  -- powershell -NoExit -ExecutionPolicy Bypass -File `"$selfPath`" -Service backend"
$tab4 = "; new-tab --title Worker   -- powershell -NoExit -ExecutionPolicy Bypass -File `"$selfPath`" -Service worker"
$tab5 = "; new-tab --title Frontend -- powershell -NoExit -ExecutionPolicy Bypass -File `"$selfPath`" -Service frontend"

$wtArgs = "-w 0 $tab1 $tab2 $tab3 $tab4 $tab5"
Start-Process -FilePath "wt" -ArgumentList $wtArgs

Write-Info "Waiting for backend to start (up to 60s)..."
$backendReady = Wait-Http -Url "http://127.0.0.1:8000/api/health" -Seconds 60

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "   Service URLs                       " -ForegroundColor Cyan
Write-Host "--------------------------------------" -ForegroundColor Cyan
Write-Host "  Frontend   http://localhost:3000      " -ForegroundColor Green
Write-Host "  Backend    http://localhost:8000      " -ForegroundColor Green
Write-Host "  API Docs   http://localhost:8000/docs " -ForegroundColor Green
Write-Host "  Redis      localhost:6379             " -ForegroundColor Green
Write-Host "  PostgreSQL localhost:5432 (trader/changeme)" -ForegroundColor Green
Write-Host "--------------------------------------" -ForegroundColor Cyan
Write-Host "  Stop:  .\start.ps1 -Stop             " -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Info "Check each Windows Terminal tab for service logs"

if (-not $backendReady) {
    Write-Warn "Backend did not become ready within 60s -- check the Backend tab for errors"
}
