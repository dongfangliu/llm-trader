"""
数据处理器
负责计算技术指标和数据清洗
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional
from loguru import logger

try:
    import talib as ta
    HAS_TALIB = True
except ImportError:
    logger.warning("TA-Lib未安装，将使用简化版技术指标计算")
    HAS_TALIB = False


class DataProcessor:
    """数据处理和技术指标计算"""

    @staticmethod
    def calculate_ma(df: pd.DataFrame, periods: list = [5, 10, 20, 30, 60]) -> pd.DataFrame:
        """
        计算移动平均线

        Args:
            df: K线数据，需包含'close'列
            periods: MA周期列表

        Returns:
            添加了MA列的DataFrame
        """
        df = df.copy()

        for period in periods:
            col_name = f'ma{period}'
            if HAS_TALIB:
                df[col_name] = ta.SMA(df['close'].values, timeperiod=period)
            else:
                df[col_name] = df['close'].rolling(window=period).mean()

        return df

    @staticmethod
    def calculate_macd(df: pd.DataFrame,
                       fast: int = 12,
                       slow: int = 26,
                       signal: int = 9) -> pd.DataFrame:
        """
        计算MACD指标

        Args:
            df: K线数据
            fast: 快线周期
            slow: 慢线周期
            signal: 信号线周期

        Returns:
            添加了MACD列的DataFrame
        """
        df = df.copy()

        if HAS_TALIB:
            df['macd'], df['macd_signal'], df['macd_hist'] = ta.MACD(
                df['close'].values,
                fastperiod=fast,
                slowperiod=slow,
                signalperiod=signal
            )
        else:
            # 简化版MACD计算
            exp1 = df['close'].ewm(span=fast, adjust=False).mean()
            exp2 = df['close'].ewm(span=slow, adjust=False).mean()
            df['macd'] = exp1 - exp2
            df['macd_signal'] = df['macd'].ewm(span=signal, adjust=False).mean()
            df['macd_hist'] = df['macd'] - df['macd_signal']

        return df

    @staticmethod
    def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
        """
        计算RSI指标

        Args:
            df: K线数据
            period: RSI周期

        Returns:
            添加了RSI列的DataFrame
        """
        df = df.copy()

        if HAS_TALIB:
            df['rsi'] = ta.RSI(df['close'].values, timeperiod=period)
        else:
            # 简化版RSI计算
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss
            df['rsi'] = 100 - (100 / (1 + rs))

        return df

    @staticmethod
    def calculate_bollinger_bands(df: pd.DataFrame,
                                   period: int = 20,
                                   std_dev: float = 2.0) -> pd.DataFrame:
        """
        计算布林带

        Args:
            df: K线数据
            period: 周期
            std_dev: 标准差倍数

        Returns:
            添加了布林带列的DataFrame
        """
        df = df.copy()

        if HAS_TALIB:
            df['bb_upper'], df['bb_middle'], df['bb_lower'] = ta.BBANDS(
                df['close'].values,
                timeperiod=period,
                nbdevup=std_dev,
                nbdevdn=std_dev
            )
        else:
            # 简化版布林带计算
            df['bb_middle'] = df['close'].rolling(window=period).mean()
            std = df['close'].rolling(window=period).std()
            df['bb_upper'] = df['bb_middle'] + (std * std_dev)
            df['bb_lower'] = df['bb_middle'] - (std * std_dev)

        return df

    @staticmethod
    def calculate_volume_ratio(df: pd.DataFrame, period: int = 5) -> pd.DataFrame:
        """
        计算成交量比率

        Args:
            df: K线数据
            period: 均量周期

        Returns:
            添加了量比列的DataFrame
        """
        df = df.copy()

        df['volume_ma'] = df['volume'].rolling(window=period).mean()
        df['volume_ratio'] = (df['volume'] / df['volume_ma'] * 100).round(2)

        return df

    @staticmethod
    def calculate_volatility(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
        """
        计算波动率

        Args:
            df: K线数据
            period: 计算周期

        Returns:
            添加了波动率列的DataFrame
        """
        df = df.copy()

        # 计算收益率
        df['returns'] = df['close'].pct_change()

        # 计算滚动标准差
        df['volatility'] = df['returns'].rolling(window=period).std() * np.sqrt(period)

        return df

    @staticmethod
    def calculate_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """
        计算所有技术指标

        Args:
            df: 原始K线数据

        Returns:
            包含所有指标的DataFrame
        """
        if df is None or df.empty:
            logger.warning("输入数据为空，无法计算指标")
            return df

        df = df.copy()

        # 计算各类指标
        df = DataProcessor.calculate_ma(df)
        df = DataProcessor.calculate_macd(df)
        df = DataProcessor.calculate_rsi(df)

        # ATR(14) 对齐 TqSDK 文档
        if HAS_TALIB:
            df['atr'] = ta.ATR(df['high'].values, df['low'].values, df['close'].values, timeperiod=14)
        else:
            high_low = df['high'] - df['low']
            high_close = (df['high'] - df['close'].shift()).abs()
            low_close = (df['low'] - df['close'].shift()).abs()
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            df['atr'] = tr.rolling(window=14).mean()

        df = DataProcessor.calculate_bollinger_bands(df)
        df = DataProcessor.calculate_volume_ratio(df)
        df = DataProcessor.calculate_volatility(df)

        # 删除NaN值（前期指标不足）
        df = df.dropna().reset_index(drop=True)

        logger.info(f"技术指标计算完成，有效数据{len(df)}条")
        return df

    @staticmethod
    def get_market_summary(df: pd.DataFrame) -> Dict:
        """
        获取市场摘要信息

        Args:
            df: 包含技术指标的K线数据

        Returns:
            dict: 市场关键信息
        """
        if df is None or df.empty:
            return {}

        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest

        summary = {
            # 价格信息
            'current_price': float(latest['close']),
            'price_change': float(latest['close'] - prev['close']),
            'price_change_pct': float((latest['close'] - prev['close']) / prev['close'] * 100),

            # 技术指标
            'ma5': float(latest.get('ma5', 0)),
            'ma10': float(latest.get('ma10', 0)),
            'ma20': float(latest.get('ma20', 0)),
            'macd': float(latest.get('macd', 0)),
            'macd_signal': float(latest.get('macd_signal', 0)),
            'rsi': float(latest.get('rsi', 0)),
            'bb_upper': float(latest.get('bb_upper', 0)),
            'bb_middle': float(latest.get('bb_middle', 0)),
            'bb_lower': float(latest.get('bb_lower', 0)),

            # 成交量
            'volume': int(latest['volume']),
            'volume_ratio': float(latest.get('volume_ratio', 0)),

            # 波动率
            'volatility': float(latest.get('volatility', 0)),

            # 趋势判断辅助
            'price_above_ma5': latest['close'] > latest.get('ma5', 0),
            'price_above_ma20': latest['close'] > latest.get('ma20', 0),
            'macd_bullish': latest.get('macd', 0) > latest.get('macd_signal', 0),

            # 支撑阻力
            'resistance': float(df['high'].tail(20).max()),
            'support': float(df['low'].tail(20).min()),
        }

        return summary

    @staticmethod
    def format_klines_for_llm(df: pd.DataFrame, count: int = 10) -> str:
        """
        将K线数据格式化为LLM易读的文本

        Args:
            df: K线数据
            count: 显示最近N根K线

        Returns:
            str: 格式化的文本
        """
        if df is None or df.empty:
            return "无K线数据"

        df_tail = df.tail(count)

        lines = ["时间 | 开盘 | 最高 | 最低 | 收盘 | 成交量 | MA5 | MACD | RSI"]
        lines.append("-" * 80)

        for _, row in df_tail.iterrows():
            time_str = row['timestamp'].strftime('%m-%d %H:%M')
            line = (
                f"{time_str} | "
                f"{row['open']:.0f} | "
                f"{row['high']:.0f} | "
                f"{row['low']:.0f} | "
                f"{row['close']:.0f} | "
                f"{row['volume']:.0f} | "
                f"{row.get('ma5', 0):.0f} | "
                f"{row.get('macd', 0):.2f} | "
                f"{row.get('rsi', 0):.1f}"
            )
            lines.append(line)

        return "\n".join(lines)


if __name__ == "__main__":
    # 测试代码
    print("DataProcessor测试")
    print("请使用 TqSDK 或其他数据源进行测试")
    print("示例:")
    print("  from data_source_factory import DataSourceFactory")
    print("  # 配置数据源后使用")
