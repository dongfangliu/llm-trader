"""
启动 Web V2 (FastAPI + Vue3) 界面

使用方法:
    python start_web_v2.py

访问地址:
    - 交互式文档: http://localhost:8000/docs
    - ReDoc文档: http://localhost:8000/redoc
    - WebSocket: ws://localhost:8000/ws
"""

import sys
import io
import subprocess
from pathlib import Path
import platform

# Windows console UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 切换到web_v2/server目录
server_dir = Path(__file__).parent / "web_v2" / "server"

if not server_dir.exists():
    print(f"❌ 错误: 找不到服务器目录 {server_dir}")
    sys.exit(1)

print("=" * 60)
print("🚀 启动 Trading System Web V2 (FastAPI + Vue3)")
print("=" * 60)
print(f"📁 服务器目录: {server_dir}")
print()

# 数据初始化已禁用 - 避免拉取非交易时段的无效数据
# 如需手动初始化数据，请运行: python scripts/init_realtime_data.py
project_root = Path(__file__).parent
print("ℹ️  自动数据初始化已禁用，系统将在交易时段采集实时数据")
print()

# 运行FastAPI服务器
try:
    subprocess.run(
        [sys.executable, "main.py"],
        cwd=server_dir,
        check=True
    )
except KeyboardInterrupt:
    print("\n✅ 服务器已停止")
except Exception as e:
    print(f"❌ 启动失败: {e}")
    sys.exit(1)
