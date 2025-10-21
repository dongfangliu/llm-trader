"""
HTML回测报告生成器

生成美观、专业的HTML回测分析报告。

Author: AI Assistant
Date: 2025-10-21
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
import pandas as pd
import base64
from io import BytesIO

logger = logging.getLogger(__name__)


class ReportGenerator:
    """
    HTML回测报告生成器
    
    功能：
    1. 自动生成完整回测报告
    2. 包含图表、指标表格、交易记录
    3. 支持多策略对比
    """
    
    def __init__(self, template: str = 'default'):
        """
        初始化报告生成器
        
        Args:
            template: 模板名称
        """
        self.template = template
        logger.info("HTML报告生成器初始化完成")
    
    def generate(
        self,
        title: str,
        equity_curve: pd.DataFrame,
        trades: pd.DataFrame,
        metrics: Dict[str, float],
        config: Dict[str, Any] = None,
        charts: Dict[str, Any] = None,
        output_path: str = 'backtest_report.html'
    ):
        """
        生成完整的HTML报告
        
        Args:
            title: 报告标题
            equity_curve: 权益曲线数据
            trades: 交易记录
            metrics: 性能指标
            config: 回测配置
            charts: 图表对象字典
            output_path: 输出文件路径
        """
        logger.info(f"开始生成HTML报告: {title}")
        
        # 构建HTML内容
        html = self._build_html(
            title=title,
            equity_curve=equity_curve,
            trades=trades,
            metrics=metrics,
            config=config or {},
            charts=charts or {}
        )
        
        # 写入文件
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        
        logger.info(f"HTML报告已生成: {output_path}")
    
    def _build_html(
        self,
        title: str,
        equity_curve: pd.DataFrame,
        trades: pd.DataFrame,
        metrics: Dict[str, float],
        config: Dict[str, Any],
        charts: Dict[str, Any]
    ) -> str:
        """构建HTML内容"""
        
        # HTML模板
        html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        {self._get_css()}
    </style>
</head>
<body>
    <div class="container">
        <!-- 标题 -->
        <header>
            <h1>{title}</h1>
            <p class="subtitle">生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </header>
        
        <!-- 配置信息 -->
        {self._build_config_section(config)}
        
        <!-- 性能指标 -->
        {self._build_metrics_section(metrics)}
        
        <!-- 图表 -->
        {self._build_charts_section(charts)}
        
        <!-- 交易记录 -->
        {self._build_trades_section(trades)}
        
        <!-- 页脚 -->
        <footer>
            <p>Powered by 量化交易系统V4 | Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </footer>
    </div>
</body>
</html>
"""
        return html
    
    def _get_css(self) -> str:
        """获取CSS样式"""
        return """
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 1em;
            opacity: 0.9;
        }
        
        .section {
            padding: 30px 40px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .section:last-child {
            border-bottom: none;
        }
        
        .section-title {
            font-size: 1.8em;
            color: #333;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
            padding-left: 15px;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .metric-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            transition: transform 0.3s, box-shadow 0.3s;
        }
        
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .metric-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 8px;
        }
        
        .metric-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #333;
        }
        
        .metric-value.positive {
            color: #4caf50;
        }
        
        .metric-value.negative {
            color: #f44336;
        }
        
        .chart-container {
            margin: 20px 0;
            text-align: center;
        }
        
        .chart-container img {
            max-width: 100%;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        table th {
            background: #667eea;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        
        table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        table tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        table tr:hover {
            background: #e3f2fd;
        }
        
        .positive-pnl {
            color: #4caf50;
            font-weight: bold;
        }
        
        .negative-pnl {
            color: #f44336;
            font-weight: bold;
        }
        
        footer {
            background: #333;
            color: white;
            text-align: center;
            padding: 20px;
            font-size: 0.9em;
        }
        
        .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .config-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
        }
        
        .config-label {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 5px;
        }
        
        .config-value {
            font-size: 1.1em;
            font-weight: 600;
            color: #333;
        }
        """
    
    def _build_config_section(self, config: Dict[str, Any]) -> str:
        """构建配置信息部分"""
        if not config:
            return ""
        
        items = []
        for key, value in config.items():
            items.append(f"""
                <div class="config-item">
                    <div class="config-label">{key}</div>
                    <div class="config-value">{value}</div>
                </div>
            """)
        
        return f"""
        <div class="section">
            <h2 class="section-title">回测配置</h2>
            <div class="config-grid">
                {''.join(items)}
            </div>
        </div>
        """
    
    def _build_metrics_section(self, metrics: Dict[str, float]) -> str:
        """构建性能指标部分"""
        
        # 关键指标定义
        key_metrics = [
            ('总收益率', 'total_return', '%', True),
            ('年化收益率', 'annual_return', '%', True),
            ('夏普比率', 'sharpe_ratio', '', False),
            ('Sortino比率', 'sortino_ratio', '', False),
            ('最大回撤', 'max_drawdown', '%', False),
            ('胜率', 'win_rate', '%', False),
            ('盈亏比', 'profit_factor', '', False),
            ('交易次数', 'total_trades', '', False),
        ]
        
        cards = []
        for label, key, unit, is_return in key_metrics:
            value = metrics.get(key, 0)
            
            # 格式化数值
            if unit == '%':
                if abs(value) < 10:
                    formatted = f"{value*100:.2f}%"
                else:
                    formatted = f"{value:.2f}%"
            else:
                formatted = f"{value:.2f}" if isinstance(value, float) else str(int(value))
            
            # 判断正负
            css_class = ''
            if is_return and isinstance(value, (int, float)):
                css_class = 'positive' if value > 0 else 'negative'
            
            cards.append(f"""
                <div class="metric-card">
                    <div class="metric-label">{label}</div>
                    <div class="metric-value {css_class}">{formatted}</div>
                </div>
            """)
        
        return f"""
        <div class="section">
            <h2 class="section-title">性能指标</h2>
            <div class="metrics-grid">
                {''.join(cards)}
            </div>
        </div>
        """
    
    def _build_charts_section(self, charts: Dict[str, Any]) -> str:
        """构建图表部分"""
        if not charts or 'figure' not in charts:
            return ""
        
        try:
            # 将matplotlib图表转换为base64
            fig = charts['figure']
            buf = BytesIO()
            fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
            buf.seek(0)
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            buf.close()
            
            return f"""
            <div class="section">
                <h2 class="section-title">可视化分析</h2>
                <div class="chart-container">
                    <img src="data:image/png;base64,{img_base64}" alt="回测分析图表">
                </div>
            </div>
            """
        except Exception as e:
            logger.warning(f"图表嵌入失败: {e}")
            return ""
    
    def _build_trades_section(self, trades: pd.DataFrame) -> str:
        """构建交易记录部分"""
        if len(trades) == 0:
            return """
            <div class="section">
                <h2 class="section-title">交易记录</h2>
                <p>无交易记录</p>
            </div>
            """
        
        # 只显示前50条
        trades_display = trades.head(50)
        
        # 构建表格行
        rows = []
        for _, trade in trades_display.iterrows():
            pnl = trade.get('pnl', 0)
            pnl_class = 'positive-pnl' if pnl > 0 else 'negative-pnl'
            
            rows.append(f"""
                <tr>
                    <td>{trade.get('datetime', '-')}</td>
                    <td>{trade.get('symbol', '-')}</td>
                    <td>{trade.get('action', '-')}</td>
                    <td>{trade.get('price', 0):.2f}</td>
                    <td>{trade.get('volume', 0)}</td>
                    <td class="{pnl_class}">{pnl:.2f}</td>
                    <td>{trade.get('strategy', '-')}</td>
                </tr>
            """)
        
        return f"""
        <div class="section">
            <h2 class="section-title">交易记录 (前50条)</h2>
            <table>
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>合约</th>
                        <th>动作</th>
                        <th>价格</th>
                        <th>数量</th>
                        <th>盈亏</th>
                        <th>策略</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join(rows)}
                </tbody>
            </table>
            <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
                共 {len(trades)} 笔交易，显示前 50 条
            </p>
        </div>
        """


# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 模拟数据
    import numpy as np
    
    dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
    equity_curve = pd.DataFrame({
        'datetime': dates,
        'equity': 100000 + np.random.randn(len(dates)).cumsum() * 1000
    })
    
    trades = pd.DataFrame({
        'datetime': pd.date_range(start='2024-01-01', periods=30, freq='10D'),
        'symbol': 'CZCE.SA601',
        'action': ['open_long', 'close_long'] * 15,
        'price': np.random.uniform(1800, 2000, 30),
        'volume': [1] * 30,
        'pnl': np.random.randn(30) * 500,
        'strategy': 'TrendFollowing'
    })
    
    metrics = {
        'total_return': 0.15,
        'annual_return': 0.20,
        'sharpe_ratio': 1.5,
        'sortino_ratio': 2.0,
        'max_drawdown': 0.08,
        'win_rate': 0.65,
        'profit_factor': 2.3,
        'total_trades': 30
    }
    
    config = {
        '合约': 'CZCE.SA601',
        '开始日期': '2024-01-01',
        '结束日期': '2024-12-31',
        '初始资金': '100,000',
        '策略': 'TrendFollowing + MeanReversion',
    }
    
    # 生成报告
    generator = ReportGenerator()
    generator.generate(
        title='纯碱期货回测报告',
        equity_curve=equity_curve,
        trades=trades,
        metrics=metrics,
        config=config,
        output_path='backtest_report.html'
    )
    
    print("✓ HTML报告生成器测试完成")
    print("  报告文件: backtest_report.html")
