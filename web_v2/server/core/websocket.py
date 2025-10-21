"""
WebSocket管理器
实现实时数据推送
"""

import asyncio
import json
from typing import List
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from server.core.bridge import bridge
from server.utils.config import settings


class WebSocketManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.push_task = None
    
    async def connect(self, websocket: WebSocket):
        """接受新连接"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket客户端已连接 | 当前连接数: {len(self.active_connections)}")

        # 启动推送任务（如果尚未启动）
        if self.push_task is None or self.push_task.done():
            self.push_task = asyncio.create_task(self._push_loop())

        try:
            # 发送初始数据
            await self._send_initial_data(websocket)
            logger.debug("初始数据发送完成，进入消息接收循环")

            # 保持连接，接收客户端消息
            while True:
                data = await websocket.receive_text()
                logger.debug(f"收到客户端消息: {data[:100]}")  # 只记录前100个字符
                await self._handle_client_message(websocket, data)

        except WebSocketDisconnect as e:
            logger.info(f"WebSocket正常断开: code={e.code}")
            self.disconnect(websocket)
        except Exception as e:
            logger.error(f"WebSocket异常: {type(e).__name__}: {e}", exc_info=True)
            self.disconnect(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """断开连接"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket客户端已断开 | 剩余连接数: {len(self.active_connections)}")
    
    async def _send_initial_data(self, websocket: WebSocket):
        """发送初始数据"""
        try:
            # 账户信息
            account = bridge.get_account_info()
            await websocket.send_json({
                "type": "account_update",
                "data": account
            })
            
            # 市场状态
            regime = bridge.get_market_regime()
            await websocket.send_json({
                "type": "market_regime",
                "data": regime
            })
            
            logger.debug("已发送初始数据")
        except Exception as e:
            logger.error(f"发送初始数据失败: {e}")
    
    async def _push_loop(self):
        """推送循环"""
        logger.info("WebSocket推送循环已启动")

        while True:
            if not self.active_connections:
                await asyncio.sleep(5)
                continue

            try:
                # 获取最新数据
                account = bridge.get_account_info()
                kline = bridge.get_kline_data('1m', limit=1)
                regime = bridge.get_market_regime()

                # 推送给所有连接的客户端
                await self.broadcast({
                    "type": "realtime_update",
                    "data": {
                        "account": account,
                        "latest_kline": kline[0] if kline else None,
                        "market_regime": regime
                    }
                })

            except Exception as e:
                logger.error(f"推送数据失败: {e}", exc_info=True)

            # 即使发生错误也继续循环
            await asyncio.sleep(settings.WEBSOCKET_PUSH_INTERVAL)
    
    async def broadcast(self, message: dict):
        """广播消息给所有客户端"""
        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"广播失败: {type(e).__name__}: {e}")
                disconnected.append(connection)

        # 清理断开的连接
        for conn in disconnected:
            self.disconnect(conn)
    
    async def _handle_client_message(self, websocket: WebSocket, message: str):
        """处理客户端消息"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "subscribe":
                # 客户端订阅特定数据
                channel = data.get("channel")
                logger.debug(f"客户端订阅: {channel}")
                
            elif msg_type == "ping":
                # 心跳响应
                await websocket.send_json({"type": "pong"})
                
        except json.JSONDecodeError:
            logger.warning(f"无效的JSON消息: {message}")
        except Exception as e:
            logger.error(f"处理客户端消息失败: {e}")
