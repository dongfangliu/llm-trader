#!/usr/bin/env python
"""Entry point: python run_ui.py [--port 7860] [--host 127.0.0.1]"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import uvicorn
from src.api.server import app

parser = argparse.ArgumentParser(description="LLM 交易策略分析器")
parser.add_argument("--port", type=int, default=7860, help="监听端口 (默认 7860)")
parser.add_argument("--host", default="127.0.0.1", help="监听地址 (默认 127.0.0.1)")
args = parser.parse_args()

print(f"🚀  服务已启动: http://{args.host}:{args.port}")
uvicorn.run(app, host=args.host, port=args.port)
