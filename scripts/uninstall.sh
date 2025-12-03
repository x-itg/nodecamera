#!/bin/bash

# USB摄像头录制系统 - 卸载脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

# 停止并禁用服务
stop_service() {
    log_info "停止服务..."
    
    if systemctl is-active --quiet usb-camera-recorder; then
        systemctl stop usb-camera-recorder
    fi
    
    if systemctl is-enabled --quiet usb-camera-recorder 2>/dev/null; then
        systemctl disable usb-camera-recorder
    fi
    
    log_info "服务已停止"
}

# 删除服务文件
remove_service() {
    log_info "删除服务文件..."
    
    if [ -f /etc/systemd/system/usb-camera-recorder.service ]; then
        rm -f /etc/systemd/system/usb-camera-recorder.service
        systemctl daemon-reload
    fi
    
    log_info "服务文件已删除"
}

# 询问是否删除数据
remove_data() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    DATA_DIR="$PROJECT_DIR/data"
    
    if [ -d "$DATA_DIR" ]; then
        echo ""
        read -p "是否删除录制数据和配置？(y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$DATA_DIR"
            log_info "数据目录已删除"
        else
            log_info "保留数据目录: $DATA_DIR"
        fi
    fi
}

# 显示卸载完成信息
show_completion() {
    echo ""
    echo "========================================"
    echo -e "${GREEN}卸载完成！${NC}"
    echo "========================================"
    echo ""
    echo "系统服务已移除"
    echo ""
    echo "如需完全删除，请手动删除项目目录"
    echo ""
}

# 主函数
main() {
    echo "========================================"
    echo "USB摄像头录制系统 - 卸载程序"
    echo "========================================"
    echo ""
    
    check_root
    stop_service
    remove_service
    remove_data
    show_completion
}

# 执行主函数
main "$@"
