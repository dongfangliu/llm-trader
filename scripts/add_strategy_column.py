"""
Add strategy column to trades table
"""

import sqlite3
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def add_strategy_column():
    """Add strategy column to trades table"""
    db_path = project_root / "data" / "market_data.db"

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(trades)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'strategy' in columns:
            print("Column 'strategy' already exists in trades table")
            return True

        # Add strategy column
        print("Adding 'strategy' column to trades table...")
        cursor.execute("""
            ALTER TABLE trades
            ADD COLUMN strategy TEXT
        """)

        conn.commit()
        print("Successfully added 'strategy' column to trades table")

        # Verify
        cursor.execute("PRAGMA table_info(trades)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"\nTrades table columns: {columns}")

        return True

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    success = add_strategy_column()
    sys.exit(0 if success else 1)
