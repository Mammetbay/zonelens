"""File inference session; one model and tracker per run."""

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np
import torch
import ultralytics
from ultralytics import YOLO

from app.vision.config import Config
from app.vision.line_counter import LineCounter
from app.vision.source import VideoSource
from app.vision.zone_monitor import ZoneMonitor


def select_device(requested: str) -> str:
    if requested == "auto":
        if torch.cuda.is_available():
            return "0"
        print("CUDA unavailable; using CPU. Processing may be slower.")
        return "cpu"
    if requested == "0" and not torch.cuda.is_available():
        raise ValueError("CUDA requested but unavailable; install a CUDA wheel or use --device cpu")
    return requested


def inference_device_info(model) -> tuple[str, str | None]:
    """Read the initialized predictor, which may own a copy of the original model."""
    device = torch.device(model.predictor.device)
    gpu = torch.cuda.get_device_name(device) if device.type == "cuda" else None
    return str(device), gpu


def run(source_path: Path, config: Config, output: Path, show=False, max_frames=None):
    # Refuse accidental replacement of previous results or source footage.
    output.mkdir(parents=True, exist_ok=False)
    writer = None
    frames = 0
    inference_ms = 0.0
    tracked_frames = 0
    ids = set()
    digest = hashlib.sha256()
    reason = "end_of_file"
    counter = None
    zones = []
    device = select_device(config.device)
    start = perf_counter()
    try:
        with VideoSource(source_path) as source:
            model = YOLO(config.model)
            if model.names.get(0) != "person":
                raise ValueError("Model class 0 must be person (COCO pretrained model).")
            # Real warm-up verifies CUDA kernels before processing the file.
            model.predict(np.zeros((config.imgsz, config.imgsz, 3), dtype=np.uint8),
                          device=device, imgsz=config.imgsz, verbose=False)
            actual_device, gpu = inference_device_info(model)
            print(f"Model device: {actual_device}; source FPS: {source.fps:.2f}")
            setup_seconds = perf_counter() - start
            processing_start = perf_counter()
            with (output / "tracks.jsonl").open("w", encoding="utf-8") as tracks, \
                    (output / "events.jsonl").open("w", encoding="utf-8") as events:
                for index, frame in source:
                    result = model.track(
                        frame, persist=True, tracker=config.tracker, classes=[0],
                        conf=config.confidence, iou=config.iou, imgsz=config.imgsz,
                        device=device, verbose=False,
                    )[0]
                    inference_ms += result.speed.get("inference", 0.0)
                    boxes = result.boxes
                    people = []
                    if boxes is not None:
                        xyxy = boxes.xyxy.cpu().tolist()
                        scores = boxes.conf.cpu().tolist()
                        track_ids = (
                            boxes.id.int().cpu().tolist() if boxes.is_track else [None] * len(boxes)
                        )
                        for box, score, track_id in zip(xyxy, scores, track_ids):
                            people.append({"id": track_id, "confidence": round(score, 5),
                                           "xyxy": [round(v, 2) for v in box]})
                            if track_id is not None:
                                ids.add(track_id)
                    tracked_frames += int(any(p["id"] is not None for p in people))
                    record = {"frame": index, "video_time_ms": round(index / source.fps * 1000, 3),
                              "people": people}
                    if config.zones:
                        if not zones:
                            height, width = frame.shape[:2]
                            zones = [ZoneMonitor(z, width, height) for z in config.zones]
                        for zone in zones:
                            for event in zone.update(index, record["video_time_ms"], people):
                                events.write(json.dumps(event, sort_keys=True) + "\n")
                        record["zone_occupancy"] = {z.config.name: z.stats["occupancy"] for z in zones}
                    if config.line is not None:
                        if counter is None:
                            height, width = frame.shape[:2]
                            counter = LineCounter(config.line, width, height)
                        for event in counter.update(index, record["video_time_ms"], people):
                            events.write(json.dumps(event, sort_keys=True) + "\n")
                    line = json.dumps(record, sort_keys=True)
                    tracks.write(line + "\n")
                    digest.update(line.encode())
                    annotated = result.plot()
                    frames += 1
                    elapsed = perf_counter() - processing_start
                    fps = frames / elapsed
                    overlay = f"Source {source.fps:.1f} FPS | Processing {fps:.1f} FPS"
                    cv2.putText(annotated, overlay,
                                (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
                    if counter is not None:
                        start_point = tuple(round(v) for v in counter.start)
                        end_point = tuple(round(v) for v in counter.end)
                        cv2.arrowedLine(annotated, start_point, end_point, (0, 255, 255), 2)
                        counts_text = " | ".join(f"{k}: {v}" for k, v in counter.counts.items())
                        cv2.putText(annotated, counts_text, (12, 56),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
                    for zone_index, zone in enumerate(zones):
                        vertices = np.array(zone.vertices).round().astype(np.int32)
                        cv2.polylines(annotated, [vertices], True, (0, 255, 0), 2)
                        zone_text = (f"{zone.config.name}: {zone.stats['occupancy']} | "
                                     f"Dwell: {zone.stats['dwell_events']}")
                        cv2.putText(annotated, zone_text, (12, 84 + zone_index * 28),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)
                    if writer is None:
                        height, width = annotated.shape[:2]
                        writer = cv2.VideoWriter(str(output / "annotated.mp4"),
                                                 cv2.VideoWriter_fourcc(*"mp4v"),
                                                 source.fps, (width, height))
                        if not writer.isOpened():
                            raise ValueError("Cannot create MP4 output; check OpenCV codec support")
                    writer.write(annotated)
                    if show:
                        cv2.imshow("ZoneLens - Q to stop", annotated)
                        if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                            reason = "user_stop"
                            break
                    if max_frames is not None and frames >= max_frames:
                        reason = "frame_limit"
                        break
            elapsed = perf_counter() - processing_start
            if reason == "end_of_file" and source.frame_count > 0 and frames < source.frame_count:
                reason = "decode_stopped_early"
                print("Warning: decoding stopped before the reported frame count.")
            summary = {
                "config": asdict(config), "device": actual_device,
                "gpu": gpu,
                "torch": torch.__version__, "ultralytics": ultralytics.__version__,
                "cuda_runtime": torch.version.cuda,
                "frames": frames, "reported_source_frames": source.frame_count,
                "source_fps": source.fps, "processing_fps": frames / elapsed,
                "mean_inference_ms": inference_ms / frames,
                "setup_seconds": setup_seconds, "processing_seconds": elapsed,
                "tracked_frames": tracked_frames, "unique_track_ids": len(ids),
                "tracks_sha256": digest.hexdigest(), "stop_reason": reason,
                "line_counts": dict(counter.counts) if counter is not None else None,
                "zones": {z.config.name: dict(z.stats) for z in zones},
            }
            (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
            print(json.dumps(summary, indent=2))
            return summary
    finally:
        if writer is not None:
            writer.release()
        if show:
            cv2.destroyAllWindows()
