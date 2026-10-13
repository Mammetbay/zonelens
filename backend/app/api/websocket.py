"""WebSocket manager for real-time ZoneLens telemetry and event broadcasting."""

import asyncio
import json
from typing import Any
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict[str, Any]):
        dead_connections = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dc in dead_connections:
            self.disconnect(dc)

    def broadcast_from_thread(self, message: dict[str, Any]):
        """Safely schedule broadcast on the running asyncio event loop from a worker thread."""
        if self.loop is not None and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_json(message), self.loop)


manager = ConnectionManager()
