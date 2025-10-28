"""
前后端API适配度检测
"""

import sys
import io
import platform
from pathlib import Path
import re

# Windows console UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

project_root = Path(__file__).parent.parent

print("=" * 80)
print("前后端API适配度检测")
print("=" * 80)

# 1. 检查后端API路由
print("\n📋 后端API路由:")
print("-" * 80)

backend_routes = {}

# 读取main.py获取路由注册
main_py = project_root / "web_v2" / "server" / "main.py"
with open(main_py, 'r', encoding='utf-8') as f:
    content = f.read()
    # 匹配 app.include_router(xxx.router, prefix="/api/v1/xxx", tags=["xxx"])
    pattern = r'app\.include_router\((\w+)\.router,\s*prefix="(/api/v1/[^"]+)"'
    matches = re.findall(pattern, content)

    for module, prefix in matches:
        backend_routes[module] = prefix
        print(f"  {module:20s} → {prefix}")

print(f"\n总计: {len(backend_routes)} 个路由模块")

# 2. 检查前端API调用
print("\n" + "=" * 80)
print("📱 前端API调用:")
print("-" * 80)

frontend_api_dir = project_root / "web_v2" / "frontend" / "src" / "api"
frontend_calls = {}

for api_file in frontend_api_dir.glob("*.ts"):
    if api_file.name == "__init__.ts":
        continue

    with open(api_file, 'r', encoding='utf-8') as f:
        content = f.read()
        # 匹配 axios.get/post('/api/v1/xxx')
        pattern = r'(?:axios\.|client\.)(?:get|post|put|delete)\s*\(\s*[\'"](/api/v1/[^\'"]+)'
        matches = re.findall(pattern, content)

        if matches:
            frontend_calls[api_file.name] = list(set(matches))
            print(f"\n{api_file.name}:")
            for endpoint in sorted(set(matches)):
                print(f"  → {endpoint}")

# 3. 对比匹配
print("\n" + "=" * 80)
print("🔍 匹配度分析:")
print("-" * 80)

# 收集所有前端调用的端点
all_frontend_endpoints = set()
for endpoints in frontend_calls.values():
    all_frontend_endpoints.update(endpoints)

# 收集所有后端提供的端点前缀
all_backend_prefixes = set(backend_routes.values())

print(f"\n前端调用端点数: {len(all_frontend_endpoints)}")
print(f"后端提供模块数: {len(backend_routes)}")

# 检查每个前端调用是否有对应的后端路由
print("\n✅ 匹配的端点:")
matched = []
for endpoint in sorted(all_frontend_endpoints):
    # 提取端点的模块前缀 (例如 /api/v1/kline/xxx -> /api/v1/kline)
    parts = endpoint.split('/')
    if len(parts) >= 4:
        prefix = '/'.join(parts[:4])  # /api/v1/kline
        if prefix in all_backend_prefixes:
            matched.append(endpoint)
            print(f"  {endpoint}")

print(f"\n❌ 未匹配的端点:")
unmatched = []
for endpoint in sorted(all_frontend_endpoints):
    parts = endpoint.split('/')
    if len(parts) >= 4:
        prefix = '/'.join(parts[:4])
        if prefix not in all_backend_prefixes:
            unmatched.append(endpoint)
            print(f"  {endpoint} (后端缺少模块)")

print("\n" + "=" * 80)
print("📊 适配度统计:")
print("-" * 80)

total = len(all_frontend_endpoints)
if total > 0:
    match_rate = (len(matched) / total) * 100
    print(f"总端点数: {total}")
    print(f"匹配数量: {len(matched)}")
    print(f"未匹配数: {len(unmatched)}")
    print(f"匹配率: {match_rate:.1f}%")

    if match_rate == 100:
        print("\n✅ 前后端完全适配！")
    elif match_rate >= 80:
        print("\n⚠️ 前后端基本适配，但有少量端点未匹配")
    else:
        print("\n❌ 前后端适配度较低，需要修复")
else:
    print("⚠️ 未检测到前端API调用")

print("=" * 80)
