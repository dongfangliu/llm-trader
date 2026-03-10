# start.ps1 — 本地开发启动脚本（Windows Terminal）
#
# 用法：
#   .\start.ps1          # 启动所有服务（在 Windows Terminal 新标签页）
#   .\start.ps1 -Stop    # 停止所有服务
#   .\start.ps1 -Service backend   # 单独启动某个服务（在当前终端输出）
#
# 依赖：Python 3.11+、Node.js 18+、Docker Desktop（用于运行 Redis）

param(
    [switch]$Stop,
    [ValidateSet("backend","worker","frontend","redis","")]
    [string]$Service = ""
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# ── 颜色工具 ─────────────────────────────────────────────────────────────────
function Write-Header  { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Info    { param($msg) Write-Host "  · $msg" -ForegroundColor Gray }

# ── 端口检测 ─────────────────────────────────────────────────────────────────
function Test-Port {
    param([int]$Port)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $Port)
        $tcp.Close()
        return $true
    } catch { return $false }
}

# ── 等待 HTTP 端点就绪 ────────────────────────────────────────────────────────
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

# ── 停止模式 ─────────────────────────────────────────────────────────────────
if ($Stop) {
    Write-Header "停止所有服务..."

    # 按端口停止进程
    foreach ($port in @(6379, 8000, 3000)) {
        $pids = (netstat -ano 2>$null | Select-String ":$port\s.*LISTENING") |
            ForEach-Object { ($_.ToString().Trim() -split '\s+')[-1] } |
            Where-Object { $_ -match '^\d+$' } | Select-Object -Unique
        foreach ($p in $pids) {
            try {
                $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                if ($proc) {
                    $proc | Stop-Process -Force
                    Write-Ok "停止进程 PID $p (端口 $port)"
                }
            } catch {}
        }
    }

    # 停止 Redis 容器（如果是 Docker 启动的）
    $redisCid = docker ps -q --filter "name=trader-redis-dev" 2>$null
    if ($redisCid) {
        docker stop trader-redis-dev | Out-Null
        Write-Ok "停止 Redis 容器"
    }

    Write-Ok "完成"
    exit 0
}

# ── 单服务模式（在当前终端输出，方便调试）────────────────────────────────────
if ($Service -ne "") {
    $env:PYTHONPATH   = "src"
    $env:PYTHONUTF8   = "1"
    $env:BACKEND_URL  = "http://localhost:8000"
    $env:REDIS_URL    = "redis://localhost:6379"

    switch ($Service) {
        "redis"   {
            Write-Header "启动 Redis（Docker）"
            docker run --rm --name trader-redis-dev -p 6379:6379 redis:7-alpine
        }
        "backend" {
            Write-Header "启动后端"
            Set-Location "$ScriptDir\backend"
            uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
        }
        "worker"  {
            Write-Header "启动 arq Worker"
            Set-Location "$ScriptDir\backend"
            python -m src.worker.main
        }
        "frontend" {
            Write-Header "启动前端"
            Set-Location "$ScriptDir\frontend"
            npm run dev
        }
    }
    exit 0
}

# ── 全服务启动（Windows Terminal 多标签）────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   AI 股票分析助手 — 本地启动          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan

# 检测 Windows Terminal
$wtExe = Get-Command wt -ErrorAction SilentlyContinue
if (-not $wtExe) {
    Write-Warn "未检测到 Windows Terminal (wt.exe)"
    Write-Info "请在 Windows Terminal 中运行此脚本，或分别手动启动各服务："
    Write-Info "  .\start.ps1 -Service redis"
    Write-Info "  .\start.ps1 -Service backend"
    Write-Info "  .\start.ps1 -Service worker"
    Write-Info "  .\start.ps1 -Service frontend"
    exit 1
}

# 检测 Docker
$dockerOk = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
if (-not $dockerOk) {
    Write-Err "未检测到 Docker Desktop。Redis 依赖 Docker 运行。"
    Write-Info "请安装 Docker Desktop：https://www.docker.com/products/docker-desktop/"
    exit 1
}

# 检测 Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Err "未检测到 Python"
    exit 1
}

# 检测 Node.js
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "未检测到 Node.js / npm"
    exit 1
}

Write-Header "依赖检测通过，正在启动服务..."

# 脚本路径（用于子标签调用自身）
$selfPath = $MyInvocation.MyCommand.Definition

# 在 Windows Terminal 里依次打开新标签
# 格式：wt -w 0 new-tab --title "标题" -- powershell -NoExit -Command "命令"
$wtArgs = @(
    "-w", "0",
    "new-tab", "--title", "Redis", "--",
    "powershell", "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", $selfPath, "-Service", "redis",
    ";", "new-tab", "--title", "Backend", "--",
    "powershell", "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", $selfPath, "-Service", "backend",
    ";", "new-tab", "--title", "Worker", "--",
    "powershell", "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", $selfPath, "-Service", "worker",
    ";", "new-tab", "--title", "Frontend", "--",
    "powershell", "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", $selfPath, "-Service", "frontend"
)

Start-Process "wt" -ArgumentList $wtArgs

# 等待后端就绪后显示访问地址
Write-Info "等待后端启动（最多 60 秒）..."
$backendReady = Wait-Http -Url "http://127.0.0.1:8000/api/health" -Seconds 60

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   服务地址                            ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  前端      http://localhost:3000      ║" -ForegroundColor Green
Write-Host "║  后端 API  http://localhost:8000      ║" -ForegroundColor Green
Write-Host "║  API 文档  http://localhost:8000/docs ║" -ForegroundColor Green
Write-Host "║  Redis     localhost:6379             ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  停止：.\start.ps1 -Stop              ║" -ForegroundColor Gray
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Info "各服务日志在对应的 Windows Terminal 标签页中查看"

if (-not $backendReady) {
    Write-Warn "后端未在 60 秒内就绪，请查看 Backend 标签页的错误信息"
}
