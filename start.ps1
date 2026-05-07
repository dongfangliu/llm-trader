# start.ps1 - Local development startup script
#
# Usage:
#   .\start.ps1              # docker compose up -d (same as server deployment)
#   .\start.ps1 -Build       # docker compose up -d --build (after code changes)
#   .\start.ps1 -Stop        # docker compose down
#   .\start.ps1 -Service <x> # Start a single service natively (hot-reload dev)
#
# Requirements: Docker Desktop

param(
    [switch]$Stop,
    [switch]$Build,
    [ValidateSet("backend","worker","frontend","redis","postgres","")]
    [string]$Service = "",
    # Use -V2 to start backend with the new clean-architecture entry-point (main_v2)
    [switch]$V2
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

function Write-Header { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  [.]  $msg" -ForegroundColor Gray }

function Get-LatestSourceWriteTime {
    param([string[]]$Paths)
    $latest = $null
    foreach ($p in $Paths) {
        if (-not (Test-Path $p)) { continue }
        $items = Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue
        if ((Get-Item -LiteralPath $p).PSIsContainer -eq $false) {
            $items = @((Get-Item -LiteralPath $p))
        }
        foreach ($item in $items) {
            if ($null -eq $latest -or $item.LastWriteTimeUtc -gt $latest) {
                $latest = $item.LastWriteTimeUtc
            }
        }
    }
    return $latest
}

function Warn-IfImageMayBeStale {
    param([string]$Image, [string[]]$SourcePaths)
    $latestSource = Get-LatestSourceWriteTime -Paths $SourcePaths
    if ($null -eq $latestSource) { return }

    $createdRaw = docker image inspect $Image --format '{{.Created}}' 2>$null
    if (-not $createdRaw) {
        Write-Warn "Docker image '$Image' not found locally; run .\start.ps1 -Build if startup fails."
        return
    }

    try {
        $created = [DateTimeOffset]::Parse($createdRaw).UtcDateTime
        if ($latestSource -gt $created) {
            Write-Warn "Local source is newer than Docker image '$Image'. Use .\start.ps1 -Build to avoid stale routes/assets."
        }
    } catch {}
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

# Load variables from root .env into the current shell environment.
# Existing environment variables are NOT overwritten (allows shell-level overrides).
function Import-DotEnv {
    param([string]$Path = ".env")
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if (-not [Environment]::GetEnvironmentVariable($key)) {
            Set-Item -Path "Env:$key" -Value $val
        }
    }
}

# ── Stop mode ────────────────────────────────────────────────────────────────
if ($Stop) {
    Write-Header "Stopping all services..."
    docker compose down
    Write-Ok "Done"
    exit 0
}

# ── Single service mode ───────────────────────────────────────────────────────
if ($Service -ne "") {
    # Load all config from root .env first, then override connection URLs
    # so that the backend/worker reach local Docker containers (not container hostnames).
    Import-DotEnv

    $pgPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "changeme" }

    $env:PYTHONPATH   = "src"
    $env:PYTHONUTF8   = "1"
    $env:BACKEND_URL  = "http://localhost:8000"
    $env:REDIS_URL    = "redis://localhost:6379"
    $env:DATABASE_URL = "postgresql+asyncpg://trader:$pgPass@localhost:5432/trader"

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
            $appModule = if ($V2) { "src.api.main_v2:app" } else { "src.api.main:app" }
            if ($V2) { Write-Info "Using new clean-architecture entry-point (main_v2)" }
            uvicorn $appModule --host 127.0.0.1 --port 8000 --reload
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

# ── Full startup (docker compose) ─────────────────────────────────────────────
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "   AI Stock Analyzer -- Local Dev     " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker Desktop not found."
    exit 1
}

if (-not $Build) {
    Warn-IfImageMayBeStale -Image "trader-frontend:latest" -SourcePaths @(
        "frontend\pages",
        "frontend\components",
        "frontend\composables",
        "frontend\lib",
        "frontend\server",
        "frontend\assets",
        "frontend\nuxt.config.ts",
        "frontend\package.json",
        "frontend\package-lock.json",
        "frontend\Dockerfile"
    )
    Warn-IfImageMayBeStale -Image "trader-backend:latest" -SourcePaths @(
        "backend\src",
        "backend\initial_settings.json",
        "backend\requirements.txt",
        "backend\Dockerfile"
    )
}

$upArgs = if ($Build) {
    Write-Info "Build mode: rebuilding images..."
    "--env-file .env up -d --build"
} else {
    "--env-file .env up -d"
}

Write-Header "Starting all services via docker compose..."
Invoke-Expression "docker compose $upArgs"

Write-Info "Waiting for backend (up to 60s)..."
$backendReady = Wait-Http -Url "http://127.0.0.1:8000/api/health" -Seconds 60

Write-Host ""
docker compose ps
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "   Service URLs                       " -ForegroundColor Cyan
Write-Host "--------------------------------------" -ForegroundColor Cyan
Write-Host "  Frontend   http://localhost:3000      " -ForegroundColor Green
Write-Host "  Backend    http://localhost:8000      " -ForegroundColor Green
Write-Host "  API Docs   http://localhost:8000/docs " -ForegroundColor Green
Write-Host "  Redis      localhost:6379             " -ForegroundColor Green
Write-Host "  PostgreSQL localhost:5432             " -ForegroundColor Green
Write-Host "--------------------------------------" -ForegroundColor Cyan
Write-Host "  Stop:   .\start.ps1 -Stop            " -ForegroundColor Gray
Write-Host "  Rebuild: .\start.ps1 -Build          " -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if (-not $backendReady) {
    Write-Warn "Backend did not become ready within 60s -- run: docker compose logs backend"
}
