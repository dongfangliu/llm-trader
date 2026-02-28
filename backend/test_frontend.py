#!/usr/bin/env python
"""Frontend integration test script.

This script tests the full flow:
1. Login and get token
2. Get user info
3. Get daily limits
4. Get market data
5. Run LLM analysis

Usage:
    python test_frontend.py [api_key]
"""

import requests
import json
import sys

API_BASE = "http://127.0.0.1:8000"


def test_full_flow(api_key=None):
    """Test the complete flow."""
    print("=" * 60)
    print("Frontend Integration Test")
    print("=" * 60)

    # 1. Login
    print("\n[1] Login...")
    r = requests.post(
        f"{API_BASE}/api/auth/login",
        json={"openid": "test_user_frontend", "username": "Frontend Test"}
    )
    if r.status_code != 200:
        print(f"FAIL: Login failed - {r.text}")
        return False

    data = r.json()
    token = data.get("access_token")
    user = data.get("user")
    print(f"OK: Logged in as {user.get('username')} (Tier: {user.get('subscription_tier')})")

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get user info
    print("\n[2] Get user info...")
    r = requests.get(f"{API_BASE}/api/auth/me", headers=headers)
    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False
    print(f"OK: {r.json()}")

    # 3. Get limits
    print("\n[3] Get daily limits...")
    r = requests.get(f"{API_BASE}/api/analyze/limits", headers=headers)
    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False
    limits = r.json()
    print(f"OK: {limits}")

    # 4. Get A-share data
    print("\n[4] Get A-share market data (600519)...")
    r = requests.get(f"{API_BASE}/api/market/a/600519")
    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False
    market_data = r.json()
    print(f"OK: Got {market_data.get('count')} bars")

    # 5. Get HK stock data
    print("\n[5] Get HK stock market data (00700)...")
    r = requests.get(f"{API_BASE}/api/market/hk/00700")
    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False
    market_data = r.json()
    print(f"OK: Got {market_data.get('count')} bars")

    # 6. Get US stock data
    print("\n[6] Get US stock market data (AAPL)...")
    r = requests.get(f"{API_BASE}/api/market/us/AAPL")
    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False
    market_data = r.json()
    print(f"OK: Got {market_data.get('count')} bars")

    # 7. Test LLM analysis
    print("\n[7] Run LLM analysis...")

    if not api_key:
        print("Skipping LLM analysis test (no API key provided).")
        print("\n" + "=" * 60)
        print("All basic tests passed!")
        print("=" * 60)
        return True

    # Check remaining limits
    r = requests.get(f"{API_BASE}/api/analyze/limits", headers=headers)
    remaining = r.json().get("remaining", 0)

    if remaining <= 0:
        print("FAIL: No remaining analysis quota")
        return False

    r = requests.post(
        f"{API_BASE}/api/analyze",
        headers=headers,
        json={
            "symbol": "600519",
            "market": "a",
            "period": "daily",
            "history_days": 90,
            "llm_provider": "openai",
            "api_key": api_key,
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "max_tokens": 1000,
            "temperature": 0.7,
        }
    )

    if r.status_code != 200:
        print(f"FAIL: {r.text}")
        return False

    result = r.json()
    print(f"OK: Analysis complete!")
    print(f"  Signal: {result.get('result', {}).get('signal')}")
    print(f"  Confidence: {result.get('result', {}).get('confidence')}%")
    print(f"  Remaining: {result.get('usage', {}).get('remaining')}")

    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    api_key = sys.argv[1] if len(sys.argv) > 1 else None
    success = test_full_flow(api_key)
    sys.exit(0 if success else 1)
