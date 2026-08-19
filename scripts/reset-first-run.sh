#!/usr/bin/env bash
# 重置 deepseek-harness-desktop 到"首次启动"状态(复现安装流程)。
# 用法: ./scripts/reset-first-run.sh [--with-node]
#   默认只清 dsh 内核与日志;
#   --with-node 连下载的 Node 兜底目录一起清(本机 Node 仍会被发现复用,
#   想完整复现 Node 下载需临时改 node-resolver 的候选列表)。

set -euo pipefail

SLUG="io.github.snkzhong.deepseek-harness-desktop"
USER_DATA="$HOME/Library/Application Support/$SLUG"
[ "$(uname -s)" = "Darwin" ] || USER_DATA="$HOME/.config/$SLUG"

# Windows(Git Bash)路径(Electron userData 在 Roaming)
if command -v cygpath >/dev/null 2>&1; then
  USER_DATA="$(cygpath "$APPDATA")/$SLUG"
fi

WITH_NODE=0
[ "${1:-}" = "--with-node" ] && WITH_NODE=1

echo "userData: $USER_DATA"

# 1. 停掉可能在跑的实例(壳 + dsh 子进程),避免文件被占用
if pkill -f "Electron.app/Contents/MacOS/Electron .*deepseek-harness-desktop" 2>/dev/null; then
  echo "stopped: electron dev instance"
fi
if pkill -f "bin.js --profile web" 2>/dev/null; then
  echo "stopped: dsh child processes"
fi
sleep 1

# 2. 清内核与日志(首启状态的核心)
if [ -d "$USER_DATA/runtime/dsh" ]; then
  rm -rf "$USER_DATA/runtime/dsh"
  echo "removed: runtime/dsh (kernel)"
fi
rm -f "$USER_DATA/logs/dsh-web.log" "$USER_DATA/logs/main.log"
echo "removed: logs"

# 3. 可选:连 Node 兜底目录一起清
if [ "$WITH_NODE" = "1" ] && [ -d "$USER_DATA/runtime/node" ]; then
  rm -rf "$USER_DATA/runtime/node"
  echo "removed: runtime/node (bundled node dist)"
fi

# 4. 保留:settings.json / dsh(DSH_HOME,会话与凭证)— 符合"升级不丢数据"
echo ""
echo "kept: settings.json, DSH_HOME (sessions/credentials)"
echo "first-run state ready. start with: npm run dev"
