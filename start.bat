@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: AI 股票分析助手 - 快速启动脚本 (Windows)

echo =========================================
echo   AI 股票分析助手 - 启动中...
echo =========================================
echo.

:: 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 颜色定义 (使用 ANSI 转义序列)
set "GREEN=[0;32m"
set "YELLOW=[1;33m"
set "RED=[0;31m"
set "NC=[0m"

:: 检查并启动后端
echo [1;33m启动后端服务...[0m

cd /d "%SCRIPT_DIR%backend"

:: 检查端口是否被占用
netstat -ano | findstr ":8000" >nul
if !errorlevel! equ 0 (
    echo [0;32m后端服务已在运行 (端口 8000)[0m
) else (
    set "PYTHONPATH=src"
    start /b cmd /c "python -m uvicorn src.api.main:app --port 8000"
    echo [0;32m后端服务已启动 (端口 8000)[0m
)

:: 等待后端启动 (最多等待30秒)
echo 等待后端服务就绪...
set wait_count=0
:wait_backend
timeout /t 1 /nobreak >nul
set /a wait_count+=1
if %wait_count% geq 30 (
    echo [0;31m后端服务启动超时，请检查是否有错误[0m
    goto start_frontend
)
curl -s http://127.0.0.1:8000/api/health >nul 2>&1
if !errorlevel! neq 0 goto wait_backend
echo [0;32m后端服务就绪![0m
:start_frontend

:: 检查并启动前端
echo.
echo [1;33m启动前端服务...[0m

cd /d "%SCRIPT_DIR%frontend"

:: 检查端口是否被占用
netstat -ano | findstr ":3000" >nul
if !errorlevel! equ 0 (
    echo [0;32m前端服务已在运行 (端口 3000)[0m
) else (
    start /b cmd /c "npm run dev"
    echo [0;32m前端服务已启动 (端口 3000)[0m
)

:: 等待前端启动 (最多等待60秒)
echo 等待前端服务就绪...
set wait_count=0
:wait_frontend
timeout /t 2 /nobreak >nul
set /a wait_count+=2
if %wait_count% geq 60 (
    echo [1;33m前端服务可能需要更长时间启动，请稍后访问 http://localhost:3000[0m
    goto show_info
)
curl -s http://localhost:3000 >nul 2>&1
if !errorlevel! neq 0 goto wait_frontend
echo [0;32m前端服务就绪![0m
:show_info

:: 显示访问地址
echo.
echo =========================================
echo   [0;32m服务启动完成![0m
echo =========================================
echo.
echo   前端: [0;32mhttp://localhost:3000[0m
echo   后端: [0;32mhttp://127.0.0.1:8000[0m
echo   API文档: [0;32mhttp://127.0.0.1:8000/docs[0m
echo.
echo   按 Ctrl+C 停止服务
echo.

:: 保持脚本运行，按任意键退出
pause >nul
