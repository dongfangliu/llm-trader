#!/usr/bin/env bash
#
# cleanup.sh - 清理 Docker 构建产生的历史废物（构建缓存 + 悬空镜像）
#
# 每次 `docker compose up -d --build`（即 start.ps1 -Build）都会重建
# trader-frontend:latest / trader-backend:latest，把上一版镜像变成悬空
# <none> 镜像，同时 BuildKit 构建缓存不断堆积，长期占满磁盘。
# 本脚本只清这些「重建废物」，只保留有用的东西。
#
# 安全红线（脚本绝不触碰）：
#   - 数据卷 postgres_data / redis_data / backend_data / backend_logs（真实数据）
#   - 打了 tag 的镜像 trader-*:latest / postgres / redis（latest 不会被删）
#   - 运行中的容器
#   不使用任何 volume / system prune / -a / --volumes 命令。
#
# 用法:
#   ./cleanup.sh            # 执行清理（构建缓存 + 悬空镜像）
#   ./cleanup.sh --dry-run  # 只预览将清理什么，不删任何东西
#
# 面向 Ubuntu 服务器（废物主要在那累积）；Windows 本地经 WSL/Git Bash 亦可。

set -euo pipefail

# ── 彩色提示 ──────────────────────────────────────────────────────────────────
c_cyan='\033[36m'; c_green='\033[32m'; c_yellow='\033[33m'; c_gray='\033[90m'; c_reset='\033[0m'
hdr()  { printf "\n${c_cyan}%s${c_reset}\n" "$1"; }
ok()   { printf "  ${c_green}[OK]${c_reset} %s\n" "$1"; }
warn() { printf "  ${c_yellow}[!]${c_reset}  %s\n" "$1"; }
info() { printf "  ${c_gray}[.]${c_reset}  %s\n" "$1"; }

# ── 解析参数 ──────────────────────────────────────────────────────────────────
DRY_RUN=0
case "${1:-}" in
  --dry-run|-n) DRY_RUN=1 ;;
  "" ) ;;
  -h|--help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  *)
    warn "未知参数: $1（可用: --dry-run）"; exit 1 ;;
esac

# ── 前置检查 ──────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  printf "  ${c_yellow}[X]${c_reset}  未找到 docker 命令\n"; exit 1
fi

hdr "清理前磁盘占用 (docker system df)"
docker system df

# ── Dry-run：只展示将被清理的目标 ─────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  hdr "[DRY-RUN] 将被清理的悬空 <none> 镜像"
  dangling="$(docker images -f dangling=true -q)"
  if [ -n "$dangling" ]; then
    docker images -f dangling=true
  else
    info "没有悬空镜像"
  fi
  hdr "[DRY-RUN] 构建缓存可回收量见上方 docker system df 的 Build Cache → RECLAIMABLE 列"
  warn "这是预览模式，未删除任何东西。去掉 --dry-run 即真正执行清理。"
  exit 0
fi

# ── 真正清理（仅两条最安全的命令）────────────────────────────────────────────
hdr "清理 BuildKit 构建缓存 (docker builder prune)"
docker builder prune -f

hdr "清理悬空 <none> 镜像 (docker image prune，保留 latest)"
docker image prune -f

hdr "清理后磁盘占用 (docker system df)"
docker system df

ok "完成：已清理构建缓存与悬空镜像，数据卷与 latest 镜像均保留。"
