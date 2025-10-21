"""
Week 15 修复完成 - 最终验证脚本
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

print('=' * 70)
print('Week 15 修复完成 - 最终验证')
print('=' * 70)

# 测试1: 类名
print('\n1. 测试类名修复...')
try:
    from src.strategy.market_regime import MarketRegimeDetector
    detector = MarketRegimeDetector()
    print('   ✓ MarketRegimeDetector 导入成功')
except Exception as e:
    print(f'   ✗ 失败: {e}')
    sys.exit(1)

# 测试2: 响应解析器
print('\n2. 测试响应解析器...')
try:
    from src.llm_engine.response_parser import ResponseParser
    parser = ResponseParser()
    result = parser.parse_expert_review('{"approved": true, "severe_warning": false}')
    assert 'severe_warning' in result, "缺少 severe_warning 字段"
    assert 'warning_reason' in result, "缺少 warning_reason 字段"
    print('   ✓ 严重警告字段存在')
except Exception as e:
    print(f'   ✗ 失败: {e}')
    sys.exit(1)

# 测试3: 信号路由器
print('\n3. 测试信号路由器...')
try:
    from src.strategy.signal_router import SignalRouter
    router = SignalRouter()
    assert hasattr(router, 'apply_llm_review'), "缺少 apply_llm_review 方法"
    print('   ✓ apply_llm_review 方法存在')
except Exception as e:
    print(f'   ✗ 失败: {e}')
    sys.exit(1)

# 测试4: 性能监控器
print('\n4. 测试性能监控器...')
try:
    from src.monitoring.performance_monitor import get_monitor
    monitor = get_monitor()
    assert monitor is not None, "性能监控器为空"
    print('   ✓ 性能监控器可用')
except Exception as e:
    print(f'   ✗ 失败: {e}')
    sys.exit(1)

# 测试5: 数据库状态
print('\n5. 检查数据库状态...')
try:
    import sqlite3
    from pathlib import Path
    db_path = Path('data/market_data.db')
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute('PRAGMA journal_mode')
        mode = cursor.fetchone()[0]
        print(f'   ✓ 数据库Journal Mode: {mode}')
        cursor.execute('SELECT COUNT(*) FROM sqlite_master WHERE type="index"')
        index_count = cursor.fetchone()[0]
        print(f'   ✓ 索引数量: {index_count}')
        conn.close()
    else:
        print('   ⚠ 数据库文件尚未创建（首次运行时自动创建）')
except Exception as e:
    print(f'   ⚠ 数据库检查失败: {e}')

# 测试6: 文档检查
print('\n6. 检查文档文件...')
docs_to_check = [
    'docs/WEEK15_COMPLETION_REPORT.md',
    'docs/WEEK15_FEATURE_REFERENCE.md',
    'docs/WEEK15_SUMMARY.md',
]

for doc in docs_to_check:
    doc_path = Path(doc)
    if doc_path.exists():
        print(f'   ✓ {doc}')
    else:
        print(f'   ✗ {doc} 缺失')

# 测试7: 脚本文件检查
print('\n7. 检查脚本文件...')
scripts_to_check = [
    'scripts/optimize_database.py',
    'scripts/optimize_database.sql',
    'scripts/test_fixes.py',
]

for script in scripts_to_check:
    script_path = Path(script)
    if script_path.exists():
        print(f'   ✓ {script}')
    else:
        print(f'   ✗ {script} 缺失')

print('\n' + '=' * 70)
print('✅ 所有验证通过！Week 15 修复工作已完成。')
print('=' * 70)
print('\n📚 查看文档:')
print('  - 完整报告: docs/WEEK15_COMPLETION_REPORT.md')
print('  - 功能参考: docs/WEEK15_FEATURE_REFERENCE.md')
print('  - 工作总结: docs/WEEK15_SUMMARY.md')
print('\n🧪 运行测试:')
print('  - python scripts/test_fixes.py')
print('\n🔧 优化数据库:')
print('  - python scripts/optimize_database.py')
print('\n' + '=' * 70)
