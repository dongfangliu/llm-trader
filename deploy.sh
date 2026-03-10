#!/bin/bash
# =============================================================================
# deploy.sh — 自动拉取最新代码、重新构建并重启所有服务
# 用法:
#   chmod +x deploy.sh
#   ./deploy.sh              # 标准部署
#   ./deploy.sh --no-cache   # 强制完整重新构建（不使用 Docker 缓存）
#   ./deploy.sh --skip-pull  # 跳过 git pull（仅重建+重启）
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 颜色 ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── 参数解析 ──────────────────────────────────────────────────────────────────
NO_CACHE=""
SKIP_PULL=false
for arg in "$@"; do
  case $arg in
    --no-cache)  NO_CACHE="--no-cache" ;;
    --skip-pull) SKIP_PULL=true ;;
  esac
done

# ── 工具函数 ──────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${BOLD}${YELLOW}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

DEPLOY_START=$(date +%s)

# ── 前置检查 ──────────────────────────────────────────────────────────────────
log_section "前置检查"

for cmd in git docker; do
  if ! command -v "$cmd" &>/dev/null; then
    log_error "未找到命令: $cmd，请先安装"
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  log_error "需要 Docker Compose v2（docker compose），请升级 Docker"
  exit 1
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    log_warn ".env 文件不存在，已从 .env.example 复制，请先填写必要配置后重新运行"
    cp .env.example .env
    exit 1
  else
    log_error ".env 文件不存在，请创建并填写配置"
    exit 1
  fi
fi

log_ok "前置检查通过"

# ── Git 拉取 ──────────────────────────────────────────────────────────────────
log_section "Git 拉取最新代码"

if [ "$SKIP_PULL" = true ]; then
  log_warn "已跳过 git pull（--skip-pull）"
else
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log_info "当前分支: ${BOLD}$CURRENT_BRANCH${NC}"

  BEFORE_HASH=$(git rev-parse --short HEAD)

  # 暂存本地未提交的修改（主要是 .env 等配置文件）
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warn "检测到本地修改，暂时 stash..."
    git stash push -m "deploy-auto-stash-$(date +%Y%m%d%H%M%S)" || true
    STASHED=true
  else
    STASHED=false
  fi

  git pull origin "$CURRENT_BRANCH"

  if [ "$STASHED" = true ]; then
    log_info "恢复本地修改..."
    git stash pop || log_warn "stash pop 遇到冲突，请手动处理"
  fi

  AFTER_HASH=$(git rev-parse --short HEAD)

  if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
    log_info "代码无变化（$AFTER_HASH），继续执行重建..."
  else
    log_ok "代码已更新: $BEFORE_HASH → $AFTER_HASH"
    echo ""
    git --no-pager log --oneline "$BEFORE_HASH..$AFTER_HASH" | head -20
    echo ""
  fi
fi

# ── 构建镜像 ──────────────────────────────────────────────────────────────────
log_section "构建 Docker 镜像"

[ -n "$NO_CACHE" ] && log_warn "使用 --no-cache，将完整重新构建（耗时较长）"

docker compose build $NO_CACHE --parallel
log_ok "镜像构建完成"

# ── 滚动重启服务 ──────────────────────────────────────────────────────────────
log_section "重启服务"

# 先确保基础服务（postgres / redis）健康再启动应用层
log_info "启动基础服务（postgres、redis）..."
docker compose up -d postgres redis

log_info "等待数据库就绪..."
WAIT=0
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-trader}" &>/dev/null; do
  WAIT=$((WAIT+1))
  if [ $WAIT -ge 30 ]; then
    log_error "数据库在 30s 内未就绪，请检查日志：docker compose logs postgres"
    exit 1
  fi
  sleep 1
done
log_ok "数据库就绪"

log_info "重启应用服务（backend、worker、data-collector、frontend）..."
docker compose up -d --remove-orphans backend worker data-collector frontend

log_ok "所有服务已启动"

# ── 健康检查 ──────────────────────────────────────────────────────────────────
log_section "健康检查"

BACKEND_PORT="${BACKEND_PORT:-8000}"
log_info "等待后端 API 就绪（最多 60s）..."
WAIT=0
until curl -sf "http://localhost:${BACKEND_PORT}/api/health" &>/dev/null; do
  WAIT=$((WAIT+1))
  if [ $WAIT -ge 60 ]; then
    log_error "后端 60s 内未响应，查看日志："
    docker compose logs --tail=30 backend
    exit 1
  fi
  sleep 1
done
log_ok "后端健康检查通过（${WAIT}s）"

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
log_info "等待前端就绪（最多 60s）..."
WAIT=0
until curl -sf "http://localhost:${FRONTEND_PORT}" &>/dev/null; do
  WAIT=$((WAIT+1))
  if [ $WAIT -ge 60 ]; then
    log_warn "前端 60s 内未响应，可能仍在编译，请稍后手动验证"
    break
  fi
  sleep 1
done
[ $WAIT -lt 60 ] && log_ok "前端健康检查通过（${WAIT}s）"

# ── 清理旧镜像 ────────────────────────────────────────────────────────────────
log_section "清理悬空镜像"
docker image prune -f &>/dev/null && log_ok "已清理悬空镜像" || true

# ── 完成摘要 ──────────────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║         🚀 部署成功！                    ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  前端:    ${GREEN}http://localhost:${FRONTEND_PORT:-3000}${NC}"
echo -e "  后端:    ${GREEN}http://localhost:${BACKEND_PORT:-8000}${NC}"
echo -e "  API文档: ${GREEN}http://localhost:${BACKEND_PORT:-8000}/docs${NC}"
echo ""
echo -e "  Git commit: ${BOLD}$(git rev-parse --short HEAD)${NC}  ($(git log -1 --format='%s'))"
echo -e "  耗时: ${BOLD}${ELAPSED}s${NC}"
echo ""
echo -e "  查看日志: ${YELLOW}docker compose logs -f${NC}"
echo -e "  服务状态: ${YELLOW}docker compose ps${NC}"
echo ""
