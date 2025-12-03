#!/bin/bash

# USB摄像头录制系统 - 开发环境启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "USB摄像头录制系统 - 开发模式"
echo "========================================"
echo ""

# 检查依赖
check_deps() {
    if ! command -v ffmpeg &> /dev/null; then
        echo "[ERROR] FFmpeg 未安装，请先安装 FFmpeg"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo "[ERROR] Node.js 未安装，请先安装 Node.js"
        exit 1
    fi
}

# 安装依赖
install_deps() {
    echo "[INFO] 检查并安装依赖..."
    
    # 后端依赖
    if [ ! -d "$PROJECT_DIR/backend/node_modules" ]; then
        echo "[INFO] 安装后端依赖..."
        cd "$PROJECT_DIR/backend"
        npm install
    fi
    
    # 前端依赖
    if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
        echo "[INFO] 安装前端依赖..."
        cd "$PROJECT_DIR/frontend"
        npm install
    fi
}

# 创建数据目录
create_dirs() {
    mkdir -p "$PROJECT_DIR/data/recordings"
}

# 启动后端
start_backend() {
    echo "[INFO] 启动后端服务..."
    cd "$PROJECT_DIR/backend"
    DATA_DIR="$PROJECT_DIR/data" npm run dev &
    BACKEND_PID=$!
    echo "[INFO] 后端 PID: $BACKEND_PID"
}

# 启动前端
start_frontend() {
    echo "[INFO] 启动前端开发服务器..."
    cd "$PROJECT_DIR/frontend"
    npm run dev &
    FRONTEND_PID=$!
    echo "[INFO] 前端 PID: $FRONTEND_PID"
}

# 清理函数
cleanup() {
    echo ""
    echo "[INFO] 正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM

# 主流程
check_deps
install_deps
create_dirs
start_backend
sleep 2
start_frontend

echo ""
echo "========================================"
echo "服务已启动"
echo "========================================"
echo ""
echo "后端地址: http://localhost:3001"
echo "前端地址: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待
wait
