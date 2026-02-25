"""Stock Backtest using AKShare data.

Lightweight backtester for A-shares, HK stocks, and US stocks.
Reuses existing decision engines (quant / hybrid / llm_direct) unchanged.
No TqSDK dependency for data or execution.

Usage examples:
  # A-share quant backtest (daily)
  python src/backtest/stock_backtest.py --symbol 600519 --market a --start 20240101 --end 20241231

  # HK stock, LLM mode, daily
  python src/backtest/stock_backtest.py --symbol 00700 --market hk --mode llm_direct --start 20240101 --end 20241231

  # US stock, 15-min bars
  python src/backtest/stock_backtest.py --symbol AAPL --market us --period 15 --start 20240901 --end 20241031

  # A-share with cache
  python src/backtest/stock_backtest.py --symbol 600519 --market a --cache llm_decision_cache.json
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from loguru import logger

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.data.akshare_fetcher import fetch_stock_data, PERIOD_DAILY
from src.backtest.models.decision import Decision, DecisionMode
from src.backtest.models.position import Position


# ---------------------------------------------------------------------------
# Commission defaults per market
# ---------------------------------------------------------------------------
COMMISSION_RATE = {
    "a":  0.0003,   # 0.03%（双边）
    "hk": 0.001,    # 0.1%（双边）
    "us": 0.0001,   # 约0.01%（双边，仅佣金，忽略SEC费）
}


# ---------------------------------------------------------------------------
# Simple stock backtester
# ---------------------------------------------------------------------------

class StockBacktester:
    """Bar-by-bar stock backtest driven by AKShare data and existing decision engines."""

    WARMUP_BARS = 60  # bars required before first decision

    def __init__(
        self,
        symbol: str,
        market: str,
        mode: DecisionMode,
        period: str = PERIOD_DAILY,
        initial_capital: float = 100_000.0,
        max_position: int = 100,        # shares / units
        cache_path: Optional[Path] = None,
        show_rationale: bool = False,
    ):
        self.symbol = symbol
        self.market = market.lower()
        self.mode = mode
        self.period = period
        self.initial_capital = initial_capital
        self.max_position = max_position
        self.cache_path = cache_path
        self.show_rationale = show_rationale
        self.commission_rate = COMMISSION_RATE.get(self.market, 0.001)

        self.engine = self._create_engine()

    # ------------------------------------------------------------------
    # Engine factory (mirrors Backtester._create_engine)
    # ------------------------------------------------------------------

    def _create_engine(self):
        cache: Dict[str, Any] = {}
        if self.cache_path and self.cache_path.exists():
            import json
            try:
                cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"加载缓存失败: {e}")

        trade_meta = {
            "initial_capital": self.initial_capital,
            "contract_multiplier": 1,  # stocks: multiplier = 1
            "commission_per_lot": self.commission_rate,
        }

        if self.mode == DecisionMode.QUANT_ONLY:
            from src.backtest.engines.quant_engine import SimpleQuantEngine
            return SimpleQuantEngine(max_pos=self.max_position)

        elif self.mode == DecisionMode.HYBRID:
            from src.backtest.engines.hybrid_engine import HybridEngine
            return HybridEngine(
                cache=cache, cache_write=self.cache_path,
                max_pos=self.max_position, trade_meta=trade_meta
            )

        else:  # llm_direct
            from src.backtest.engines.llm_engine import LLMDirectEngine
            engine = LLMDirectEngine(
                cache=cache, cache_write=self.cache_path,
                max_pos=self.max_position, trade_meta=trade_meta
            )
            engine.show_rationale = self.show_rationale
            return engine

    # ------------------------------------------------------------------
    # Main run loop
    # ------------------------------------------------------------------

    def run(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        adjust: str = "qfq",
    ) -> Dict[str, Any]:
        """Fetch data, iterate bars, collect trades, return summary report."""

        df = fetch_stock_data(
            symbol=self.symbol,
            market=self.market,
            start_date=start_date,
            end_date=end_date,
            period=self.period,
            adjust=adjust,
        )

        # Filter to requested date range (df may contain extra warmup bars from AKShare)
        # We still need the warmup bars for indicator validity, so we track by index.
        cash = self.initial_capital
        position = 0       # shares held (positive = long, negative = short)
        entry_price = 0.0
        trades: List[Dict[str, Any]] = []
        pos_obj: Optional[Position] = None  # None = flat, used by LLM engine

        for i in range(self.WARMUP_BARS, len(df)):
            row = df.iloc[i]
            ctx = df.iloc[: i + 1]  # history up to and including current bar

            close = float(row["close"])
            bar_dt = pd.Timestamp(row["datetime"])  # human-readable

            # Inject state into LLM engine (same pattern as Backtester)
            if hasattr(self.engine, "current_pos"):
                self.engine.current_pos = pos_obj
            if hasattr(self.engine, "current_balance"):
                self.engine.current_balance = cash

            decision: Decision = self.engine.decide(row, ctx)

            if self.show_rationale and decision.rationale:
                logger.info(f"[{bar_dt}] {decision.action} | conf={decision.confidence:.0f} | {decision.rationale}")

            # ---- Execute decision ----------------------------------------
            target = decision.position_size  # desired position in shares

            if decision.action in ("open_long", "close_short") and position <= 0:
                # Buy to establish / cover short
                qty = target - position  # shares to buy
                if qty > 0:
                    cost = close * qty * (1 + self.commission_rate)
                    if cash >= cost:
                        cash -= cost
                        position += qty
                        entry_price = close
                        pos_obj = Position(direction="long", qty=qty, entry_price=close, stop=0.0, take=0.0)
                        trades.append({
                            "time": str(bar_dt), "side": "BUY",
                            "price": close, "qty": qty, "cash_after": cash
                        })

            elif decision.action in ("open_short", "close_long") and position >= 0:
                # Sell to close long or open short
                if position > 0:
                    # Close long
                    proceeds = close * position * (1 - self.commission_rate)
                    cash += proceeds
                    trades.append({
                        "time": str(bar_dt), "side": "SELL",
                        "price": close, "qty": position, "cash_after": cash
                    })
                    position = 0
                    entry_price = 0.0
                    pos_obj = None

                # Open short (only if short selling supported — skip for A-shares T+1 simplification)
                if self.market != "a" and target < 0:
                    qty = abs(target)
                    proceeds = close * qty * (1 - self.commission_rate)
                    cash += proceeds
                    position = -qty
                    entry_price = close
                    pos_obj = Position(direction="short", qty=qty, entry_price=close, stop=0.0, take=0.0)
                    trades.append({
                        "time": str(bar_dt), "side": "SHORT",
                        "price": close, "qty": qty, "cash_after": cash
                    })

            elif decision.action == "hold":
                pass  # do nothing

        # Close any open position at last bar
        last_close = float(df.iloc[-1]["close"])
        if position > 0:
            cash += last_close * position * (1 - self.commission_rate)
            trades.append({"time": "END", "side": "SELL", "price": last_close, "qty": position, "cash_after": cash})
            position = 0
        elif position < 0:
            cash -= last_close * abs(position) * (1 + self.commission_rate)
            trades.append({"time": "END", "side": "COVER", "price": last_close, "qty": abs(position), "cash_after": cash})
            position = 0

        total_return = (cash - self.initial_capital) / self.initial_capital * 100
        buy_trades  = [t for t in trades if t["side"] in ("BUY", "SHORT")]
        sell_trades = [t for t in trades if t["side"] in ("SELL", "COVER")]

        # Win/loss: pair buys with sells
        wins = losses = 0
        for b, s in zip(buy_trades, sell_trades):
            if s["side"] == "SELL":
                pnl = (s["price"] - b["price"]) * b["qty"]
            else:
                pnl = (b["price"] - s["price"]) * b["qty"]
            if pnl > 0:
                wins += 1
            else:
                losses += 1

        return {
            "symbol": self.symbol,
            "market": self.market,
            "mode": self.mode.value,
            "initial": self.initial_capital,
            "final": cash,
            "return_pct": total_return,
            "trades": trades,
            "wins": wins,
            "losses": losses,
        }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Stock Backtest via AKShare")
    parser.add_argument("--symbol",  required=True, help="股票代码 (e.g. 600519 / 00700 / AAPL)")
    parser.add_argument("--market",  default="a", choices=["a", "hk", "us"], help="市场 a/hk/us (default: a)")
    parser.add_argument("--mode",    default=DecisionMode.QUANT_ONLY.value,
                        choices=[m.value for m in DecisionMode], help="决策模式")
    parser.add_argument("--period",  default=PERIOD_DAILY,
                        help="K线周期: daily 或分钟数 1/5/15/30/60 (default: daily)")
    parser.add_argument("--start",   default=None, help="开始日期 YYYYMMDD 或 YYYY-MM-DD")
    parser.add_argument("--end",     default=None, help="结束日期 YYYYMMDD 或 YYYY-MM-DD")
    parser.add_argument("--adjust",  default="qfq", choices=["qfq", "hfq", ""],
                        help="复权方式 qfq/hfq/不复权 (default: qfq)")
    parser.add_argument("--capital", type=float, default=100_000.0, help="初始资金 (default: 100000)")
    parser.add_argument("--max-position", type=int, default=100, help="最大持仓股数 (default: 100)")
    parser.add_argument("--cache",   default=None, help="LLM决策缓存文件路径")
    parser.add_argument("--show-rationale", action="store_true", help="显示每根K线的决策理由")
    parser.add_argument("--debug",   action="store_true", help="开启DEBUG日志")
    args = parser.parse_args()

    log_level = "DEBUG" if args.debug else "INFO"
    logger.remove()
    logger.add(sys.stderr, level=log_level,
               format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | <level>{message}</level>")

    Path("logs").mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    logger.add(f"logs/stock_backtest_{ts}.log", level=log_level)

    cache_path = Path(args.cache) if args.cache else None

    bt = StockBacktester(
        symbol=args.symbol,
        market=args.market,
        mode=DecisionMode(args.mode),
        period=args.period,
        initial_capital=args.capital,
        max_position=args.max_position,
        cache_path=cache_path,
        show_rationale=args.show_rationale,
    )

    report = bt.run(start_date=args.start, end_date=args.end, adjust=args.adjust)

    print("\n=== Stock Backtest Summary ===")
    print(f"标的:   {report['symbol']} ({report['market'].upper()})")
    print(f"模式:   {report['mode']}")
    print(f"初始:   {report['initial']:,.2f}")
    print(f"最终:   {report['final']:,.2f}")
    print(f"收益率: {report['return_pct']:+.2f}%")
    print(f"交易次数: {len([t for t in report['trades'] if t['side'] in ('BUY','SHORT')])}")
    print(f"盈/亏:  {report['wins']}/{report['losses']}")


if __name__ == "__main__":
    main()
