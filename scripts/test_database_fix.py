"""
Test database fix for strategy column
"""

import sqlite3
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.data_fetcher.database import Database


def test_database_queries():
    """Test the queries that were failing"""
    db_path = project_root / "data" / "market_data.db"
    db = Database(str(db_path))

    print("=" * 60)
    print("Testing Database Queries")
    print("=" * 60)

    # Test 1: Query strategy_signals table with strategy column
    print("\n[Test 1] Query strategy_signals table...")
    try:
        query = """
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed,
                   AVG(confidence) as avg_confidence
            FROM strategy_signals
            WHERE strategy = ?
            AND DATE(timestamp) = DATE('now')
        """
        result = db.execute_query(query, ("trend_following",))
        print(f"  Result: {result}")
        print("  [PASS] strategy_signals query succeeded")
    except Exception as e:
        print(f"  [FAIL] Error: {e}")

    # Test 2: Query trades table with strategy column
    print("\n[Test 2] Query trades table with strategy column...")
    try:
        query = """
            SELECT
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                AVG(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as avg_win,
                AVG(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) as avg_loss
            FROM trades
            WHERE strategy = ?
            AND DATE(created_at) = DATE('now')
        """
        result = db.execute_query(query, ("trend_following",))
        print(f"  Result: {result}")
        print("  [PASS] trades query with strategy column succeeded")
    except Exception as e:
        print(f"  [FAIL] Error: {e}")

    # Test 3: Verify trades table structure
    print("\n[Test 3] Verify trades table columns...")
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(trades)")
        columns = [col[1] for col in cursor.fetchall()]
        conn.close()

        print(f"  Columns: {columns}")
        if 'strategy' in columns:
            print("  [PASS] 'strategy' column exists in trades table")
        else:
            print("  [FAIL] 'strategy' column NOT found in trades table")
    except Exception as e:
        print(f"  [FAIL] Error: {e}")

    # Test 4: Verify strategy_signals table structure
    print("\n[Test 4] Verify strategy_signals table columns...")
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(strategy_signals)")
        columns = [col[1] for col in cursor.fetchall()]
        conn.close()

        print(f"  Columns: {columns}")
        if 'strategy' in columns:
            print("  [PASS] 'strategy' column exists in strategy_signals table")
        else:
            print("  [FAIL] 'strategy' column NOT found in strategy_signals table")
    except Exception as e:
        print(f"  [FAIL] Error: {e}")

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    test_database_queries()
