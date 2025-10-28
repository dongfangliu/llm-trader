"""
系统状态检查脚本
快速检查交易系统和数据库状态
"""

import sys
from pathlib import Path
import sqlite3
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def check_database():
    """检查数据库状态"""
    db_path = project_root / "data" / "market_data.db"
    
    if not db_path.exists():
        print("❌ 数据库文件不存在:", db_path)
        return False
    
    print(f"✅ 数据库文件存在: {db_path}")
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # 检查各表的数据量
        tables = {
            'kline_minute': 'K线数据（分钟）',
            'kline_daily': 'K线数据（日线）',
            'trades': '交易记录',
            'signals': '策略信号',
            'decisions': '决策记录',
            'reviews': '复盘记录',
            'lessons': '经验教训'
        }
        
        print("\n📊 数据库表统计:")
        print("-" * 60)
        
        total_records = 0
        for table, desc in tables.items():
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                total_records += count
                
                status = "✅" if count > 0 else "⚠️"
                print(f"{status} {desc:20s} ({table:15s}): {count:6d} 条")
                
                # 如果有数据，显示最新记录时间
                if count > 0 and 'timestamp' in get_table_columns(cursor, table):
                    cursor.execute(f"SELECT MAX(timestamp) FROM {table}")
                    latest = cursor.fetchone()[0]
                    if latest:
                        print(f"   └─ 最新数据: {latest}")
                
            except Exception as e:
                print(f"❌ {desc:20s} ({table:15s}): 检查失败 - {e}")
        
        print("-" * 60)
        print(f"📈 总记录数: {total_records:,} 条")
        
        # 检查K线数据详情
        if total_records > 0:
            print("\n📈 K线数据详情:")
            cursor.execute("SELECT DISTINCT period FROM kline_minute ORDER BY period")
            periods = cursor.fetchall()
            if periods:
                for (period,) in periods:
                    cursor.execute(f"SELECT COUNT(*) FROM kline_minute WHERE period='{period}'")
                    count = cursor.fetchone()[0]
                    print(f"   • {period}分钟K线: {count} 条")
            
            # 检查交易记录
            cursor.execute("SELECT COUNT(*) FROM trades WHERE exit_time IS NULL")
            open_positions = cursor.fetchone()[0]
            if open_positions > 0:
                print(f"\n💼 当前持仓: {open_positions} 笔")
                cursor.execute("""
                    SELECT symbol, direction, volume, entry_price, entry_time 
                    FROM trades 
                    WHERE exit_time IS NULL
                """)
                for row in cursor.fetchall():
                    print(f"   • {row[0]} {row[1]} {row[2]}手 @ {row[3]} ({row[4]})")
            else:
                print("\n💼 当前持仓: 无")
            
            # 检查最近的信号
            cursor.execute("SELECT COUNT(*) FROM signals")
            signal_count = cursor.fetchone()[0]
            if signal_count > 0:
                print(f"\n📡 策略信号: {signal_count} 条")
                cursor.execute("""
                    SELECT timestamp, strategy, action, confidence 
                    FROM signals 
                    ORDER BY timestamp DESC 
                    LIMIT 3
                """)
                print("   最近3条信号:")
                for row in cursor.fetchall():
                    print(f"   • [{row[0]}] {row[1]}: {row[2]} (置信度: {row[3]:.1f}%)")
        
        conn.close()
        return total_records > 0
        
    except Exception as e:
        print(f"❌ 数据库检查失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def get_table_columns(cursor, table):
    """获取表的列名"""
    cursor.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cursor.fetchall()]

def check_processes():
    """检查进程状态（Windows）"""
    import subprocess
    
    print("\n🔍 进程状态:")
    print("-" * 60)
    
    try:
        # 检查main_v2进程
        result = subprocess.run(
            ['powershell', '-Command', 
             'Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*main_v2*" } | Select-Object Id, ProcessName'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0 and result.stdout.strip():
            print("✅ 交易系统 (main_v2.py) 正在运行")
            print(f"   {result.stdout.strip()}")
        else:
            print("⚠️  交易系统 (main_v2.py) 未运行")
            print("   提示: 运行 'python src/main_v2.py' 启动交易系统")
        
        # 检查Web界面进程
        result = subprocess.run(
            ['powershell', '-Command', 
             'Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*start_web_v2*" } | Select-Object Id, ProcessName'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0 and result.stdout.strip():
            print("✅ Web界面 (start_web_v2.py) 正在运行")
            print(f"   {result.stdout.strip()}")
            print("   访问: http://localhost:8000")
        else:
            print("⚠️  Web界面 (start_web_v2.py) 未运行")
            print("   提示: 运行 'python start_web_v2.py' 启动Web界面")
        
    except Exception as e:
        print(f"⚠️  无法检查进程状态: {e}")

def check_config():
    """检查配置"""
    print("\n⚙️  配置检查:")
    print("-" * 60)
    
    # 检查Web配置
    try:
        sys.path.insert(0, str(project_root / 'web_v2'))
        from server.utils.config import settings
        
        print(f"Web配置:")
        print(f"  • 数据模式: {'模拟数据' if settings.USE_MOCK_DATA else '真实数据（从数据库）'}")
        print(f"  • 服务端口: {settings.PORT}")
        print(f"  • 调试模式: {'开启' if settings.DEBUG else '关闭'}")
        
    except Exception as e:
        print(f"⚠️  无法读取Web配置: {e}")

def main():
    print("=" * 60)
    print("🔍 交易系统状态检查")
    print("=" * 60)
    print(f"检查时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # 检查数据库
    has_data = check_database()
    
    # 检查进程
    check_processes()
    
    # 检查配置
    check_config()
    
    # 总结
    print("\n" + "=" * 60)
    print("📝 总结:")
    print("=" * 60)
    
    if has_data:
        print("✅ 数据库中有数据，可以使用真实数据模式")
        print("   配置: web_v2/server/utils/config.py -> USE_MOCK_DATA = False")
    else:
        print("⚠️  数据库中无数据，建议：")
        print("   1. 启动交易系统: python src/main_v2.py")
        print("   2. 等待3-5分钟让系统收集数据")
        print("   3. 重新运行本脚本检查状态")
    
    print("\n💡 快速启动:")
    print("   方式1: .\\start_trading_with_web.ps1 (一键启动)")
    print("   方式2: 分别在两个窗口运行:")
    print("          python src/main_v2.py")
    print("          python start_web_v2.py")
    print()

if __name__ == "__main__":
    main()
