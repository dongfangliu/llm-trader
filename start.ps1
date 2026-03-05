# AI 股票分析助手 - PowerShell 启动脚本

param(
    [switch]$Stop
)

$ErrorActionPreference = "Continue"

# 颜色定义
function Write-Green { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Red { param($msg) Write-Host $msg -ForegroundColor Red }

# 递归杀进程树（避免子进程残留）
function Stop-ProcessTree {
    param([int]$ProcessId)
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  AI 股票分析助手 - 启动中..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 如果是停止模式
if ($Stop) {
    Write-Yellow "正在停止服务..."

    $pidFile = "$ScriptDir\.trader_pids"
    if (Test-Path $pidFile) {
        $savedPids = Get-Content $pidFile | Where-Object { $_ -match '^\d+$' }
        foreach ($p in $savedPids) {
            Stop-ProcessTree -ProcessId ([int]$p)
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        Write-Green "服务已停止"
    } else {
        Write-Yellow "未找到 PID 记录，尝试按端口停止..."
        foreach ($port in @(8000, 3000)) {
            $conn = netstat -ano | Select-String ":$port\s.*LISTENING"
            if ($conn) {
                $pidStr = ($conn.ToString().Trim() -split '\s+')[-1]
                if ($pidStr -match '^\d+$') { Stop-ProcessTree -ProcessId ([int]$pidStr) }
            }
        }
        Write-Green "服务已停止"
    }
    exit 0
}

# 检查端口是否被占用
function Test-Port {
    param([string]$Port, [string]$Address = "127.0.0.1")
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect($Address, $Port)
        return $true
    } catch {
        return $false
    } finally {
        $tcp.Close()
    }
}

# 等待服务就绪
function Wait-ForService {
    param([string]$Url, [int]$Timeout = 30)
    $attempt = 0
    while ($attempt -lt $Timeout) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 1
        $attempt++
    }
    return $false
}

# 启动后端
Write-Yellow "启动后端服务..."

if (Test-Port -Port 8000) {
    Write-Green "后端服务已在运行 (端口 8000)"
} else {
    $env:PYTHONPATH = "src"
    $backendProcess = Start-Process -FilePath "python" `
        -ArgumentList "-m uvicorn src.api.main:app --port 8000" `
        -WorkingDirectory "$ScriptDir\backend" `
        -WindowStyle Hidden -PassThru
    Write-Green "后端服务已启动 (端口 8000, PID: $($backendProcess.Id))"
}

# 等待后端就绪
Write-Yellow "等待后端服务就绪..."
if (Wait-ForService -Url "http://127.0.0.1:8000/api/health" -Timeout 30) {
    Write-Green "后端服务就绪!"
} else {
    Write-Red "后端服务启动失败，请检查错误"
}

# 启动前端
Write-Host ""
Write-Yellow "启动前端服务..."

if (Test-Port -Port 3000) {
    Write-Green "前端服务已在运行 (端口 3000)"
} else {
    $env:BACKEND_URL = "http://localhost:8000"
    $frontendProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev" `
        -WorkingDirectory "$ScriptDir\frontend" `
        -WindowStyle Hidden -PassThru
    Write-Green "前端服务已启动 (端口 3000, PID: $($frontendProcess.Id))"
}

# 保存 PID 到文件（供 -Stop 模式使用）
$pidFile = "$ScriptDir\.trader_pids"
@(
    if ($backendProcess)  { $backendProcess.Id }
    if ($frontendProcess) { $frontendProcess.Id }
) | Set-Content $pidFile

# 等待前端就绪 (TCP 端口检查，避免冷编译期间 HTTP 非 200 误判)
Write-Yellow "等待前端服务就绪..."
$tcpReady = $false
for ($i = 0; $i -lt 90; $i++) {
    if (Test-Port -Port 3000) { $tcpReady = $true; break }
    Start-Sleep -Seconds 1
}
if ($tcpReady) {
    Write-Green "前端服务就绪!"
} else {
    Write-Yellow "前端服务可能需要更长时间启动，请稍后访问 http://localhost:3000"
}

# 显示访问地址
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  服务启动完成!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  前端: " -NoNewline; Write-Green "http://localhost:3000"
Write-Host "  后端: " -NoNewline; Write-Green "http://127.0.0.1:8000"
Write-Host "  API文档: " -NoNewline; Write-Green "http://127.0.0.1:8000/docs"
Write-Host ""
Write-Host "  停止服务请运行: .\start.ps1 -Stop"
Write-Host ""

# 保持运行
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Write-Host ""
    Write-Yellow "正在停止服务..."

    # 停止后端和前端进程树（含所有子进程）
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-ProcessTree -ProcessId $backendProcess.Id
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-ProcessTree -ProcessId $frontendProcess.Id
    }

    # 清理 PID 文件和残留 Job
    Remove-Item "$ScriptDir\.trader_pids" -Force -ErrorAction SilentlyContinue
    Get-Job | Stop-Job -ErrorAction SilentlyContinue
    Get-Job | Remove-Job -ErrorAction SilentlyContinue

    Write-Green "服务已停止"
}
