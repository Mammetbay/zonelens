"""FastAPI routes for ZoneLens analytics, rules configuration, MJPEG stream, and events."""

import asyncio
import time
from typing import Any
import torch
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.websocket import manager
from app.core.worker import VisionWorker
from app.storage.database import clear_events, get_events, get_setting, save_setting
from app.vision.config import LineConfig, ZoneConfig

router = APIRouter(prefix="/api")

# Global worker instance (initialized in main.py lifespan)
worker: VisionWorker | None = None


def get_worker() -> VisionWorker:
    global worker
    if worker is None:
        raise HTTPException(status_code=500, detail="Worker not initialized")
    return worker


class LineRuleModel(BaseModel):
    start: list[float] = Field(default=[0.1, 0.5])
    end: list[float] = Field(default=[0.9, 0.5])
    positive_label: str = Field(default="in")
    negative_label: str = Field(default="out")
    hysteresis_px: float = Field(default=3.0)
    max_gap_frames: int = Field(default=5)


class ZoneRuleModel(BaseModel):
    name: str
    vertices: list[list[float]]
    dwell_seconds: float = Field(default=5.0)
    max_gap_frames: int = Field(default=5)


class RulesUpdateModel(BaseModel):
    line: LineRuleModel | None = None
    zones: list[ZoneRuleModel] = Field(default_factory=list)


class StartSourceModel(BaseModel):
    source: str = "samples/people.mp4"
    loop: bool = True
    device: str = "auto"


@router.get("/health")
def get_health():
    cuda_avail = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_avail else None
    return {
        "status": "ok",
        "cuda_available": cuda_avail,
        "cuda_device": device_name,
        "cuda_runtime": torch.version.cuda,
        "torch_version": torch.__version__,
    }


@router.get("/status")
def get_status():
    w = get_worker()
    return w.get_status()


@router.get("/rules")
def get_rules():
    w = get_worker()
    return w.get_rules()


@router.put("/rules")
def update_rules(payload: RulesUpdateModel):
    w = get_worker()
    line_cfg = None
    if payload.line is not None:
        try:
            line_cfg = LineConfig(
                start=tuple(payload.line.start),
                end=tuple(payload.line.end),
                positive_label=payload.line.positive_label,
                negative_label=payload.line.negative_label,
                hysteresis_px=payload.line.hysteresis_px,
                max_gap_frames=payload.line.max_gap_frames,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid line rule: {exc}") from exc

    zone_cfgs = []
    for z in payload.zones:
        try:
            zone_cfg = ZoneConfig(
                name=z.name,
                vertices=tuple(tuple(pt) for pt in z.vertices),
                dwell_seconds=z.dwell_seconds,
                max_gap_frames=z.max_gap_frames,
            )
            zone_cfgs.append(zone_cfg)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid zone '{z.name}': {exc}") from exc

    try:
        w.update_rules(line_cfg, tuple(zone_cfgs))
        save_setting("rules", payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "ok", "rules": w.get_rules()}


@router.post("/source/start")
def start_source(payload: StartSourceModel):
    w = get_worker()
    try:
        w.start(source=payload.source, loop=payload.loop, device=payload.device)
        return {"status": "started", "source": payload.source}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/source/stop")
def stop_source():
    w = get_worker()
    w.stop()
    return {"status": "stopped"}


@router.post("/source/pause")
def pause_source():
    w = get_worker()
    w.pause()
    return {"status": "paused"}


@router.post("/source/resume")
def resume_source():
    w = get_worker()
    w.resume()
    return {"status": "resumed"}


@router.post("/source/reset_counts")
def reset_counts():
    w = get_worker()
    w.reset_counts()
    return {"status": "reset"}


@router.get("/events")
def list_events(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    type: str | None = Query(default=None),
    rule: str | None = Query(default=None),
):
    events, total = get_events(limit=limit, offset=offset, event_type=type, rule_name=rule)
    return {"events": events, "total": total, "limit": limit, "offset": offset}


@router.delete("/events")
def delete_events():
    count = clear_events()
    return {"status": "cleared", "deleted_count": count}


@router.get("/preview")
def get_preview():
    w = get_worker()

    def frame_generator():
        last_sent_time = 0.0
        while True:
            jpeg = w.get_latest_jpeg(timeout=0.5)
            if jpeg is None:
                # If stopped or no frame ready yet, wait briefly
                time.sleep(0.04)
                continue
            # Throttle stream slightly to prevent saturating bandwidth (max 30 fps)
            now = time.time()
            if now - last_sent_time < 0.033:
                time.sleep(0.01)
                continue
            last_sent_time = now

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            )

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/events/stream")
async def sse_events_stream():
    """Server-Sent Events fallback for real-time telemetry and events without requiring websockets package."""
    import json
    w = get_worker()

    async def sse_generator():
        initial_msg = json.dumps({"type": "telemetry", "data": w.get_status()})
        yield f"data: {initial_msg}\n\n"
        last_frame = -1
        while True:
            await asyncio.sleep(0.2)
            status = w.get_status()
            if status["frame_index"] != last_frame:
                last_frame = status["frame_index"]
                yield f"data: {json.dumps({'type': 'telemetry', 'data': status})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    w = get_worker()
    # Send initial telemetry immediately
    await websocket.send_json({"type": "telemetry", "data": w.get_status()})
    try:
        while True:
            # Keep socket open and receive any client messages or pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
