#!/usr/bin/env python
"""Quick import verification script for backend."""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, 'backend')

errors = []

try:
    from src.config import settings
    print(f"✓ Config OK (db: {settings.database_url[:30]}...)")
except Exception as e:
    errors.append(f"✗ Config: {e}")

try:
    from src.models import User, Device
    print("✓ Models OK")
except Exception as e:
    errors.append(f"✗ Models: {e}")

try:
    from src.api.routers.auth import router
    print(f"✓ Auth router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Auth router: {e}")

try:
    from src.api.routers.analyze import router
    print(f"✓ Analyze router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Analyze router: {e}")

try:
    from src.api.routers.subscription import router
    print(f"✓ Subscription router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Subscription router: {e}")

try:
    from src.api.routers.market import router
    print(f"✓ Market router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Market router: {e}")

try:
    from src.api.routers.admin import router
    print(f"✓ Admin router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Admin router: {e}")

try:
    from src.api.routers.config import router
    print(f"✓ Config router OK ({len(router.routes)} routes)")
except Exception as e:
    errors.append(f"✗ Config router: {e}")

try:
    from src.api.main_v2 import app
    print("✓ main_v2 app OK")
except Exception as e:
    errors.append(f"✗ main_v2: {e}")

if errors:
    print("\n❌ ERRORS:")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)
else:
    print("\n✅ All imports OK!")
