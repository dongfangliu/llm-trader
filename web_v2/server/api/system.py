"""
系统监控API
"""

from fastapi import APIRouter, Query

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/status", response_model=StandardResponse)
async def get_system_status():
    """获取系统状态"""
    data = bridge.get_system_status()
    return StandardResponse(code=200, message="success", data=data)


@router.get("/logs", response_model=StandardResponse)
async def get_backend_logs(tail: int = Query(500, ge=1, le=5000, description="N")):
    """读取后端日志文件的最后N行"""
    try:
        from pathlib import Path as _Path
        logs_dir = _Path(__file__).parent.parent / "logs"
        candidates = sorted(logs_dir.glob("api*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        log_file = candidates[0] if candidates else logs_dir / "api.log"
        if not log_file.exists():
            return StandardResponse(code=404, message="log file not found", data={"path": str(log_file), "lines": []})
        with log_file.open("r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-tail:]
        return StandardResponse(code=200, message="success", data={"path": str(log_file), "lines": lines})
    except Exception as e:
        return StandardResponse(code=500, message=f"read log failed: {e}", data=None)
