"""FastAPI application entry point for ZoneLens."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes
from app.api.websocket import manager
from app.core.worker import VisionWorker
from app.storage.database import get_setting, init_db
from app.vision.config import Config, LineConfig, ZoneConfig


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database
    init_db()

    # Create VisionWorker
    initial_config = Config(
        line=LineConfig(start=(0.1, 0.5), end=(0.9, 0.5), positive_label="in", negative_label="out"),
        zones=(
            ZoneConfig(
                name="Lobby",
                vertices=((0.15, 0.2), (0.85, 0.2), (0.85, 0.8), (0.15, 0.8)),
                dwell_seconds=5.0,
            ),
        ),
    )

    # Check if saved rules exist in SQLite app_state
    saved_rules = get_setting("rules")
    if saved_rules:
        try:
            line_val = None
            if saved_rules.get("line"):
                l = saved_rules["line"]
                line_val = LineConfig(
                    start=tuple(l["start"]),
                    end=tuple(l["end"]),
                    positive_label=l.get("positive_label", "in"),
                    negative_label=l.get("negative_label", "out"),
                    hysteresis_px=l.get("hysteresis_px", 3.0),
                    max_gap_frames=l.get("max_gap_frames", 5),
                )
            zones_val = []
            for z in saved_rules.get("zones", []):
                zones_val.append(
                    ZoneConfig(
                        name=z["name"],
                        vertices=tuple(tuple(pt) for pt in z["vertices"]),
                        dwell_seconds=z.get("dwell_seconds", 5.0),
                        max_gap_frames=z.get("max_gap_frames", 5),
                    )
                )
            initial_config = Config(line=line_val, zones=tuple(zones_val))
        except Exception as exc:
            print(f"Warning: could not restore saved rules: {exc}")

    worker = VisionWorker(initial_config)
    routes.worker = worker

    # Set up event loop for thread-safe WebSocket broadcasting
    loop = asyncio.get_running_loop()
    def custom_handler(l, context):
        exc = context.get("exception")
        if isinstance(exc, (ConnectionResetError, BrokenPipeError)) or (
            isinstance(exc, OSError) and getattr(exc, "winerror", None) == 10054
        ):
            return
        l.default_exception_handler(context)
    loop.set_exception_handler(custom_handler)
    routes.async_loop = loop

    # Register callbacks for WebSocket and SSE
    worker.register_event_callback(
        lambda ev: (
            manager.broadcast_from_thread({"type": "event", "data": ev}),
            routes.broadcast_sse({"type": "event", "data": ev}),
        )
    )
    worker.register_telemetry_callback(
        lambda tel: (
            manager.broadcast_from_thread({"type": "telemetry", "data": tel}),
            routes.broadcast_sse({"type": "telemetry", "data": tel}),
        )
    )

    # Auto-start with sample video if available
    sample_video = Path("samples/people.mp4")
    if sample_video.is_file():
        try:
            worker.start(source=str(sample_video), loop=True, device="auto")
        except Exception as exc:
            print(f"Warning: could not auto-start sample video: {exc}")

    yield

    # Clean shutdown
    if routes.worker:
        routes.worker.stop()


app = FastAPI(title="ZoneLens API", version="0.1.0", lifespan=lifespan)

# Enable CORS for local development (frontend dev server on port 5173, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(routes.router)

# Mount frontend build if it exists
frontend_dist = Path("frontend/dist")
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
