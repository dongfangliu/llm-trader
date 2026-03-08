"""Playwright script to screenshot the frontend at mobile viewport 390x844."""
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"C:\Users\Administrator\.copilot\session-state\6057e54f-a0bf-4c8c-bbb2-2b9621e77b79\files"

MOCK_RESPONSE = {
    "result": {
        "action": "buy",
        "confidence": 78,
        "reason": "贵州茅台当前处于技术性超卖区域，RSI指标显示14日RSI为42，接近超卖边界。均线系统显示MA10正在接近MA30，有望形成金叉。从资金流向来看，主力资金近3日净流入约12亿元，显示机构资金在此位置有明显的建仓意向。",
        "target_price": 1980.0,
        "stop_loss": 1720.0,
        "risk_factors": ["宏观经济下行压力", "白酒行业增速放缓", "美联储加息预期"],
        "opportunity_quality": "B",
        "market_analysis": "A股市场整体在政策托底背景下保持震荡，白酒板块受益于春节消费旺季预期，贵州茅台作为龙头有望引领板块修复。",
        "opportunity_analysis": "当前价位距历史高点仍有较大折价，估值相对合理。",
        "risk_analysis": "需关注宏观经济数据及政策面变化，设置合理止损。",
        "execution_plan": "建议分批建仓，首批可在当前价位买入30%仓位，目标位1980元，止损设在1720元。",
        "indicators": {"RSI": 42.3, "MACD": 0.85, "MA10": 1748.5, "MA30": 1791.2}
    },
    "data": {
        "symbol": "600519",
        "market": "a",
        "name": "贵州茅台",
        "latest_price": 1823.5,
        "latest_date": "2025-01-15T15:00:00"
    },
    "usage": {"used": 1, "remaining": 4, "limit": 5}
}

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        # ── Mock the analyze API ──────────────────────────────────────────────
        import json
        def handle_route(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(MOCK_RESPONSE)
            )
        page.route("**/api/analyze**", handle_route)

        # Also mock auth/me so the page thinks we're logged in
        def handle_me(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "id": 1,
                    "username": "demo",
                    "email": "demo@example.com",
                    "subscription_tier": "premium",
                    "daily_limit": 5,
                    "used_today": 0
                })
            )
        page.route("**/api/auth/me**", handle_me)

        # Mock usage endpoint
        def handle_usage(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"used": 0, "remaining": 5, "limit": 5, "tier": "premium"})
            )
        page.route("**/api/usage**", handle_usage)
        page.route("**/api/auth/usage**", handle_usage)

        # ── Navigate ──────────────────────────────────────────────────────────
        print("Navigating to http://localhost:3000 ...")
        page.goto("http://localhost:3000", wait_until="networkidle", timeout=30000)
        time.sleep(1)

        # Screenshot 1: initial state
        path1 = f"{OUTPUT_DIR}\\v15_analyze.png"
        page.screenshot(path=path1, full_page=False)
        print(f"Saved: {path1}")
        print("  Page title:", page.title())

        # ── Check what's visible ──────────────────────────────────────────────
        content_snippet = page.evaluate("() => document.body.innerText.slice(0, 500)")
        print("Body text snippet:", content_snippet)

        # Check if there's a login form or the main app
        has_login = page.locator("input[type='password']").count() > 0
        print("Has login form:", has_login)

        if has_login:
            print("Login form detected – injecting auth token and reloading...")
            page.evaluate("""() => {
                localStorage.setItem('token', 'mock-jwt-token-demo');
                localStorage.setItem('auth_token', 'mock-jwt-token-demo');
            }""")
            # Mock the token validation
            def handle_verify(route):
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({
                        "id": 1,
                        "username": "demo",
                        "email": "demo@example.com",
                        "subscription_tier": "premium",
                        "daily_limit": 5,
                        "used_today": 0
                    })
                )
            page.route("**/api/auth/**", handle_verify)
            page.reload(wait_until="networkidle")
            time.sleep(1)
            page.screenshot(path=path1, full_page=False)
            print("Re-saved analyze screenshot after auth injection")

        # ── Find and interact with analyze panel ──────────────────────────────
        # Look for stock input
        print("\nLooking for input fields...")
        inputs = page.locator("input").all()
        for i, inp in enumerate(inputs):
            try:
                placeholder = inp.get_attribute("placeholder") or ""
                input_type = inp.get_attribute("type") or ""
                print(f"  Input {i}: type={input_type}, placeholder={placeholder}")
            except Exception:
                pass

        # Try to find stock symbol input (placeholder hints)
        symbol_input = None
        for placeholder_text in ["股票代码", "代码", "symbol", "600", "输入"]:
            loc = page.locator(f"input[placeholder*='{placeholder_text}']")
            if loc.count() > 0:
                symbol_input = loc.first
                print(f"Found input with placeholder containing '{placeholder_text}'")
                break

        if symbol_input is None:
            # Just take first visible text input
            for inp in page.locator("input[type='text'], input:not([type])").all():
                try:
                    if inp.is_visible():
                        symbol_input = inp
                        print("Using first visible text input")
                        break
                except Exception:
                    pass

        if symbol_input:
            symbol_input.click()
            symbol_input.fill("600519")
            print("Filled symbol input with 600519")
            time.sleep(0.5)

        # Look for "开始分析" or similar analyze button
        analyze_btn = None
        for btn_text in ["开始分析", "分析", "查询", "Analyze"]:
            loc = page.locator(f"button:has-text('{btn_text}')")
            if loc.count() > 0:
                analyze_btn = loc.first
                print(f"Found button: '{btn_text}'")
                break

        if analyze_btn is None:
            # Try any visible button
            for btn in page.locator("button").all():
                try:
                    if btn.is_visible():
                        txt = btn.inner_text()
                        print(f"  Button: '{txt}'")
                except Exception:
                    pass

        if analyze_btn:
            # Use the first VISIBLE button
            for btn in page.locator(f"button:has-text('开始分析')").all():
                try:
                    if btn.is_visible():
                        btn.click()
                        analyze_btn = btn
                        print("Clicked visible analyze button")
                        break
                except Exception as e:
                    print(f"  skip btn: {e}")
            time.sleep(3)  # wait for mocked response

        # Screenshot 2: result panel (hero)
        path2 = f"{OUTPUT_DIR}\\v15_result_hero.png"
        page.screenshot(path=path2, full_page=False)
        print(f"Saved: {path2}")

        # Scroll to middle
        page.evaluate("window.scrollBy(0, 400)")
        time.sleep(0.5)

        # Screenshot 3: result bottom
        path3 = f"{OUTPUT_DIR}\\v15_result_bottom.png"
        page.screenshot(path=path3, full_page=False)
        print(f"Saved: {path3}")

        # Also take a full-page screenshot for reference
        path4 = f"{OUTPUT_DIR}\\v15_result_full.png"
        page.screenshot(path=path4, full_page=True)
        print(f"Saved full-page: {path4}")

        # Print visible text after analysis
        content_after = page.evaluate("() => document.body.innerText.slice(0, 800)")
        print("\nBody text after analysis:\n", content_after)

        browser.close()
        print("\nDone!")

if __name__ == "__main__":
    run()
