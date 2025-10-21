# 量化交易系统 Web V2 - 一键启动脚本

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  量化交易系统 Web V2 - 启动脚本" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 检查Python
Write-Host "[1/5] 检查Python环境..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "❌ 未找到Python，请先安装Python 3.8+" -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version 2>&1
Write-Host "✅ $pythonVersion" -ForegroundColor Green

# 检查Node.js
Write-Host "[2/5] 检查Node.js环境..." -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "❌ 未找到Node.js，请先安装Node.js 18+" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green

# 检查npm
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Host "❌ 未找到npm" -ForegroundColor Red
    exit 1
}
$npmVersion = npm --version
Write-Host "✅ npm: $npmVersion" -ForegroundColor Green

# 检查前端依赖
Write-Host "[3/5] 检查前端依赖..." -ForegroundColor Yellow
if (-not (Test-Path "$PSScriptRoot\web_v2\frontend\node_modules")) {
    Write-Host "⚠️  未找到node_modules，正在安装依赖..." -ForegroundColor Yellow
    Push-Location "$PSScriptRoot\web_v2\frontend"
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ npm install 失败" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ 前端依赖已就绪" -ForegroundColor Green

# 检查端口占用
Write-Host "[4/5] 检查端口占用..." -ForegroundColor Yellow
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port8000) {
    Write-Host "⚠️  端口8000已被占用，后端可能无法启动" -ForegroundColor Yellow
    Write-Host "   提示: 使用 'netstat -ano | findstr :8000' 查看占用进程" -ForegroundColor Gray
} else {
    Write-Host "✅ 端口8000可用" -ForegroundColor Green
}

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    Write-Host "⚠️  端口3000已被占用，前端可能无法启动" -ForegroundColor Yellow
    Write-Host "   提示: 使用 'netstat -ano | findstr :3000' 查看占用进程" -ForegroundColor Gray
} else {
    Write-Host "✅ 端口3000可用" -ForegroundColor Green
}

# 启动后端
Write-Host "[5/5] 启动服务..." -ForegroundColor Yellow
Write-Host "正在启动后端服务 (端口8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; python start_web_v2.py"
Write-Host "等待后端启动..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 验证后端是否启动
$backendReady = $false
for ($i = 1; $i -le 6; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $backendReady = $true
        break
    } catch {
        if ($i -lt 6) {
            Write-Host "等待后端启动... ($i/6)" -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
}

if ($backendReady) {
    Write-Host "✅ 后端服务已启动" -ForegroundColor Green
} else {
    Write-Host "⚠️  后端服务可能未完全启动，请检查后端窗口" -ForegroundColor Yellow
}

# 启动前端
Write-Host "正在启动前端服务 (端口3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $PSScriptRoot\web_v2\frontend; npm run dev"
Start-Sleep -Seconds 2
Write-Host "✅ 前端服务已启动" -ForegroundColor Green

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  服务启动完成！" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 后端API文档: " -NoNewline -ForegroundColor Yellow
Write-Host "http://localhost:8000/docs" -ForegroundColor White
Write-Host "📝 ReDoc文档: " -NoNewline -ForegroundColor Yellow
Write-Host "http://localhost:8000/redoc" -ForegroundColor White
Write-Host "🌐 前端界面: " -NoNewline -ForegroundColor Yellow
Write-Host "http://localhost:3000" -ForegroundColor White
Write-Host "🔌 WebSocket: " -NoNewline -ForegroundColor Yellow
Write-Host "ws://localhost:8000/ws" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示: 关闭此窗口不会停止服务，请手动关闭后端和前端窗口" -ForegroundColor Gray
Write-Host ""
Write-Host "按任意键关闭..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
