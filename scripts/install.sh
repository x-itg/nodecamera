#!/bin/bash

# USB摄像头录制系统 - 安装脚本
# 此脚本将安装系统依赖并配置服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查root权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 sudo 运行此脚本"
        exit 1
    fi
}

# 获取实际用户
get_real_user() {
    if [ -n "$SUDO_USER" ]; then
        echo "$SUDO_USER"
    else
        echo "$(whoami)"
    fi
}

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    log_info "检测到操作系统: $OS $VER"
}

# 安装系统依赖
install_dependencies() {
    log_info "安装系统依赖..."
    
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y ffmpeg v4l-utils nodejs npm
    elif command -v dnf &> /dev/null; then
        dnf install -y ffmpeg v4l-utils nodejs npm
    elif command -v yum &> /dev/null; then
        yum install -y epel-release
        yum install -y ffmpeg v4l-utils nodejs npm
    elif command -v pacman &> /dev/null; then
        pacman -Sy --noconfirm ffmpeg v4l-utils nodejs npm
    else
        log_error "不支持的包管理器，请手动安装 ffmpeg, v4l-utils, nodejs, npm"
        exit 1
    fi
    
    log_info "系统依赖安装完成"
}

# 检查Node.js版本
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_warn "Node.js 版本过低 (当前: $(node -v))，推荐使用 18.x 或更高版本"
    else
        log_info "Node.js 版本: $(node -v)"
    fi
}

# 安装项目依赖
install_project_deps() {
    log_info "安装项目依赖..."
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    
    # 安装后端依赖
    cd "$PROJECT_DIR/backend"
    npm install
    npm run build
    
    # 安装前端依赖并构建
    cd "$PROJECT_DIR/frontend"
    npm install
    npm run build
    
    log_info "项目依赖安装完成"
}

# 创建数据目录
create_data_dirs() {
    log_info "创建数据目录..."
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    DATA_DIR="$PROJECT_DIR/data"
    RECORDINGS_DIR="$DATA_DIR/recordings"
    
    mkdir -p "$DATA_DIR"
    mkdir -p "$RECORDINGS_DIR"
    
    # 设置权限
    REAL_USER=$(get_real_user)
    chown -R "$REAL_USER:$REAL_USER" "$DATA_DIR"
    
    log_info "数据目录创建完成: $DATA_DIR"
}

# 创建systemd服务
create_service() {
    log_info "创建系统服务..."
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    REAL_USER=$(get_real_user)
    
    cat > /etc/systemd/system/usb-camera-recorder.service << EOF
[Unit]
Description=USB Camera Recorder Service
After=network.target

[Service]
Type=simple
User=$REAL_USER
WorkingDirectory=$PROJECT_DIR/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATA_DIR=$PROJECT_DIR/data

# 日志配置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=usb-camera-recorder

[Install]
WantedBy=multi-user.target
EOF

    # 重新加载systemd配置
    systemctl daemon-reload
    
    log_info "系统服务创建完成"
}

# 启用并启动服务
enable_service() {
    log_info "启用并启动服务..."
    
    systemctl enable usb-camera-recorder
    systemctl start usb-camera-recorder
    
    # 检查服务状态
    if systemctl is-active --quiet usb-camera-recorder; then
        log_info "服务已成功启动"
    else
        log_error "服务启动失败，请检查日志: journalctl -u usb-camera-recorder"
    fi
}

# 配置用户权限
configure_permissions() {
    log_info "配置用户权限..."
    
    REAL_USER=$(get_real_user)
    
    # 添加用户到video组以访问摄像头
    if ! groups "$REAL_USER" | grep -q video; then
        usermod -aG video "$REAL_USER"
        log_info "已将用户 $REAL_USER 添加到 video 组"
        log_warn "请重新登录以使权限生效"
    fi
}

# 显示安装完成信息
show_completion() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}安装完成！${NC}"
    echo "========================================"
    echo ""
    echo "服务已配置为开机自启动"
    echo ""
    echo "访问地址: http://localhost:3001"
    echo ""
    echo "常用命令:"
    echo "  查看状态: sudo systemctl status usb-camera-recorder"
    echo "  启动服务: sudo systemctl start usb-camera-recorder"
    echo "  停止服务: sudo systemctl stop usb-camera-recorder"
    echo "  重启服务: sudo systemctl restart usb-camera-recorder"
    echo "  查看日志: journalctl -u usb-camera-recorder -f"
    echo ""
    echo "录制文件保存位置: $PROJECT_DIR/data/recordings"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "USB摄像头录制系统 - 安装程序"
    echo "========================================"
    echo ""
    
    check_root
    detect_os
    install_dependencies
    check_node_version
    install_project_deps
    create_data_dirs
    configure_permissions
    create_service
    enable_service
    show_completion
}

# 执行主函数
main "$@"
