#!/bin/bash

# USB摄像头录制系统 - 环境诊断脚本
# 运行此脚本检查系统是否满足运行要求

echo "========================================"
echo "USB摄像头录制系统 - 环境诊断"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

check_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS++))
}

check_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN++))
}

check_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL++))
}

# 1. 检查操作系统
echo "1. 操作系统检查"
echo "   ------------------"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "   系统: $NAME $VERSION_ID"
    if [[ "$NAME" == *"Ubuntu"* ]] || [[ "$NAME" == *"Debian"* ]] || [[ "$NAME" == *"CentOS"* ]] || [[ "$NAME" == *"Arch"* ]]; then
        check_pass "支持的Linux发行版"
    else
        check_warn "未测试的Linux发行版，可能需要手动安装依赖"
    fi
else
    check_fail "无法检测操作系统"
fi
echo ""

# 2. 检查Node.js
echo "2. Node.js检查"
echo "   ------------------"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    echo "   版本: $NODE_VERSION"
    if [ "$NODE_MAJOR" -ge 18 ]; then
        check_pass "Node.js版本满足要求 (>=18)"
    else
        check_fail "Node.js版本过低，需要18.x或更高版本"
    fi
else
    check_fail "Node.js未安装"
fi
echo ""

# 3. 检查FFmpeg
echo "3. FFmpeg检查"
echo "   ------------------"
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -1)
    echo "   $FFMPEG_VERSION"
    check_pass "FFmpeg已安装"
    
    # 检查libx264支持
    if ffmpeg -encoders 2>/dev/null | grep -q libx264; then
        check_pass "支持H.264编码 (libx264)"
    else
        check_warn "可能不支持H.264编码，录制功能可能受限"
    fi
else
    check_fail "FFmpeg未安装"
fi
echo ""

# 4. 检查v4l-utils
echo "4. v4l-utils检查"
echo "   ------------------"
if command -v v4l2-ctl &> /dev/null; then
    V4L_VERSION=$(v4l2-ctl --version 2>&1 | head -1)
    echo "   $V4L_VERSION"
    check_pass "v4l-utils已安装"
else
    check_fail "v4l-utils未安装 (用于摄像头检测)"
fi
echo ""

# 5. 检查摄像头设备
echo "5. 摄像头设备检查"
echo "   ------------------"
VIDEO_DEVICES=$(ls /dev/video* 2>/dev/null)
if [ -n "$VIDEO_DEVICES" ]; then
    echo "   检测到以下视频设备:"
    for device in $VIDEO_DEVICES; do
        echo "   - $device"
    done
    check_pass "检测到视频设备"
    
    # 尝试获取设备详情
    if command -v v4l2-ctl &> /dev/null; then
        echo ""
        echo "   设备详情:"
        v4l2-ctl --list-devices 2>/dev/null | head -10 | while read line; do
            echo "   $line"
        done
    fi
else
    check_warn "未检测到视频设备 (/dev/video*)"
    echo "   提示: 请确保USB摄像头已连接"
fi
echo ""

# 6. 检查用户权限
echo "6. 用户权限检查"
echo "   ------------------"
CURRENT_USER=$(whoami)
echo "   当前用户: $CURRENT_USER"

if groups | grep -q video; then
    check_pass "用户在video组中"
else
    check_warn "用户不在video组中，可能无法访问摄像头"
    echo "   修复: sudo usermod -aG video $CURRENT_USER"
fi
echo ""

# 7. 检查磁盘空间
echo "7. 磁盘空间检查"
echo "   ------------------"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
AVAILABLE_SPACE=$(df -BG "$PROJECT_DIR" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')

if [ -n "$AVAILABLE_SPACE" ]; then
    echo "   可用空间: ${AVAILABLE_SPACE}GB"
    if [ "$AVAILABLE_SPACE" -ge 100 ]; then
        check_pass "磁盘空间充足 (>=100GB)"
    elif [ "$AVAILABLE_SPACE" -ge 10 ]; then
        check_warn "磁盘空间较少，建议至少100GB用于录制"
    else
        check_fail "磁盘空间不足，需要更多存储空间"
    fi
else
    check_warn "无法检测磁盘空间"
fi
echo ""

# 8. 检查端口占用
echo "8. 端口检查"
echo "   ------------------"
if command -v netstat &> /dev/null; then
    PORT_CHECK=$(netstat -tlnp 2>/dev/null | grep ":3001 ")
elif command -v ss &> /dev/null; then
    PORT_CHECK=$(ss -tlnp 2>/dev/null | grep ":3001 ")
else
    PORT_CHECK=""
fi

if [ -z "$PORT_CHECK" ]; then
    check_pass "端口3001可用"
else
    check_warn "端口3001已被占用"
    echo "   $PORT_CHECK"
fi
echo ""

# 9. 快速功能测试
echo "9. 快速功能测试"
echo "   ------------------"

# 测试FFmpeg捕获
if [ -n "$VIDEO_DEVICES" ] && command -v ffmpeg &> /dev/null; then
    FIRST_DEVICE=$(echo "$VIDEO_DEVICES" | head -1)
    echo "   测试FFmpeg摄像头访问..."
    if timeout 3 ffmpeg -f v4l2 -i "$FIRST_DEVICE" -vframes 1 -f null - 2>/dev/null; then
        check_pass "FFmpeg可以访问摄像头"
    else
        check_warn "FFmpeg无法访问摄像头，可能是权限问题"
    fi
else
    echo "   跳过: 需要摄像头设备和FFmpeg"
fi
echo ""

# 总结
echo "========================================"
echo "诊断结果总结"
echo "========================================"
echo ""
echo -e "  ${GREEN}通过: $PASS${NC}"
echo -e "  ${YELLOW}警告: $WARN${NC}"
echo -e "  ${RED}失败: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    if [ $WARN -eq 0 ]; then
        echo -e "${GREEN}系统完全满足运行要求！${NC}"
    else
        echo -e "${YELLOW}系统基本满足要求，但有一些警告需要注意。${NC}"
    fi
else
    echo -e "${RED}系统不满足运行要求，请根据上述提示修复问题。${NC}"
fi

echo ""
echo "如需安装依赖，请运行:"
echo "  Ubuntu/Debian: sudo apt install ffmpeg v4l-utils nodejs npm"
echo "  CentOS/RHEL:   sudo yum install ffmpeg v4l-utils nodejs npm"
echo "  Arch Linux:   sudo pacman -S ffmpeg v4l-utils nodejs npm"
echo ""
