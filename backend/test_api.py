#!/usr/bin/env python
"""Test script for LLM Trading Analyzer API.

Usage:
    python test_api.py

Requirements:
    - Backend server must be running on http://127.0.0.1:8000
    - An OpenAI or compatible API key
"""

import requests
import json
import sys

API_BASE = "http://127.0.0.1:8000"


def test_health():
    """Test health check endpoint."""
    print("\n=== Test 1: Health Check ===")
    r = requests.get(f"{API_BASE}/api/health")
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
    return r.status_code == 200


def test_login():
    """Test login and get access token."""
    print("\n=== Test 2: Login ===")
    r = requests.post(
        f"{API_BASE}/api/auth/login",
        json={"openid": "test_user_demo", "username": "Demo User"}
    )
    print(f"Status: {r.status_code}")
    data = r.json()
    print(f"User: {data.get('user', {})}")
    token = data.get("access_token")
    print(f"Token: {token[:50]}...")
    return token


def test_get_user_info(token):
    """Test get user info."""
    print("\n=== Test 3: Get User Info ===")
    r = requests.get(
        f"{API_BASE}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
    return r.status_code == 200


def test_limits(token):
    """Test daily limits."""
    print("\n=== Test 4: Daily Limits ===")
    r = requests.get(
        f"{API_BASE}/api/analyze/limits",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
    return r.status_code == 200


def test_market_data_a():
    """Test A-share market data."""
    print("\n=== Test 5: A-Share Market Data ===")
    r = requests.get(f"{API_BASE}/api/market/a/600519?period=daily")
    print(f"Status: {r.status_code}")
    data = r.json()
    print(f"Count: {data.get('count')} bars")
    if data.get('data'):
        latest = data['data'][-1]
        print(f"Latest: {latest.get('datetime')} close={latest.get('close')}")
    return r.status_code == 200


def test_market_data_hk():
    """Test HK stock market data."""
    print("\n=== Test 6: HK Stock Market Data ===")
    r = requests.get(f"{API_BASE}/api/market/hk/00700?period=daily")
    print(f"Status: {r.status_code}")
    data = r.json()
    print(f"Count: {data.get('count')} bars")
    return r.status_code == 200


def test_market_data_us():
    """Test US stock market data."""
    print("\n=== Test 7: US Stock Market Data ===")
    r = requests.get(f"{API_BASE}/api/market/us/AAPL?period=daily")
    print(f"Status: {r.status_code}")
    data = r.json()
    print(f"Count: {data.get('count')} bars")
    return r.status_code == 200


def test_analyze(token, api_key):
    """Test full analysis with LLM."""
    print("\n=== Test 8: Full Analysis (LLM) ===")
    print("Note: This will consume 1 daily quota")

    # Use DeepSeek API (cheaper for testing)
    r = requests.post(
        f"{API_BASE}/api/analyze",
        headers={"Authorization": f"Bearer {token}"},
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
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"Signal: {data.get('result', {}).get('signal')}")
        print(f"Confidence: {data.get('result', {}).get('confidence')}")
        print(f"Remaining: {data.get('usage', {}).get('remaining')}")
    else:
        print(f"Error: {r.text[:200]}")
    return r.status_code == 200


def main():
    """Run all tests."""
    print("=" * 60)
    print("LLM Trading Analyzer API Test Suite")
    print("=" * 60)

    # Check server
    if not test_health():
        print("\nError: Backend server not running!")
        print("Start with: cd backend && set PYTHONPATH=src && uvicorn src.api.main:app --port 8000")
        sys.exit(1)

    # Get token
    token = test_login()
    if not token:
        print("\nError: Login failed!")
        sys.exit(1)

    # Test user info
    test_get_user_info(token)

    # Test limits
    test_limits(token)

    # Test market data
    test_market_data_a()
    test_market_data_hk()
    test_market_data_us()

    # Test LLM analysis (optional)
    print("\n" + "=" * 60)
    api_key = input("Enter API key for LLM analysis test (or press Enter to skip): ").strip()
    if api_key:
        test_analyze(token, api_key)
    else:
        print("\nSkipping LLM analysis test.")

    print("\n" + "=" * 60)
    print("Tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
