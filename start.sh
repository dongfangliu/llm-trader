#!/bin/bash

# AI 股票分析助手 - 快速启动脚本

echo "========================================="
echo "  AI 股票分析助手 - 启动中..."
echo "========================================="

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查并启动后端
start_backend() {
    echo -e "${YELLOW}启动后端服务...${NC}"

    cd "$SCRIPT_DIR/backend"

    # 设置 Python 路径
    export PYTHONPATH=src

    # 检查端口是否被占用
    if lsof -i:8000 > /dev/null 2>&1; then
        echo -e "${GREEN}后端服务已在运行 (端口 8000)${NC}"
    else
        # 后台启动 uvicorn
        python -m uvicorn src.api.main:app --port 8000 --reload &
        echo -e "${GREEN}后端服务已启动 (端口 8000)${NC}"
    fi
}

# 检查并启动前端
start_frontend() {
    echo -e "${YELLOW}启动前端服务...${NC}"

    cd "$SCRIPT_DIR/frontend"

    # 检查端口是否被占用
    if lsof -i:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}前端服务已在运行 (端口 3000)${NC}"
    else
        # 后台启动 Next.js
        npm run dev &
        echo -e "${GREEN}前端服务已启动 (端口 3000)${NC}"
    fi
}

# 等待服务启动
wait_for_services() {
    echo -e "${YELLOW}等待服务启动...${NC}"

    # 等待后端
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
            echo -e "${GREEN}后端服务就绪!${NC}"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}后端服务启动失败${NC}"
    fi

    # 等待前端
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}前端服务就绪!${NC}"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        echo -e "${YELLOW}前端服务可能需要更长时间启动，请稍后访问 http://localhost:3000${NC}"
    fi
}

# 显示访问地址
show_urls() {
    echo ""
    echo "========================================="
    echo -e "  ${GREEN}服务启动完成!${NC}"
    echo "========================================="
    echo ""
    echo -e "  前端: ${GREEN}http://localhost:3000${NC}"
    echo -e "  后端: ${GREEN}http://127.0.0.1:8000${NC}"
    echo -e "  API文档: ${GREEN}http://127.0.0.1:8000/docs${NC}"
    echo ""
    echo "  按 Ctrl+C 停止服务"
    echo ""
}

# 主流程
start_backend
start_frontend
wait_for_services
show_urls

# 保持脚本运行
trap "echo ''; echo '正在停止服务...'; pkill -f 'uvicorn' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; exit 0" SIGINT SIGTERM

# 等待子进程
wait
