"""
诊断动量指标不足问题
"""

import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Import TqSDK client
from src.data_fetcher.tqsdk_client import TqSdkClient

def diagnose_indicators():
    """诊断回测中的指标问题"""

    print("=== 诊断动量指标不足问题 ===\n")

    # 1. 测试TqSDK指标计算
    try:
        from tqsdk import TqApi, TqBacktest, TqAuth
        from tqsdk.ta import MA, RSI, ATR, MACD

        # 读取配置
        import yaml
        config_path = ROOT / "config" / "api_keys.yaml"
        if config_path.exists():
            config = yaml.safe_load(config_path.read_text(encoding='utf-8'))
            tqsdk_config = config.get('tqsdk', {})
            username = tqsdk_config.get('username')
            password = tqsdk_config.get('password')
        else:
            username = None
            password = None

        # 创建回测API
        start_dt = datetime(2024, 10, 1, 9, 0, 0)
        end_dt = datetime(2024, 10, 5, 15, 0, 0)

        if username and password:
            auth = TqAuth(username, password)
            api = TqApi(auth=auth, backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))
        else:
            api = TqApi(backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))

        # 获取K线数据
        symbol = "KQ.m@CZCE.SA"
        duration_seconds = 15 * 60  # 15分钟
        data_length = 1200

        print(f"获取K线数据: {symbol}, 周期={duration_seconds}秒, 长度={data_length}")
        klines = api.get_kline_serial(symbol, duration_seconds=duration_seconds, data_length=data_length)
        api.wait_update()

        print(f"K线数据获取成功: {len(klines)} 条记录\n")

        # 计算指标
        print("计算技术指标...")
        ma10 = MA(klines, 10)
        ma30 = MA(klines, 30)
        rsi_series = RSI(klines, 14)
        atr_series = ATR(klines, 14)
        macd_series = MACD(klines, 12, 26, 9)

        # 添加到klines
        klines["ma10"] = ma10["ma"]
        klines["ma30"] = ma30["ma"]
        klines["rsi"] = rsi_series["rsi"]
        klines["atr"] = atr_series["atr"]
        klines["macd"] = macd_series["diff"]
        klines["macd_dea"] = macd_series["dea"]
        klines["macd_bar"] = macd_series["bar"]

        print("指标计算完成\n")

        # 2. 检查指标有效性
        print("=== 指标有效性检查 ===")

        indicator_columns = ['ma10', 'ma30', 'rsi', 'atr', 'macd', 'macd_bar']
        total_rows = len(klines)

        for col in indicator_columns:
            if col in klines.columns:
                valid_count = (~klines[col].isna()).sum()
                valid_pct = (valid_count / total_rows) * 100

                # 显示最后几个值
                last_5_values = klines[col].iloc[-5:].values

                print(f"✓ {col:12s}: {valid_count:4d}/{total_rows} 有效 ({valid_pct:5.1f}%)")
                print(f"  最后5个值: {last_5_values}")

                # 检查是否全是NaN
                if valid_count == 0:
                    print(f"  ⚠️  警告: {col} 全部为NaN!")
                elif valid_pct < 50:
                    print(f"  ⚠️  警告: {col} 有效数据不足50%")
            else:
                print(f"✗ {col:12s}: 列不存在")

        print()

        # 3. 模拟market_representation的逻辑
        print("=== 模拟动量描述逻辑 ===")

        # 取最后一行
        last_row = klines.iloc[-1]

        parts = []

        # 检查RSI
        if 'rsi' in klines.columns:
            try:
                rsi = float(klines.iloc[-1]['rsi'])
                print(f"RSI值: {rsi}")

                if not np.isnan(rsi):
                    if rsi > 70:
                        parts.append(f"RSI超买({rsi:.1f})")
                    elif rsi < 30:
                        parts.append(f"RSI超卖({rsi:.1f})")
                    else:
                        parts.append(f"RSI中性({rsi:.1f})")
                else:
                    print("  → RSI是NaN，跳过")
            except Exception as e:
                print(f"  → RSI处理失败: {e}")
        else:
            print("RSI列不存在")

        # 检查MACD
        if 'macd_bar' in klines.columns:
            try:
                macd_bar = float(klines.iloc[-1]['macd_bar'])
                print(f"MACD_bar值: {macd_bar}")

                if not np.isnan(macd_bar):
                    if macd_bar > 0:
                        parts.append("MACD多头")
                    else:
                        parts.append("MACD空头")
                else:
                    print("  → MACD_bar是NaN，跳过")
            except Exception as e:
                print(f"  → MACD处理失败: {e}")
        else:
            print("MACD_bar列不存在")

        # 生成结果
        result = ", ".join(parts) if parts else "动量指标不足"
        print(f"\n最终结果: {result}")

        if result == "动量指标不足":
            print("\n❌ 问题重现！parts列表为空")
            print(f"parts内容: {parts}")
        else:
            print("\n✅ 正常：生成了动量描述")

        api.close()

        # 4. 给出诊断结论
        print("\n=== 诊断结论 ===")

        if 'rsi' in klines.columns and 'macd_bar' in klines.columns:
            rsi_valid = (~klines['rsi'].isna()).sum()
            macd_valid = (~klines['macd_bar'].isna()).sum()

            if rsi_valid == 0 and macd_valid == 0:
                print("❌ 问题：RSI和MACD_bar全部为NaN")
                print("   可能原因：数据量不足以计算指标（需要至少14周期）")
            elif rsi_valid < total_rows * 0.5 or macd_valid < total_rows * 0.5:
                print("⚠️  问题：指标有效数据不足50%")
                print("   可能原因：数据窗口太短或数据质量问题")
            else:
                print("✅ 指标数据正常")
                print("   问题可能在于：")
                print("   1. row和df[-1]不同步（传入的row是新bar，df还是旧的）")
                print("   2. 指标未正确复制到传给LLM的DataFrame中")

    except ImportError as e:
        print(f"❌ 无法导入TqSDK: {e}")
        print("请确保已安装TqSDK: pip install tqsdk")
    except Exception as e:
        print(f"❌ 诊断过程出错: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    diagnose_indicators()
