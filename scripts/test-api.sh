#!/bin/bash

# USB摄像头录制系统 - API测试脚本
# 用于验证后端API是否正常工作

API_BASE="http://localhost:3001/api"

echo "========================================"
echo "USB摄像头录制系统 - API测试"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected="$5"
    
    echo -n "测试: $name ... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s "$API_BASE$endpoint")
    else
        response=$(curl -s -X "$method" -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint")
    fi
    
    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}通过${NC}"
        ((PASS++))
        return 0
    else
        echo -e "${RED}失败${NC}"
        echo "  响应: $response"
        ((FAIL++))
        return 1
    fi
}

# 检查服务是否运行
echo "检查服务状态..."
if ! curl -s "$API_BASE/health" > /dev/null 2>&1; then
    echo -e "${RED}错误: 后端服务未运行${NC}"
    echo ""
    echo "请先启动后端服务:"
    echo "  cd backend && npm run dev"
    echo ""
    exit 1
fi
echo -e "${GREEN}服务正在运行${NC}"
echo ""

echo "开始API测试..."
echo "----------------------------------------"

# 1. 健康检查
test_api "健康检查" "GET" "/health" "" "success"

# 2. 获取配置
test_api "获取配置" "GET" "/config" "" "success"

# 3. 获取摄像头列表
test_api "获取摄像头列表" "GET" "/cameras/devices" "" "success"

# 4. 获取录制状态
test_api "获取录制状态" "GET" "/recordings/status" "" "success"

# 5. 获取录制列表
test_api "获取录制列表" "GET" "/recordings/list" "" "success"

# 6. 获取流状态
test_api "获取流状态" "GET" "/stream/status" "" "success"

# 7. 更新配置
test_api "更新配置" "PUT" "/config/video_quality" '{"value":"medium"}' "success"

echo ""
echo "----------------------------------------"
echo "API测试完成"
echo ""
echo -e "  ${GREEN}通过: $PASS${NC}"
echo -e "  ${RED}失败: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}所有API测试通过！${NC}"
else
    echo -e "${YELLOW}部分API测试失败，请检查后端日志。${NC}"
fi
echo ""
