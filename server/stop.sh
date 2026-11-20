#!/bin/bash
# 鲵吞亭社区后端服务器 - 停止脚本
# 用法：bash stop.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/server.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "已停止服务器 (PID $PID)"
    sleep 1
    rm -f "$PID_FILE"
  else
    echo "进程 $PID 未在运行"
    rm -f "$PID_FILE"
  fi
else
  echo "未找到 server.pid，服务器可能未通过 deploy.sh 启动"
fi
