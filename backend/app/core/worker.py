"""Background vision worker executing YOLO11n detection, ByteTrack tracking,
and real-time line/zone rule evaluation with MJPEG streaming and telemetry broadcasting.
"""

import math
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from app.storage.database import record_event
from app.vision.config import Config, LineConfig, ZoneConfig
from app.vision.line_counter import LineCounter
from app.vision.pipeline import inference_device_info, select_device
from app.vision.zone_monitor import ZoneMonitor


class VisionWorker:
    def __init__(self, config: Config | None = None):
        self.config = config or Config()
        self.lock = threading.Lock()
        self.frame_condition = threading.Condition(self.lock)

        self.thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.pause_event = threading.Event()

        # State fields
        self.status: str = "stopped"  # stopped, running, paused, completed, error
        self.source_path: str = "samples/people.mp4"
        self.loop: bool = True
        self.error_message: str | None = None

        # Telemetry
        self.frame_index: int = 0
        self.source_fps: float = 30.0
        self.processing_fps: float = 0.0
        self.mean_inference_ms: float = 0.0
        self.active_device: str = "auto"
        self.active_gpu: str | None = None
        self.line_counts: dict[str, int] = {}
        self.zone_stats: dict[str, dict[str, Any]] = {}
        self.current_tracks: list[dict[str, Any]] = []

        # Stream preview buffer
        self.latest_jpeg: bytes | None = None
        self.latest_frame_time: float = 0.0

        # Callbacks for broadcasting
        self.event_callbacks: list[Callable[[dict[str, Any]], None]] = []
        self.telemetry_callbacks: list[Callable[[dict[str, Any]], None]] = []

    def register_event_callback(self, cb: Callable[[dict[str, Any]], None]):
        self.event_callbacks.append(cb)

    def register_telemetry_callback(self, cb: Callable[[dict[str, Any]], None]):
        self.telemetry_callbacks.append(cb)

    def emit_event(self, event: dict[str, Any]):
        # Record to SQLite database
        try:
            record_event(event)
        except Exception as exc:
            print(f"Warning: failed to record event to database: {exc}")

        # Broadcast via callbacks
        for cb in list(self.event_callbacks):
            try:
                cb(event)
            except Exception:
                pass

    def emit_telemetry(self):
        telemetry = self.get_status()
        for cb in list(self.telemetry_callbacks):
            try:
                cb(telemetry)
            except Exception:
                pass

    def get_status(self) -> dict[str, Any]:
        with self.lock:
            return {
                "status": self.status,
                "source": self.source_path,
                "loop": self.loop,
                "frame_index": self.frame_index,
                "source_fps": round(self.source_fps, 2),
                "processing_fps": round(self.processing_fps, 2),
                "mean_inference_ms": round(self.mean_inference_ms, 2),
                "device": self.active_device,
                "gpu": self.active_gpu,
                "line_counts": dict(self.line_counts),
                "zones": dict(self.zone_stats),
                "active_people_count": len(self.current_tracks),
                "tracks": list(self.current_tracks),
                "error": self.error_message,
            }

    def get_rules(self) -> dict[str, Any]:
        with self.lock:
            line_data = None
            if self.config.line:
                line_data = {
                    "start": list(self.config.line.start),
                    "end": list(self.config.line.end),
                    "positive_label": self.config.line.positive_label,
                    "negative_label": self.config.line.negative_label,
                    "hysteresis_px": self.config.line.hysteresis_px,
                    "max_gap_frames": self.config.line.max_gap_frames,
                }
            zones_data = [
                {
                    "name": z.name,
                    "vertices": [list(pt) for pt in z.vertices],
                    "dwell_seconds": z.dwell_seconds,
                    "max_gap_frames": z.max_gap_frames,
                }
                for z in self.config.zones
            ]
            return {
                "line": line_data,
                "zones": zones_data,
            }

    def update_rules(self, line: LineConfig | None, zones: tuple[ZoneConfig, ...]):
        with self.lock:
            self.config = Config(
                model=self.config.model,
                device=self.config.device,
                imgsz=self.config.imgsz,
                confidence=self.config.confidence,
                iou=self.config.iou,
                tracker=self.config.tracker,
                line=line,
                zones=zones,
            )
            # Signal worker to reinitialize monitors on next frame
            self._reload_rules_flag = True

    def reset_counts(self):
        with self.lock:
            self._reset_counts_flag = True
            self.line_counts.clear()

    def start(self, source: str = "samples/people.mp4", loop: bool = True, device: str = "auto"):
        self.stop()

        self.source_path = source
        self.loop = loop
        self.error_message = None
        self._reload_rules_flag = False
        self._reset_counts_flag = False

        with self.lock:
            self.config = Config(
                model=self.config.model,
                device=device,
                imgsz=self.config.imgsz,
                confidence=self.config.confidence,
                iou=self.config.iou,
                tracker=self.config.tracker,
                line=self.config.line,
                zones=self.config.zones,
            )
            self.status = "starting"

        self.stop_event.clear()
        self.pause_event.clear()

        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.pause_event.clear()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3.0)
        with self.lock:
            self.status = "stopped"

    def pause(self):
        self.pause_event.set()
        with self.lock:
            self.status = "paused"

    def resume(self):
        self.pause_event.clear()
        with self.lock:
            self.status = "running"

    def get_latest_jpeg(self, timeout: float = 1.0) -> bytes | None:
        with self.frame_condition:
            if self.latest_jpeg is not None:
                return self.latest_jpeg
            self.frame_condition.wait(timeout=timeout)
            return self.latest_jpeg

    def _open_capture(self) -> cv2.VideoCapture:
        # Check if source is webcam index (e.g. "0" or 0)
        if self.source_path.isdigit():
            cap = cv2.VideoCapture(int(self.source_path))
        else:
            path = Path(self.source_path)
            if not path.is_file():
                raise FileNotFoundError(f"Source video file not found: {path}")
            cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {self.source_path}")
        return cap

    def _run_loop(self):
        cap = None
        try:
            device = select_device(self.config.device)
            model = YOLO(self.config.model)
            if model.names.get(0) != "person":
                raise ValueError("Model class 0 must be person")

            # Warmup
            model.predict(
                np.zeros((self.config.imgsz, self.config.imgsz, 3), dtype=np.uint8),
                device=device,
                imgsz=self.config.imgsz,
                verbose=False,
            )
            actual_device, gpu = inference_device_info(model)
            with self.lock:
                self.active_device = actual_device
                self.active_gpu = gpu

            cap = self._open_capture()
            fps = cap.get(cv2.CAP_PROP_FPS)
            if not math.isfinite(fps) or fps <= 0:
                fps = 30.0
            with self.lock:
                self.source_fps = fps
                self.status = "running"

            counter: LineCounter | None = None
            zones: list[ZoneMonitor] = []

            frame_count = 0
            start_time = time.perf_counter()
            total_inference_ms = 0.0

            while not self.stop_event.is_set():
                if self.pause_event.is_set():
                    time.sleep(0.05)
                    continue

                ok, frame = cap.read()
                if not ok:
                    if self.loop and not self.source_path.isdigit():
                        # Rewind video file
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ok, frame = cap.read()
                        if not ok:
                            break
                    else:
                        with self.lock:
                            self.status = "completed"
                        break

                frame_count += 1
                height, width = frame.shape[:2]

                # Check if rules were updated or reset was requested
                if self._reload_rules_flag or counter is None or len(zones) != len(self.config.zones):
                    self._reload_rules_flag = False
                    if self.config.line:
                        counter = LineCounter(self.config.line, width, height)
                    else:
                        counter = None
                    zones = [ZoneMonitor(z, width, height) for z in self.config.zones]

                if self._reset_counts_flag:
                    self._reset_counts_flag = False
                    if counter is not None:
                        counter.counts.clear()
                    for z in zones:
                        z.stats["occupancy"] = 0
                        z.stats["peak_occupancy"] = 0
                        z.stats["dwell_events"] = 0

                # Inference & Tracking
                result = model.track(
                    frame,
                    persist=True,
                    tracker=self.config.tracker,
                    classes=[0],
                    conf=self.config.confidence,
                    iou=self.config.iou,
                    imgsz=self.config.imgsz,
                    device=device,
                    verbose=False,
                )[0]

                infer_ms = result.speed.get("inference", 0.0)
                total_inference_ms += infer_ms

                boxes = result.boxes
                people = []
                if boxes is not None:
                    xyxy = boxes.xyxy.cpu().tolist()
                    scores = boxes.conf.cpu().tolist()
                    track_ids = (
                        boxes.id.int().cpu().tolist() if boxes.is_track else [None] * len(boxes)
                    )
                    for box, score, track_id in zip(xyxy, scores, track_ids):
                        people.append({
                            "id": track_id,
                            "confidence": round(score, 4),
                            "xyxy": [round(v, 1) for v in box],
                        })

                video_time_ms = round(frame_count / fps * 1000, 2)

                # Process Zone Rules
                if zones:
                    for z in zones:
                        new_events = z.update(frame_count, video_time_ms, people)
                        for ev in new_events:
                            self.emit_event(ev)

                # Process Line Rules
                if counter is not None:
                    new_events = counter.update(frame_count, video_time_ms, people)
                    for ev in new_events:
                        self.emit_event(ev)

                # Annotated frame rendering
                annotated = result.plot()

                # Draw configured line
                if counter is not None:
                    p1 = tuple(round(v) for v in counter.start)
                    p2 = tuple(round(v) for v in counter.end)
                    cv2.arrowedLine(annotated, p1, p2, (0, 255, 255), 3, tipLength=0.03)
                    label = f"{self.config.line.positive_label}: {counter.counts.get(self.config.line.positive_label, 0)} | {self.config.line.negative_label}: {counter.counts.get(self.config.line.negative_label, 0)}"
                    cv2.putText(
                        annotated,
                        label,
                        (14, 60),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 255),
                        2,
                    )

                # Draw configured zones
                for z_idx, z in enumerate(zones):
                    vertices = np.array(z.vertices).round().astype(np.int32)
                    cv2.polylines(annotated, [vertices], True, (0, 255, 128), 2)
                    zone_label = f"{z.config.name}: {z.stats['occupancy']} (Dwell: {z.stats['dwell_events']})"
                    cv2.putText(
                        annotated,
                        zone_label,
                        (14, 90 + z_idx * 26),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.65,
                        (0, 255, 128),
                        2,
                    )

                # FPS and status overlay
                elapsed = time.perf_counter() - start_time
                curr_proc_fps = frame_count / elapsed if elapsed > 0 else 0.0
                cv2.putText(
                    annotated,
                    f"ZoneLens | FPS: {curr_proc_fps:.1f} | Dev: {actual_device}",
                    (14, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2,
                )

                # Encode JPEG
                _, jpeg_buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                jpeg_bytes = jpeg_buf.tobytes()

                # Update state under lock
                with self.frame_condition:
                    self.frame_index = frame_count
                    self.processing_fps = curr_proc_fps
                    self.mean_inference_ms = total_inference_ms / frame_count
                    self.line_counts = dict(counter.counts) if counter else {}
                    self.zone_stats = {z.config.name: dict(z.stats) for z in zones}
                    self.current_tracks = people
                    self.latest_jpeg = jpeg_bytes
                    self.latest_frame_time = time.time()
                    self.frame_condition.notify_all()

                # Periodic telemetry emit (every 10 frames)
                if frame_count % 5 == 0:
                    self.emit_telemetry()

                # Slight yield to avoid saturated core when processing faster than video fps
                target_frame_time = 1.0 / fps
                actual_spent = infer_ms / 1000.0
                if actual_spent < target_frame_time:
                    time.sleep(target_frame_time - actual_spent)

        except Exception as exc:
            with self.lock:
                self.status = "error"
                self.error_message = str(exc)
            print(f"Error in VisionWorker: {exc}")
        finally:
            if cap is not None:
                cap.release()
            with self.lock:
                if self.status not in ("error", "completed"):
                    self.status = "stopped"
            self.emit_telemetry()
