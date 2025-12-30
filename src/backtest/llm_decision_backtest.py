from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
from loguru import logger
from tqsdk import tafunc

# Ensure project root on sys.path when run as a script
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Local imports
from src.backtest.models.decision import DecisionMode
from src.backtest.models.config import BTConfig
from src.backtest.core.backtester import Backtester


def main():
    """
    LLM决策回测工具

    使用示例:
    1. 回测模式（默认）:
       python src/backtest/llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31
    
    2. 最新K线分析模式:
       python src/backtest/llm_decision_backtest.py --latest --show_rationale
       
    3. 多周期分析:
       python src/backtest/llm_decision_backtest.py --latest --decision-period 1440 --auxiliary-periods 60,240
    """
    parser = argparse.ArgumentParser(description="LLM Direct Decision Backtest using TqSDK")
    parser.add_argument("--mode", choices=[m.value for m in DecisionMode], default=DecisionMode.LLM_DIRECT.value, help="Decision mode")
    parser.add_argument("--symbol", default="KQ.m@CZCE.SA", help="Trading symbol (default: KQ.m@CZCE.SA)")
    parser.add_argument("--decision-period", type=int, default=None, help="Primary decision period in MINUTES (if not set, uses --period)")
    parser.add_argument("--auxiliary-periods", type=str, default=None, help="Auxiliary periods for multi-timeframe analysis, comma-separated (e.g., '60,240,1440' for 1h/4h/daily)")
    parser.add_argument("--count", type=int, default=None, help="Number of K-lines to fetch (auto-calculated if not specified)")
    parser.add_argument("--cache", default=None, help="Cache file path (if not specified, no caching will be used)")
    parser.add_argument("--start", help="Backtest start datetime, e.g. 2024-09-01 09:00")
    parser.add_argument("--end", help="Backtest end datetime, e.g. 2024-10-31 15:00")
    parser.add_argument("--initial_units", type=float, default=2.0, help="Initial position units (default: 2.0 lots)")
    parser.add_argument("--margin_ratio", type=float, default=0.18, help="Margin ratio for futures (default: 0.18 = 18%%)")
    parser.add_argument("--show_rationale", action="store_true", help="Show detailed rationale for each decision (default: False)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging for LLM responses (default: False)")
    parser.add_argument("--web-gui", type=str, nargs='?', const=True, default=None, help="Enable TqSDK web GUI for visualization. Use --web-gui for default (True), or specify address like --web-gui=http://192.168.1.100:9876")
    parser.add_argument("--latest", action="store_true", help="Only analyze the latest K-line without running backtest (default: False)")
    args = parser.parse_args()

    # Configure logging level based on debug flag
    log_level = "DEBUG" if args.debug else "INFO"

    # Remove default handler and add custom handlers with proper level
    logger.remove()  # Remove default handler

    # Add console handler with appropriate level
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level=log_level
    )

    # Note: File handler will be added after cfg creation to use configured timezone

    try:
        logging.getLogger("tqsdk").setLevel(logging.WARNING)
    except Exception:
        pass

    cache_path = Path(args.cache) if args.cache else None

    # Parse auxiliary periods (comma-separated string to list of ints)
    auxiliary_periods = None
    if args.auxiliary_periods:
        try:
            auxiliary_periods = [int(p.strip()) for p in args.auxiliary_periods.split(',')]
            logger.info(f"配置辅助周期: {auxiliary_periods}")
        except ValueError as e:
            logger.error(f"解析辅助周期参数失败: {e}")
            auxiliary_periods = None

    # Load timezone from config file if available
    timezone = "Asia/Shanghai"  # Default to Beijing time
    try:
        import yaml
        params_path = ROOT / "config" / "trading_params.yaml"
        if params_path.exists():
            params_yaml = yaml.safe_load(params_path.read_text(encoding="utf-8")) or {}
            system_cfg = params_yaml.get("system", {}) or {}
            timezone = system_cfg.get("timezone", timezone)
            logger.info(f"从配置文件加载时区: {timezone}")
    except Exception as e:
        logger.warning(f"加载时区配置失败，使用默认值 {timezone}: {e}")

    cfg = BTConfig(
        symbol=args.symbol or "KQ.m@CZCE.SA",
        decision_period=args.decision_period,  # Will use period if None
        auxiliary_periods=auxiliary_periods,
        count=args.count,
        margin_ratio=args.margin_ratio,
        timezone=timezone
    )

    # Add file handler with configured timezone
    tz = cfg.get_timezone()
    now_local = datetime.now(tz)
    logger.add(
        str(Path("logs") / f"llm_backtest_{now_local.strftime('%Y%m%d_%H%M%S')}.log"),
        rotation="1 day",
        level=log_level
    )

    # 使用TqSDK回测
    mode = DecisionMode(args.mode)
    bt = Backtester(cfg, mode, cache_path=cache_path,initial_units=args.initial_units, show_rationale=args.show_rationale, margin_ratio=args.margin_ratio)
    # 回测区间：参考 TqSDK 教程，支持命令行指定开始/结束时间
    def _parse_dt(s, default):
        if not s:
            return default
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
            try:
                # Parse as naive datetime and localize to configured timezone
                dt_naive = datetime.strptime(s, fmt)
                return dt_naive.replace(tzinfo=tz)
            except Exception:
                continue
        return default
    # Default times with explicit timezone (Beijing time)
    default_start = datetime(2024, 9, 1, 9, 0, 0, tzinfo=tz)
    default_end = datetime(2024, 10, 31, 15, 0, 0, tzinfo=tz)
    start_dt = _parse_dt(args.start, default_start)
    end_dt = _parse_dt(args.end, default_end)

    # 读取TqSDK认证配置
    username = os.getenv("TQSDK_USERNAME")
    password = os.getenv("TQSDK_PASSWORD")
    use_sim = True
    try:
        import yaml
        cfg_path = ROOT / "config" / "api_keys.yaml"
        if cfg_path.exists():
            cfg_yaml = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            tcfg = cfg_yaml.get("tqsdk", {}) or {}
            username = tcfg.get("username") or username
            password = tcfg.get("password") or password
            use_sim = bool(tcfg.get("use_sim", True))
    except Exception:
        pass
    # Handle --latest mode: only analyze the latest K-line
    if args.latest:
        logger.info(f"使用最新K线分析模式：{args.symbol}")
        decision_result = bt.analyze_latest(username=username, password=password, use_sim=use_sim)
        
        print("\n=== 最新K线分析结果 ===")
        print(f"合约: {args.symbol}")
        print(f"时间: {decision_result.get('timestamp', 'N/A')}")
        print(f"当前价格: {decision_result.get('current_price', 'N/A')}")
        print(f"\n决策: {decision_result.get('decision', 'N/A')}")
        print(f"建议仓位: {decision_result.get('position_size', 'N/A')}")
        print(f"置信度: {decision_result.get('confidence', 'N/A')}")
        
        # 显示止损止盈点位
        if 'stop_loss' in decision_result and decision_result['stop_loss']:
            print(f"止损点位: {decision_result['stop_loss']}")
        if 'take_profit' in decision_result and decision_result['take_profit']:
            print(f"止盈点位: {decision_result['take_profit']}")
        
        # 显示研判理由（始终显示，不再依赖show_rationale参数）
        if 'rationale' in decision_result and decision_result['rationale']:
            print(f"\n=== AI研判详情 ===")
            print(decision_result['rationale'])
        return

    logger.info("已启用基于TqSDK的回测下单：请以TqSDK输出的'模拟交易账户'汇总为准（本脚本摘要仅供参考）")
    logger.info(f"使用TqSDK回测：{args.symbol},  bars≈{args.count}, 区间 {start_dt} ~ {end_dt}")

    # Process web_gui argument
    web_gui = None
    if hasattr(args, 'web_gui') and args.web_gui is not None:
        web_gui = args.web_gui if isinstance(args.web_gui, str) and args.web_gui != 'True' else True
        logger.info(f"启用 TqSDK Web GUI: {web_gui}")

    report = bt.run_tqsdk(start_dt=start_dt, end_dt=end_dt, username=username, password=password, use_sim=use_sim, web_gui=web_gui)

    print("=== Backtest Summary ===")
    print(f"Mode: {mode.value}")
    print(f"Initial: {report['initial']:.2f}")
    print(f"Final:   {report['final']:.2f}")
    print(f"Return:  {report['return_pct']:.2f}%")
    print(f"Trades:  {len([t for t in report['trades'] if t['side']=='OPEN'])}")
    print(f"Wins/Losses: {report['wins']}/{report['losses']}")
    print("Note: 以 TqSDK '模拟交易账户' 汇总为准；本脚本摘要仅供快速参考。")


if __name__ == "__main__":
    main()
