#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -x "$PROJECT_DIR/run.sh" ]; then
  echo "无法找到项目启动器：$PROJECT_DIR/run.sh"
  echo "请确认压缩包已完整解压，且启动文件没有被单独移出项目文件夹。"
  echo
  read -r -p "按回车键关闭…" _unused
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
exec "$PROJECT_DIR/run.sh"
