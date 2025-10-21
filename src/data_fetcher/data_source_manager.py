"""
数据源管理 - 完全基于 TqSDK
此模块已简化为仅支持 TqSDK 数据源
"""

import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, Dict
from loguru import logger


class DataSourceManager:
    """数据源管理器 - 基于 TqSDK 的简化版本"""

    def __init__(self, tqsdk_client=None):
        """
        初始化数据源管理器

        Args:
            tqsdk_client: TqSdkClient 实例（可选）
        """
        self.tqsdk_client = tqsdk_client
        logger.info("数据源管理器初始化（TqSDK模式）")

    def set_tqsdk_client(self, client):
        """设置 TqSDK 客户端"""
        self.tqsdk_client = client
        logger.info("已设置 TqSDK 客户端")

    def get_current_source(self):
        """获取当前数据源（返回 TqSDK 客户端）"""
        return self.tqsdk_client

    def get_kline(
        self,
        start_date: str,
        end_date: str,
        period: str = "15"
    ) -> Optional[pd.DataFrame]:
        """
        获取K线数据（通过 TqSDK）

        Args:
            start_date: 开始日期 'YYYY-MM-DD'
            end_date: 结束日期 'YYYY-MM-DD'
            period: K线周期 '1', '5', '15', '30', '60'

        Returns:
            DataFrame: 包含timestamp, open, high, low, close, volume
        """
        if not self.tqsdk_client:
            logger.error("TqSDK 客户端未设置")
            return None

        try:
            # 计算需要多少根K线
            start = pd.to_datetime(start_date)
            end = pd.to_datetime(end_date)
            days = (end - start).days + 1

            # 估算K线数量（每天约4小时交易）
            bars_per_hour = 60 // int(period)
            estimated_bars = days * 4 * bars_per_hour

            # 获取K线数据
            df = self.tqsdk_client.get_minute_kline(period=period, count=estimated_bars)

            if df is None or df.empty:
                return None

            # 过滤时间范围
            df = df[(df['timestamp'] >= start) & (df['timestamp'] <= end)]

            return df

        except Exception as e:
            logger.error(f"获取K线数据失败: {e}")
            return None

    def check_data_quality(
        self,
        start_date: str,
        end_date: str,
        period: str = "15"
    ) -> Dict:
        """
        检查数据质量

        Returns:
            Dict: 数据质量报告
        """
        try:
            df = self.get_kline(start_date, end_date, period)

            if df is None or df.empty:
                return {
                    'success': False,
                    'error': '无法获取数据或数据为空'
                }

            # 分析数据
            total_rows = len(df)

            # 缺失值分析
            missing_values = {col: int(count) for col, count in df.isnull().sum().items()}

            date_range = (df['timestamp'].min(), df['timestamp'].max())

            # 检查时间连续性
            df = df.sort_values('timestamp').reset_index(drop=True)
            time_gaps = df['timestamp'].diff()
            expected_gap = pd.Timedelta(minutes=int(period))

            # 找出异常间隔
            abnormal_gaps_mask = (
                time_gaps.notna() &
                (time_gaps > expected_gap * 1.5) &
                (time_gaps < pd.Timedelta(hours=4))
            )
            abnormal_gaps_indices = df.index[abnormal_gaps_mask].tolist()
            abnormal_gaps_count = len(abnormal_gaps_indices)

            # 转换异常间隔为可读格式
            abnormal_gaps_info = []
            for idx in abnormal_gaps_indices[:10]:
                if idx > 0 and idx < len(df):
                    try:
                        gap_minutes = (df.loc[idx, 'timestamp'] - df.loc[idx-1, 'timestamp']).total_seconds() / 60
                        abnormal_gaps_info.append({
                            'position': f"{df.loc[idx-1, 'timestamp'].strftime('%Y-%m-%d %H:%M')} -> {df.loc[idx, 'timestamp'].strftime('%Y-%m-%d %H:%M')}",
                            'gap_minutes': round(gap_minutes, 1)
                        })
                    except Exception as e:
                        logger.warning(f"处理异常间隔时出错: {e}")
                        continue

            # 检查异常值（价格）
            price_cols = ['open', 'high', 'low', 'close']
            anomalies = {}
            for col in price_cols:
                if col in df.columns and len(df[col].dropna()) > 0:
                    mean = df[col].mean()
                    std = df[col].std()
                    if std > 0:
                        anomalies[col] = int(len(df[abs(df[col] - mean) > 3 * std]))
                    else:
                        anomalies[col] = 0
                else:
                    anomalies[col] = 0

            # 计算完整性
            days = (date_range[1] - date_range[0]).days + 1
            bars_per_hour = 60 // int(period)
            expected_bars = days * 4 * bars_per_hour

            completeness = min(100, (total_rows / expected_bars * 100)) if expected_bars > 0 else 0

            return {
                'success': True,
                'total_rows': total_rows,
                'expected_rows': expected_bars,
                'date_range': {
                    'start': date_range[0].strftime('%Y-%m-%d %H:%M'),
                    'end': date_range[1].strftime('%Y-%m-%d %H:%M')
                },
                'missing_values': missing_values,
                'abnormal_gaps_count': abnormal_gaps_count,
                'abnormal_gaps': abnormal_gaps_info,
                'price_anomalies': anomalies,
                'completeness': round(completeness, 2)
            }

        except Exception as e:
            logger.error(f"数据质量检查失败: {e}")
            import traceback
            return {
                'success': False,
                'error': f'检查过程出错: {str(e)}',
                'traceback': traceback.format_exc()
            }


if __name__ == "__main__":
    print("DataSourceManager 已简化为仅支持 TqSDK")
    print("请通过 DataSourceFactory 创建 TqSDK 客户端后使用")
