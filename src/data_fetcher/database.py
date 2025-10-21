"""
数据库管理模块
使用SQLite存储行情数据和交易记录
"""

import sqlite3
import pandas as pd
import json
from datetime import datetime
from typing import Optional, List, Dict
from loguru import logger
from pathlib import Path


class Database:
    """SQLite数据库管理"""

    def __init__(self, db_path: str = "data/market_data.db"):
        """
        初始化数据库连接

        Args:
            db_path: 数据库文件路径
        """
        # 确保data目录存在
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()
        logger.info(f"数据库初始化完成: {db_path}")

    def _create_tables(self):
        """创建所需的数据表"""
        cursor = self.conn.cursor()

        # 分钟K线表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS kline_minute (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                period TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(timestamp, period)
            )
        ''')

        # 日K线表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS kline_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATE NOT NULL UNIQUE,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 实时行情表（保留最近的快照）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS realtime_quote (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                price REAL NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                volume INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 交易记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id TEXT NOT NULL UNIQUE,
                timestamp DATETIME NOT NULL,
                direction TEXT NOT NULL,  -- 'LONG' or 'SHORT'
                action TEXT NOT NULL,     -- 'OPEN' or 'CLOSE'
                price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                commission REAL NOT NULL,
                pnl REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 决策记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                decision_layer TEXT NOT NULL,  -- 'strategic' or 'tactical'
                market_data TEXT NOT NULL,     -- JSON格式
                llm_input TEXT NOT NULL,       -- 完整prompt
                llm_output TEXT NOT NULL,      -- LLM响应
                executed BOOLEAN NOT NULL,
                execution_price REAL,
                result_pnl REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 复盘记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL UNIQUE,
                total_trades INTEGER NOT NULL,
                win_rate REAL NOT NULL,
                total_pnl REAL NOT NULL,
                review_content TEXT NOT NULL,  -- JSON格式的复盘内容
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 经验教训表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                source_date DATE,
                status TEXT DEFAULT 'active',  -- active/inactive
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME
            )
        ''')

        self.conn.commit()
        logger.info("数据表创建/检查完成")

    def save_kline_minute(self, df: pd.DataFrame, period: str = "15"):
        """
        保存分钟K线数据

        Args:
            df: K线DataFrame
            period: K线周期
        """
        try:
            df = df.copy()
            df['period'] = period

            # 使用INSERT OR REPLACE避免重复
            df.to_sql('kline_minute', self.conn, if_exists='append', index=False)

            logger.debug(f"保存{len(df)}条{period}分钟K线数据")
        except sqlite3.IntegrityError:
            # 忽略重复数据错误
            pass
        except Exception as e:
            logger.error(f"保存分钟K线失败: {e}")

    def save_kline_daily(self, df: pd.DataFrame):
        """保存日K线数据"""
        try:
            df.to_sql('kline_daily', self.conn, if_exists='append', index=False)
            logger.debug(f"保存{len(df)}条日K线数据")
        except sqlite3.IntegrityError:
            pass
        except Exception as e:
            logger.error(f"保存日K线失败: {e}")

    def save_realtime_quote(self, quote: Dict):
        """保存实时行情快照"""
        try:
            # 处理时间戳格式
            timestamp = quote['timestamp']
            if hasattr(timestamp, 'strftime'):
                timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
            else:
                timestamp_str = str(timestamp)
            
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT INTO realtime_quote (timestamp, price, open, high, low, volume)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                timestamp_str,
                quote['price'],
                quote.get('open'),
                quote.get('high'),
                quote.get('low'),
                quote.get('volume')
            ))
            self.conn.commit()
        except Exception as e:
            logger.error(f"保存实时行情失败: {e}")

    def get_latest_kline(self, period: str = "15", count: int = 100) -> Optional[pd.DataFrame]:
        """
        获取最新的K线数据

        Args:
            period: K线周期
            count: 获取数量

        Returns:
            DataFrame
        """
        try:
            query = f'''
                SELECT timestamp, open, high, low, close, volume
                FROM kline_minute
                WHERE period = ?
                ORDER BY timestamp DESC
                LIMIT ?
            '''
            df = pd.read_sql(query, self.conn, params=(period, count))

            if not df.empty:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                df = df.sort_values('timestamp').reset_index(drop=True)

            return df

        except Exception as e:
            logger.error(f"获取K线数据失败: {e}")
            return None

    def save_trade(self, trade: Dict):
        """
        保存交易记录

        Args:
            trade: {
                'trade_id': 'xxx',
                'timestamp': datetime,
                'direction': 'LONG'/'SHORT',
                'action': 'OPEN'/'CLOSE',
                'price': 1850.0,
                'quantity': 1,
                'commission': 10.0,
                'pnl': 50.0
            }
        """
        try:
            # 处理时间戳格式
            timestamp = trade['timestamp']
            if hasattr(timestamp, 'strftime'):
                timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
            else:
                timestamp_str = str(timestamp)
            
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT INTO trades (trade_id, timestamp, direction, action, price, quantity, commission, pnl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                trade['trade_id'],
                timestamp_str,
                trade['direction'],
                trade['action'],
                trade['price'],
                trade['quantity'],
                trade['commission'],
                trade.get('pnl', 0)
            ))
            self.conn.commit()
            logger.info(f"保存交易记录: {trade['trade_id']}")

        except Exception as e:
            logger.error(f"保存交易记录失败: {e}")

    def save_decision(self, decision: Dict):
        """
        保存决策记录

        Args:
            decision: {
                'timestamp': datetime,
                'decision_layer': 'strategic'/'tactical',
                'market_data': json_string,
                'llm_input': prompt_string,
                'llm_output': response_string,
                'executed': True/False,
                'execution_price': 1850.0,
                'result_pnl': 50.0
            }
        """
        try:
            # 处理时间戳格式
            timestamp = decision['timestamp']
            if hasattr(timestamp, 'strftime'):
                timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
            else:
                timestamp_str = str(timestamp)
            
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT INTO decisions (timestamp, decision_layer, market_data, llm_input, llm_output,
                                      executed, execution_price, result_pnl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                timestamp_str,
                decision['decision_layer'],
                decision['market_data'],
                decision['llm_input'],
                decision['llm_output'],
                decision['executed'],
                decision.get('execution_price'),
                decision.get('result_pnl')
            ))
            self.conn.commit()

        except Exception as e:
            logger.error(f"保存决策记录失败: {e}")

    def get_today_trades(self) -> List[Dict]:
        """获取今日交易记录"""
        try:
            query = '''
                SELECT * FROM trades
                WHERE DATE(timestamp) = DATE('now')
                ORDER BY timestamp
            '''
            cursor = self.conn.cursor()
            cursor.execute(query)

            columns = [desc[0] for desc in cursor.description]
            trades = []

            for row in cursor.fetchall():
                trades.append(dict(zip(columns, row)))

            return trades

        except Exception as e:
            logger.error(f"获取今日交易失败: {e}")
            return []

    def get_today_decisions(self) -> List[Dict]:
        """获取今日决策记录"""
        try:
            query = '''
                SELECT * FROM decisions
                WHERE DATE(timestamp) = DATE('now')
                ORDER BY timestamp
            '''
            cursor = self.conn.cursor()
            cursor.execute(query)

            columns = [desc[0] for desc in cursor.description]
            decisions = []

            for row in cursor.fetchall():
                decisions.append(dict(zip(columns, row)))

            return decisions

        except Exception as e:
            logger.error(f"获取今日决策失败: {e}")
            return []

    def save_review(self, review: Dict):
        """
        保存复盘记录

        Args:
            review: {
                'date': date,
                'total_trades': 5,
                'win_rate': 60.0,
                'total_pnl': 250.0,
                'review_content': json_string
            }
        """
        try:
            # 处理日期格式
            review_date = review['date']
            if hasattr(review_date, 'strftime'):
                date_str = review_date.strftime('%Y-%m-%d')
            else:
                date_str = str(review_date)
            
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO reviews (date, total_trades, win_rate, total_pnl, review_content)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                date_str,
                review['total_trades'],
                review['win_rate'],
                review['total_pnl'],
                review['review_content']
            ))
            self.conn.commit()
            logger.info(f"保存复盘记录: {date_str}")

        except Exception as e:
            logger.error(f"保存复盘记录失败: {e}")

    def get_recent_reviews(self, days: int = 5) -> List[Dict]:
        """获取最近N天的复盘记录"""
        try:
            query = '''
                SELECT * FROM reviews
                ORDER BY date DESC
                LIMIT ?
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (days,))

            columns = [desc[0] for desc in cursor.description]
            reviews = []

            for row in cursor.fetchall():
                reviews.append(dict(zip(columns, row)))

            return reviews

        except Exception as e:
            logger.error(f"获取复盘记录失败: {e}")
            return []

    def save_lesson(self, lesson: Dict):
        """
        保存经验教训

        Args:
            lesson: {
                'content': "震荡市减少交易",
                'source_date': date,
                'status': 'active'
            }
        """
        try:
            # 处理日期格式
            source_date = lesson.get('source_date')
            if source_date:
                if hasattr(source_date, 'strftime'):
                    date_str = source_date.strftime('%Y-%m-%d')
                else:
                    date_str = str(source_date)
            else:
                date_str = None
            
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT INTO lessons (content, source_date, status)
                VALUES (?, ?, ?)
            ''', (
                lesson['content'],
                date_str,
                lesson.get('status', 'active')
            ))
            self.conn.commit()
            logger.debug(f"保存经验教训: {lesson['content'][:30]}...")

        except Exception as e:
            logger.error(f"保存经验教训失败: {e}")

    def get_active_lessons(self, limit: int = 5) -> List[Dict]:
        """获取活跃的经验教训"""
        try:
            query = '''
                SELECT id, content, source_date, created_at, last_used
                FROM lessons
                WHERE status = 'active'
                ORDER BY created_at DESC
                LIMIT ?
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (limit,))

            columns = [desc[0] for desc in cursor.description]
            lessons = []

            for row in cursor.fetchall():
                lessons.append(dict(zip(columns, row)))

            return lessons

        except Exception as e:
            logger.error(f"获取活跃经验教训失败: {e}")
            return []

    def get_all_lessons(self) -> List[Dict]:
        """获取所有经验教训（包括已禁用的）"""
        try:
            query = '''
                SELECT id, content, source_date, status, created_at, last_used
                FROM lessons
                ORDER BY created_at DESC
            '''
            cursor = self.conn.cursor()
            cursor.execute(query)

            columns = [desc[0] for desc in cursor.description]
            lessons = []

            for row in cursor.fetchall():
                lessons.append(dict(zip(columns, row)))

            return lessons

        except Exception as e:
            logger.error(f"获取所有经验教训失败: {e}")
            return []

    def update_lesson_status(self, lesson_id: int, status: str):
        """更新经验教训状态"""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                UPDATE lessons
                SET status = ?
                WHERE id = ?
            ''', (status, lesson_id))
            self.conn.commit()
            logger.info(f"更新经验教训 #{lesson_id} 状态为: {status}")

        except Exception as e:
            logger.error(f"更新经验教训状态失败: {e}")

    def update_lesson_last_used(self, lesson_ids: List[int]):
        """更新经验教训最后使用时间"""
        try:
            cursor = self.conn.cursor()
            for lesson_id in lesson_ids:
                cursor.execute('''
                    UPDATE lessons
                    SET last_used = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (lesson_id,))
            self.conn.commit()

        except Exception as e:
            logger.error(f"更新经验教训使用时间失败: {e}")

    def get_reviews_by_date_range(self, start_date: str, end_date: str) -> List[Dict]:
        """
        获取指定日期范围的复盘记录

        Args:
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)

        Returns:
            复盘记录列表
        """
        try:
            query = '''
                SELECT * FROM reviews
                WHERE date BETWEEN ? AND ?
                ORDER BY date DESC
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (start_date, end_date))

            columns = [desc[0] for desc in cursor.description]
            reviews = []

            for row in cursor.fetchall():
                reviews.append(dict(zip(columns, row)))

            return reviews

        except Exception as e:
            logger.error(f"获取日期范围复盘记录失败: {e}")
            return []

    def get_trade_statistics(self, days: int = 30) -> Dict:
        """
        获取交易统计数据

        Args:
            days: 最近天数

        Returns:
            统计数据字典
        """
        try:
            query = '''
                SELECT
                    COUNT(CASE WHEN action = 'CLOSE' THEN 1 END) as total_trades,
                    COUNT(CASE WHEN action = 'CLOSE' AND pnl > 0 THEN 1 END) as win_trades,
                    COUNT(CASE WHEN action = 'CLOSE' AND pnl < 0 THEN 1 END) as loss_trades,
                    SUM(CASE WHEN action = 'CLOSE' THEN pnl ELSE 0 END) as total_pnl,
                    AVG(CASE WHEN action = 'CLOSE' AND pnl > 0 THEN pnl END) as avg_win,
                    AVG(CASE WHEN action = 'CLOSE' AND pnl < 0 THEN pnl END) as avg_loss,
                    MAX(CASE WHEN action = 'CLOSE' THEN pnl END) as max_win,
                    MIN(CASE WHEN action = 'CLOSE' THEN pnl END) as max_loss
                FROM trades
                WHERE DATE(timestamp) >= DATE('now', '-' || ? || ' days')
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (days,))

            row = cursor.fetchone()
            columns = [desc[0] for desc in cursor.description]

            stats = dict(zip(columns, row))

            # 计算胜率
            total = stats['total_trades'] or 0
            wins = stats['win_trades'] or 0
            stats['win_rate'] = (wins / total * 100) if total > 0 else 0

            return stats

        except Exception as e:
            logger.error(f"获取交易统计失败: {e}")
            return {}

    def get_decision_statistics(self, days: int = 30) -> Dict:
        """
        获取决策统计数据

        Args:
            days: 最近天数

        Returns:
            决策统计字典
        """
        try:
            query = '''
                SELECT
                    decision_layer,
                    COUNT(*) as total_decisions,
                    COUNT(CASE WHEN executed = 1 THEN 1 END) as executed_decisions,
                    AVG(CASE WHEN result_pnl IS NOT NULL THEN result_pnl END) as avg_pnl
                FROM decisions
                WHERE DATE(timestamp) >= DATE('now', '-' || ? || ' days')
                GROUP BY decision_layer
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (days,))

            columns = [desc[0] for desc in cursor.description]
            stats = {}

            for row in cursor.fetchall():
                data = dict(zip(columns, row))
                stats[data['decision_layer']] = data

            return stats

        except Exception as e:
            logger.error(f"获取决策统计失败: {e}")
            return {}

    def get_lessons_by_category(self, status: str = 'active') -> Dict[str, List[Dict]]:
        """
        获取按类别分组的经验教训

        Args:
            status: 状态筛选 ('active', 'inactive', 'all')

        Returns:
            分类的经验教训字典
        """
        try:
            if status == 'all':
                query = '''
                    SELECT id, content, source_date, status, created_at, last_used
                    FROM lessons
                    ORDER BY created_at DESC
                '''
                cursor = self.conn.cursor()
                cursor.execute(query)
            else:
                query = '''
                    SELECT id, content, source_date, status, created_at, last_used
                    FROM lessons
                    WHERE status = ?
                    ORDER BY created_at DESC
                '''
                cursor = self.conn.cursor()
                cursor.execute(query, (status,))

            columns = [desc[0] for desc in cursor.description]
            lessons = []

            for row in cursor.fetchall():
                lessons.append(dict(zip(columns, row)))

            # 简单分类（基于关键词）
            categories = {
                '风险管理': [],
                '时机把握': [],
                '心态调整': [],
                '策略优化': [],
                '其他': []
            }

            for lesson in lessons:
                content = lesson['content']
                categorized = False

                if any(kw in content for kw in ['止损', '仓位', '风险', '回撤']):
                    categories['风险管理'].append(lesson)
                    categorized = True
                elif any(kw in content for kw in ['入场', '出场', '时机', '时间']):
                    categories['时机把握'].append(lesson)
                    categorized = True
                elif any(kw in content for kw in ['心态', '情绪', '冷静', '耐心']):
                    categories['心态调整'].append(lesson)
                    categorized = True
                elif any(kw in content for kw in ['策略', '系统', '规则', '优化']):
                    categories['策略优化'].append(lesson)
                    categorized = True

                if not categorized:
                    categories['其他'].append(lesson)

            return categories

        except Exception as e:
            logger.error(f"获取分类经验教训失败: {e}")
            return {}

    def get_review_summary(self, days: int = 30) -> Dict:
        """
        获取复盘汇总数据

        Args:
            days: 最近天数

        Returns:
            汇总数据字典
        """
        try:
            query = '''
                SELECT
                    COUNT(*) as total_reviews,
                    AVG(total_trades) as avg_trades_per_day,
                    AVG(win_rate) as avg_win_rate,
                    SUM(total_pnl) as total_pnl,
                    COUNT(CASE WHEN total_pnl > 0 THEN 1 END) as profitable_days
                FROM reviews
                WHERE DATE(date) >= DATE('now', '-' || ? || ' days')
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (days,))

            row = cursor.fetchone()
            columns = [desc[0] for desc in cursor.description]

            summary = dict(zip(columns, row))

            # 计算盈利天数比率
            total_reviews = summary['total_reviews'] or 0
            profitable = summary['profitable_days'] or 0
            summary['profit_day_rate'] = (profitable / total_reviews * 100) if total_reviews > 0 else 0

            return summary

        except Exception as e:
            logger.error(f"获取复盘汇总失败: {e}")
            return {}

    def export_reviews_to_dataframe(self, days: int = 30) -> pd.DataFrame:
        """
        导出复盘数据为DataFrame

        Args:
            days: 最近天数

        Returns:
            DataFrame
        """
        try:
            query = '''
                SELECT
                    date,
                    total_trades,
                    win_rate,
                    total_pnl,
                    review_content
                FROM reviews
                WHERE DATE(date) >= DATE('now', '-' || ? || ' days')
                ORDER BY date
            '''
            df = pd.read_sql(query, self.conn, params=(days,))

            # 解析review_content中的评分
            if not df.empty:
                df['performance_rating'] = df['review_content'].apply(
                    lambda x: json.loads(x).get('performance_rating', 0) if x else 0
                )

            return df

        except Exception as e:
            logger.error(f"导出复盘数据失败: {e}")
            return pd.DataFrame()

    def get_trades_by_date(self, target_date) -> List[Dict]:
        """
        获取指定日期的交易记录
        
        Args:
            target_date: 目标日期 (date对象或字符串)
            
        Returns:
            交易记录列表
        """
        try:
            # 转换日期格式
            if hasattr(target_date, 'strftime'):
                date_str = target_date.strftime('%Y-%m-%d')
            else:
                date_str = str(target_date)
            
            query = '''
                SELECT * FROM trades
                WHERE DATE(timestamp) = ?
                ORDER BY timestamp
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (date_str,))
            
            columns = [desc[0] for desc in cursor.description]
            trades = []
            
            for row in cursor.fetchall():
                trades.append(dict(zip(columns, row)))
            
            return trades
            
        except Exception as e:
            logger.error(f"获取指定日期交易失败: {e}")
            return []

    def get_decisions_by_date(self, target_date) -> List[Dict]:
        """
        获取指定日期的决策记录
        
        Args:
            target_date: 目标日期 (date对象或字符串)
            
        Returns:
            决策记录列表
        """
        try:
            # 转换日期格式
            if hasattr(target_date, 'strftime'):
                date_str = target_date.strftime('%Y-%m-%d')
            else:
                date_str = str(target_date)
            
            query = '''
                SELECT * FROM decisions
                WHERE DATE(timestamp) = ?
                ORDER BY timestamp
            '''
            cursor = self.conn.cursor()
            cursor.execute(query, (date_str,))
            
            columns = [desc[0] for desc in cursor.description]
            decisions = []
            
            for row in cursor.fetchall():
                decisions.append(dict(zip(columns, row)))
            
            return decisions
            
        except Exception as e:
            logger.error(f"获取指定日期决策失败: {e}")
            return []

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()
            logger.info("数据库连接已关闭")
    
    def execute_query(self, query: str, params: tuple = None):
        """
        执行查询并返回结果
        
        Args:
            query: SQL查询语句
            params: 查询参数
            
        Returns:
            查询结果列表
        """
        try:
            cursor = self.conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"执行查询失败: {e}")
            return []
    
    def execute_update(self, query: str, params: tuple = None):
        """
        执行更新/插入操作
        
        Args:
            query: SQL语句
            params: 参数
            
        Returns:
            是否成功
        """
        try:
            cursor = self.conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"执行更新失败: {e}")
            self.conn.rollback()
            return False


if __name__ == "__main__":
    # 测试代码
    db = Database("data/test_market_data.db")

    # 测试保存K线
    test_kline = pd.DataFrame({
        'timestamp': pd.date_range('2024-01-01', periods=5, freq='15min'),
        'open': [1840, 1842, 1845, 1843, 1846],
        'high': [1845, 1847, 1850, 1848, 1851],
        'low': [1838, 1840, 1842, 1841, 1844],
        'close': [1842, 1845, 1843, 1846, 1849],
        'volume': [1000, 1200, 1100, 1300, 1150]
    })

    db.save_kline_minute(test_kline, period="15")

    # 测试读取
    kline = db.get_latest_kline(period="15", count=10)
    print(f"读取K线: {len(kline)}条")
    print(kline)

    db.close()
