#!/usr/bin/env python
"""
LLM Decision Backtest - 简单示例

这个脚本展示如何使用llm_decision_backtest系统进行回测。
"""

import subprocess
import sys
from pathlib import Path

# 确保在项目根目录运行
ROOT = Path(__file__).resolve().parent

def example_basic():
    """示例1: 基本回测"""
    print("=== 示例1: 基本回测 ===")
    print("运行2个月的基本回测")
    
    cmd = [
        sys.executable,
        "src/backtest/llm_decision_backtest.py",
        "--start", "2024-09-01",
        "--end", "2024-10-31",
    ]
    
    print(f"命令: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT)


def example_multi_timeframe():
    """示例2: 多周期分析"""
    print("\n=== 示例2: 多周期分析 ===")
    print("日线主周期 + 4小时/1小时辅助周期")
    
    cmd = [
        sys.executable,
        "src/backtest/llm_decision_backtest.py",
        "--decision-period", "1440",
        "--auxiliary-periods", "60,240",
        "--start", "2024-09-01",
        "--end", "2024-09-30",
    ]
    
    print(f"命令: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT)


def example_latest():
    """示例3: 最新K线分析"""
    print("\n=== 示例3: 最新K线分析 ===")
    print("仅分析最新数据，不运行完整回测")
    
    cmd = [
        sys.executable,
        "src/backtest/llm_decision_backtest.py",
        "--latest",
        "--show_rationale",
    ]
    
    print(f"命令: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT)


def example_quant_only():
    """示例4: 纯量化模式"""
    print("\n=== 示例4: 纯量化模式 ===")
    print("使用量化策略（不调用LLM）")
    
    cmd = [
        sys.executable,
        "src/backtest/llm_decision_backtest.py",
        "--mode", "quant_only",
        "--start", "2024-09-01",
        "--end", "2024-09-30",
    ]
    
    print(f"命令: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT)


def main():
    """主函数 - 运行所有示例"""
    print("LLM Decision Backtest 示例")
    print("="*60)
    
    examples = {
        "1": ("基本回测", example_basic),
        "2": ("多周期分析", example_multi_timeframe),
        "3": ("最新K线分析", example_latest),
        "4": ("纯量化模式", example_quant_only),
    }
    
    print("\n可用示例:")
    for key, (name, _) in examples.items():
        print(f"  {key}. {name}")
    print("  0. 运行所有示例")
    print("  q. 退出")
    
    choice = input("\n请选择示例 (1-4, 0, q): ").strip()
    
    if choice == "q":
        print("退出")
        return
    
    if choice == "0":
        for name, func in examples.values():
            func()
    elif choice in examples:
        _, func = examples[choice]
        func()
    else:
        print("无效选择")


if __name__ == "__main__":
    main()
