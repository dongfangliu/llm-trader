"""
前端黑屏问题诊断脚本
检查后端API是否正常运行，并提供解决方案
"""

import sys
import io
import requests
import subprocess
import platform

# Windows UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def check_backend():
    """检查后端API是否运行"""
    print("=" * 60)
    print("[DIAGNOSTIC] Frontend Black Screen Issue")
    print("=" * 60)
    print()

    # 1. 检查端口8000是否被占用
    print("[1] Checking port 8000...")
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True
            )
            listening = any(":8000" in line and "LISTENING" in line for line in result.stdout.split("\n"))
        else:
            result = subprocess.run(
                ["lsof", "-i", ":8000"],
                capture_output=True,
                text=True
            )
            listening = bool(result.stdout.strip())

        if listening:
            print("   [OK] Port 8000 is listening")
        else:
            print("   [ERROR] Port 8000 is not listening - Backend not started!")
            return False
    except Exception as e:
        print(f"   [WARNING] Cannot check port: {e}")

    # 2. 尝试访问健康检查端点
    print("\n[2] Checking API health status...")
    try:
        response = requests.get("http://localhost:8000/api/health", timeout=3)
        if response.status_code == 200:
            print("   [OK] Backend API is running")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"   [ERROR] API returned error status: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("   [ERROR] Cannot connect to backend API (connection refused)")
        return False
    except requests.exceptions.Timeout:
        print("   [ERROR] Connection timeout")
        return False
    except Exception as e:
        print(f"   [ERROR] Request failed: {e}")
        return False

def print_solution():
    """打印解决方案"""
    print()
    print("=" * 60)
    print("[SOLUTION]")
    print("=" * 60)
    print()
    print("The frontend black screen is caused by the backend API not running.")
    print("Please follow these steps:")
    print()
    print("Method 1: Start the complete Web interface (Recommended)")
    print("-" * 60)
    print("  Run in project root directory:")
    print("  python start_web_v2.py")
    print()
    print("  Then visit in browser: http://localhost:8000")
    print()
    print()
    print("Method 2: Start frontend and backend separately (Development mode)")
    print("-" * 60)
    print("  Terminal 1 - Start backend:")
    print("  cd web_v2/server")
    print("  python main.py")
    print()
    print("  Terminal 2 - Start frontend:")
    print("  cd web_v2/frontend")
    print("  npm run dev")
    print()
    print("  Then visit in browser: http://localhost:5173")
    print()
    print("=" * 60)

def main():
    backend_ok = check_backend()

    if not backend_ok:
        print_solution()
        return 1

    print()
    print("[OK] System is running! If frontend still shows black screen:")
    print("   1. Open browser developer tools (F12)")
    print("   2. Check Console tab for errors")
    print("   3. Check Network tab for API request status")
    return 0

if __name__ == "__main__":
    sys.exit(main())
