#!/bin/bash

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.launcher"
LOG_FILE="$RUNTIME_DIR/server.log"
PORT_FILE="$RUNTIME_DIR/port"
PID_FILE="$RUNTIME_DIR/pid"
HOST="127.0.0.1"
SERVER_PID=""
TAIL_PID=""
STOP_REQUESTED=0

pause_before_exit() {
  echo
  read -r -p "按回车键关闭这个窗口…" _unused
}

fail() {
  echo
  echo "启动失败：$1"
  if [ -f "$LOG_FILE" ]; then
    echo
    echo "最近的启动日志："
    tail -n 30 "$LOG_FILE"
  fi
  pause_before_exit
  exit 1
}

is_video_remaker_ready() {
  local port="$1"
  curl -fsS --max-time 2 "http://$HOST:$port/api/health" 2>/dev/null | grep -q '"service":"video-remaker"'
}

port_is_busy() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

cleanup() {
  if [ -n "$TAIL_PID" ]; then
    kill "$TAIL_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$SERVER_PID" ]; then
    pkill -TERM -P "$SERVER_PID" >/dev/null 2>&1 || true
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

handle_stop() {
  STOP_REQUESTED=1
  cleanup
}

trap cleanup EXIT
trap handle_stop INT TERM

clear
echo "========================================"
echo "  Video Remaker · 本地启动器"
echo "========================================"
echo

cd "$PROJECT_DIR" || fail "无法进入项目目录。"
mkdir -p "$RUNTIME_DIR" || fail "无法创建启动目录。"

if ! command -v node >/dev/null 2>&1; then
  fail "未找到 Node.js。请先安装 Node.js 20 或更高版本。"
fi

if ! command -v npm >/dev/null 2>&1; then
  fail "未找到 npm。请重新安装 Node.js。"
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 版本过低，当前项目需要 Node.js 20 或更高版本。"
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "提醒：未检测到 FFmpeg / ffprobe。页面可以打开，但抽帧和成片合成会失败。"
  echo
fi

if [ ! -f "$PROJECT_DIR/.env" ] && [ -f "$PROJECT_DIR/.env.example" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env" || fail "无法创建本地配置文件。"
  echo "已创建安全的 Mock 配置；默认不会调用付费 API。"
  echo
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "首次启动：正在安装项目依赖，请保持网络连接…"
  npm install >"$LOG_FILE" 2>&1 || fail "依赖安装失败。请检查网络后重试。"
fi

if [ -f "$PORT_FILE" ]; then
  SAVED_PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
  if [ -n "$SAVED_PORT" ] && is_video_remaker_ready "$SAVED_PORT"; then
    URL="http://$HOST:$SAVED_PORT"
    echo "工作台已经在运行，正在打开：$URL"
    open "$URL"
    echo
    echo "可以关闭这个窗口，已运行的工作台不会受影响。"
    sleep 2
    exit 0
  fi
fi

PORT=""
candidate=3000
while [ "$candidate" -le 3010 ]; do
  if is_video_remaker_ready "$candidate"; then
    echo "$candidate" >"$PORT_FILE"
    URL="http://$HOST:$candidate"
    echo "工作台已经在运行，正在打开：$URL"
    open "$URL"
    sleep 2
    exit 0
  fi
  if ! port_is_busy "$candidate"; then
    PORT="$candidate"
    break
  fi
  candidate=$((candidate + 1))
done

if [ -z "$PORT" ]; then
  fail "3000–3010 端口都被占用，请先关闭其他本地网页服务。"
fi

echo "$PORT" >"$PORT_FILE"
: >"$LOG_FILE"

echo "正在启动工作台…"
echo "本地地址：http://$HOST:$PORT"
echo

npm run dev -- -H "$HOST" -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

attempt=0
while [ "$attempt" -lt 90 ]; do
  if is_video_remaker_ready "$PORT"; then
    URL="http://$HOST:$PORT"
    echo "启动成功，正在打开浏览器…"
    open "$URL"
    echo
    echo "工作台运行中：$URL"
    echo "请保留这个窗口。需要停止时，按 Control + C。"
    echo "----------------------------------------"
    tail -f "$LOG_FILE" &
    TAIL_PID=$!
    wait "$SERVER_PID"
    SERVER_STATUS=$?
    SERVER_PID=""
    kill "$TAIL_PID" >/dev/null 2>&1 || true
    TAIL_PID=""
    rm -f "$PID_FILE"
    if [ "$STOP_REQUESTED" -eq 1 ]; then
      echo
      echo "工作台已停止。"
      exit 0
    fi
    if [ "$SERVER_STATUS" -ne 0 ]; then
      fail "本地服务意外退出。"
    fi
    exit 0
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    SERVER_PID=""
    fail "本地服务未能正常启动。"
  fi

  sleep 1
  attempt=$((attempt + 1))
done

fail "90 秒内没有等到网页就绪。"
