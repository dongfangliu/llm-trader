#!/usr/bin/env python
"""Entry point: python run_ui.py [--port 7860] [--host 0.0.0.0] [--share]"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ui.app import build_ui
import argparse
import gradio as gr

parser = argparse.ArgumentParser(description="LLM 交易策略分析器 UI")
parser.add_argument("--port", type=int, default=7860, help="监听端口 (默认 7860)")
parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认 0.0.0.0)")
parser.add_argument("--share", action="store_true", help="生成 Gradio 公网分享链接")
args = parser.parse_args()

demo = build_ui()
demo.queue(default_concurrency_limit=2)
demo.launch(
    server_name=args.host,
    server_port=args.port,
    share=args.share,
    show_error=True,
    theme=gr.themes.Soft(),
    max_threads=10,
)
