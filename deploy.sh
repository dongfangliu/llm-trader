#!/bin/bash
# =============================================================================
# deploy.sh — 自动拉取最新代码、重新构建并重启所有服务
# 用法:
#   chmod +x deploy.sh
#   ./deploy.sh              # 标准部署（首次会引导配置 .env；已配置则询问是否重配，默认否）
#   ./deploy.sh --no-cache   # 强制完整重新构建（不使用 Docker 缓存）
#   ./deploy.sh --skip-pull  # 跳过 git pull（仅重建+重启）
#   ./deploy.sh --configure  # 跳过询问，直接进入交互式配置向导（重写 .env，先备份）
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
CONFIGURE=false
for arg in "$@"; do
  case $arg in
    --no-cache)  NO_CACHE="--no-cache" ;;
    --skip-pull) SKIP_PULL=true ;;
    --configure) CONFIGURE=true ;;
  esac
done

# ── 工具函数 ──────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${BOLD}${YELLOW}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── 配置向导工具 ──────────────────────────────────────────────────────────────
# 生成强随机十六进制密钥（参数：字节数）。优先 openssl，回退 python3，再回退 urandom。
gen_secret() {
  local bytes="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -hex "$bytes"
  elif command -v python3 &>/dev/null; then
    python3 -c "import secrets,sys; print(secrets.token_hex(int(sys.argv[1])))" "$bytes"
  else
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# 提示输入并带默认值：prompt_default <返回变量名> <提示文案> <默认值>
# 显示默认值，用户直接回车则采用默认，否则采用输入。结果写入指定变量。
prompt_default() {
  local __var="$1" __label="$2" __default="$3" __input=""
  if [ -n "$__default" ]; then
    printf "  %s ${BOLD}[%s]${NC}: " "$__label" "$__default" >&2
  else
    printf "  %s ${BOLD}[留空跳过]${NC}: " "$__label" >&2
  fi
  read -r __input </dev/tty || __input=""
  printf -v "$__var" '%s' "${__input:-$__default}"
}

# 必填项：空值则循环重新提示。prompt_required <返回变量名> <提示文案>
prompt_required() {
  local __var="$1" __label="$2" __input=""
  while true; do
    printf "  %s ${RED}(必填)${NC}: " "$__label" >&2
    read -r __input </dev/tty || __input=""
    if [ -n "$__input" ]; then
      printf -v "$__var" '%s' "$__input"
      return
    fi
    log_warn "此项为必填，不能为空"
  done
}

# 交互式配置向导：逐项引导，生成 .env
run_config_wizard() {
  if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
    log_error "需要交互式终端来运行配置向导。请在终端直接执行 ./deploy.sh，勿通过管道（如 curl | bash）运行。"
    exit 1
  fi

  echo -e "  即将引导你完成 .env 配置。${BOLD}密钥类已自动生成，直接回车即可采用${NC}；可选项留空回车则跳过。\n"

  # 1. 必填密钥
  echo -e "${BOLD}【1/5】必填密钥${NC}"
  local secret_key admin_token postgres_password llm_api_key
  prompt_default secret_key        "SECRET_KEY（JWT 签名密钥）" "$(gen_secret 32)"
  prompt_default admin_token       "ADMIN_TOKEN（管理后台令牌，请妥善保存）" "$(gen_secret 24)"
  prompt_default postgres_password "POSTGRES_PASSWORD（数据库密码）" "$(gen_secret 16)"
  echo -e "  ${YELLOW}LLM_API_KEY：DeepSeek / OpenAI 兼容接口的 API 密钥${NC}"
  prompt_required llm_api_key      "LLM_API_KEY"

  # 2. 域名 / 跨域
  echo -e "\n${BOLD}【2/5】域名 / 跨域${NC}"
  local app_base_url allowed_origins
  echo -e "  ${YELLOW}生产环境填实际域名，如 https://yourdomain.com${NC}"
  prompt_default app_base_url      "APP_BASE_URL（前端公网地址）" "http://localhost:3000"
  prompt_default allowed_origins   "ALLOWED_ORIGINS（允许的跨域来源，* 表示全部）" "*"

  # 3. 可选 — 邮件 / Resend
  echo -e "\n${BOLD}【3/5】邮件 / Resend（可选）${NC}"
  echo -e "  ${YELLOW}注册 https://resend.com 获取 API Key；留空则验证链接打印到后端日志${NC}"
  local resend_api_key email_from
  prompt_default resend_api_key    "RESEND_API_KEY" ""
  prompt_default email_from        "EMAIL_FROM（发件地址，如 noreply@yourdomain.com）" ""

  # 4. 可选 — 爱发电
  echo -e "\n${BOLD}【4/5】爱发电 API 凭证（可选）${NC}"
  echo -e "  ${YELLOW}在 afdian.net/dashboard/dev 获取；留空则不启用爱发电${NC}"
  local afdian_user_id afdian_api_token afdian_webhook_token
  prompt_default afdian_user_id       "AFDIAN_USER_ID" ""
  prompt_default afdian_api_token     "AFDIAN_API_TOKEN" ""
  prompt_default afdian_webhook_token "AFDIAN_WEBHOOK_TOKEN" ""

  # 5. 数据库默认
  echo -e "\n${BOLD}【5/5】数据库（默认即可）${NC}"
  local postgres_user postgres_db
  prompt_default postgres_user     "POSTGRES_USER" "trader"
  prompt_default postgres_db       "POSTGRES_DB" "trader"

  # 已有 .env 则先备份
  if [ -f ".env" ]; then
    local backup=".env.bak.$(date +%Y%m%d%H%M%S)"
    cp .env "$backup"
    log_info "已备份现有 .env → ${BOLD}$backup${NC}"
  fi

  # 写出 .env（结构对齐 .env.example）
  cat > .env <<EOF
# =============================================================
# LLM Trading Analyzer — 环境变量配置（由 deploy.sh 配置向导生成）
# LLM provider/model、爱发电套餐、定价等配置在 backend/initial_settings.json
# =============================================================

# ======================== 必填 ========================
SECRET_KEY="${secret_key}"
ADMIN_TOKEN="${admin_token}"
LLM_API_KEY="${llm_api_key}"
POSTGRES_PASSWORD="${postgres_password}"

# ======================== 域名 / 跨域 ========================
ALLOWED_ORIGINS="${allowed_origins}"
APP_BASE_URL="${app_base_url}"

# ======================== 邮件 / Resend（可选）================
RESEND_API_KEY="${resend_api_key}"
EMAIL_FROM="${email_from}"

# ======================== 爱发电 API 凭证（可选）==============
AFDIAN_USER_ID="${afdian_user_id}"
AFDIAN_API_TOKEN="${afdian_api_token}"
AFDIAN_WEBHOOK_TOKEN="${afdian_webhook_token}"

# ======================== 数据库 ===================
POSTGRES_USER="${postgres_user}"
POSTGRES_DB="${postgres_db}"
EOF

  log_ok ".env 已生成"
  echo ""
  echo -e "  域名:     ${GREEN}${app_base_url}${NC}"
  echo -e "  邮件:     $([ -n "$resend_api_key" ] && echo -e "${GREEN}已启用${NC}" || echo -e "${YELLOW}未配置（验证链接走后端日志）${NC}")"
  echo -e "  爱发电:   $([ -n "$afdian_api_token" ] && echo -e "${GREEN}已启用${NC}" || echo -e "${YELLOW}未配置${NC}")"
  echo -e "  ${BOLD}管理后台令牌 ADMIN_TOKEN: ${admin_token}${NC}"
  echo -e "  ${YELLOW}↑ 请妥善保存以上 ADMIN_TOKEN，用于登录管理后台${NC}"
  echo ""
}

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

log_ok "前置检查通过"

# ── .env 配置 ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  # 首次部署：必须配置
  log_section "首次部署 — 配置向导"
  log_info "未检测到 .env，进入交互式配置..."
  run_config_wizard
elif [ "$CONFIGURE" = true ]; then
  log_section "重新配置 .env"
  run_config_wizard
else
  # .env 已存在：每次启动询问是否重新配置，默认否
  if [ -t 0 ] || [ -e /dev/tty ]; then
    printf "检测到已有 .env，是否重新配置？[y/N] "
    read -r RECONFIG_ANS </dev/tty || RECONFIG_ANS=""
  else
    RECONFIG_ANS=""
  fi
  if [[ "$RECONFIG_ANS" =~ ^[Yy]$ ]]; then
    log_section "重新配置 .env"
    run_config_wizard
  else
    log_info "沿用现有 .env，继续部署..."
  fi
fi

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

# ── 停止现有服务 ──────────────────────────────────────────────────────────────
log_section "停止现有服务"
log_info "执行 docker compose down（保留 volumes）..."
docker compose down --remove-orphans
log_ok "已停止现有服务"

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

log_info "重启应用服务（backend、frontend）..."
docker compose up -d --remove-orphans backend frontend

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
