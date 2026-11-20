#!/bin/bash
# =====================================================
#   鲵吞亭社区后端服务器 - Linux 一键部署脚本
#   用法：bash deploy.sh
#   可配置项（可选，通过环境变量覆盖）：
#     PORT           服务端口，默认 3000
#     DATA_DIR       数据目录，默认 本目录/data
#     ADMIN_USERNAME 管理员账号，默认 jdcwm
#     ADMIN_PASSWORD 管理员密码（必填，不再提供默认值）
# =====================================================

PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
ADMIN_USERNAME="${ADMIN_USERNAME:-jdcwm}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?请设置 ADMIN_PASSWORD（管理员密码）}"

echo "============================================"
echo "  鲵吞亭服务器 - 一键部署 (Linux)"
echo "============================================"
echo "  端口:     $PORT"
echo "  数据目录: $DATA_DIR"
echo ""

# ---------- 1. Node.js 检查 ----------
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js"
  echo "       Ubuntu/Debian 安装:"
  echo "         curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "         sudo apt-get install -y nodejs"
  echo "       CentOS/RHEL 安装:"
  echo "         curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
  echo "         sudo yum install -y nodejs"
  exit 1
fi
echo "[1/5] Node.js 已安装: $(node -v)"
echo ""

# ---------- 2. 安装依赖 ----------
cd "$SCRIPT_DIR"
if [ ! -d node_modules ]; then
  echo "[2/5] 首次运行，正在安装依赖 (npm install)..."
  npm install
  echo "[OK] 依赖安装完成"
else
  echo "[2/5] 依赖已存在，跳过安装"
fi
echo ""

# ---------- 3. 初始化管理员 ----------
echo "[3/5] 初始化管理员账号..."
ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" node setup-admin.js
echo ""

# ---------- 4. 开放防火墙端口 ----------
echo "[4/5] 尝试放行防火墙端口 $PORT ..."
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow "$PORT"/tcp >/dev/null 2>&1 \
    && echo "[OK] 已通过 ufw 放行 $PORT/tcp" \
    || echo "[提示] ufw 放行失败，请手动执行: sudo ufw allow $PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1 \
    && sudo firewall-cmd --reload >/dev/null 2>&1 \
    && echo "[OK] 已通过 firewalld 放行 $PORT/tcp" \
    || echo "[提示] firewalld 放行失败，请手动执行: sudo firewall-cmd --add-port=$PORT/tcp --permanent && sudo firewall-cmd --reload"
else
  echo "[提示] 未检测到 ufw/firewalld，请手动在云平台安全组放行 $PORT 端口"
fi
echo ""

# ---------- 5. 启动服务器 ----------
echo "[5/5] 启动服务器..."
cd "$SCRIPT_DIR"
PID_FILE="$SCRIPT_DIR/server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"

# 已有进程则先停止
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[INFO] 检测到旧进程 (PID $OLD_PID)，正在停止..."
    kill "$OLD_PID" 2>/dev/null
    sleep 2
  fi
fi

PORT="$PORT" DATA_DIR="$DATA_DIR" nohup node server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
sleep 2

if kill -0 "$NEW_PID" 2>/dev/null; then
  STATUS="运行中"
else
  STATUS="启动失败，请查看日志: $LOG_FILE"
fi

# 检测公网 IP
PUBLIC_IP=""
if command -v curl >/dev/null 2>&1; then
  PUBLIC_IP="$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null || curl -s --max-time 5 https://api.ipify.org 2>/dev/null)"
fi

echo ""
echo "============================================"
echo "  部署完成！状态: $STATUS"
echo "============================================"
echo "  进程 PID:   $NEW_PID"
echo "  日志文件:   $LOG_FILE"
echo "  停止服务:   bash stop.sh"
if [ -n "$PUBLIC_IP" ]; then
  echo "  公网访问:   http://$PUBLIC_IP:$PORT"
fi
echo "  本机访问:   http://127.0.0.1:$PORT"
echo "  数据目录:   $DATA_DIR"
echo "  管理员账号: $ADMIN_USERNAME"
echo ""
echo "  在手机 app 里：左菜单 → 服务器 → 填入公网地址即可。"
echo "  若无法访问，请确认云平台安全组已放行 $PORT 端口。"
echo ""
