"""Validated, deliberately small inference configuration."""

import math
import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LineConfig:
    """Directed segment in normalized image coordinates; optional counting rule."""

    start: tuple[float, float] = (0.1, 0.5)
    end: tuple[float, float] = (0.9, 0.5)
    positive_label: str = "in"
    negative_label: str = "out"
    hysteresis_px: float = 3.0
    max_gap_frames: int = 5

    def __post_init__(self):
        for name in ("start", "end"):
            point = getattr(self, name)
            if (not isinstance(point, (list, tuple)) or len(point) != 2
                    or any(type(v) not in (int, float) or not math.isfinite(v)
                           or not 0 <= v <= 1 for v in point)):
                raise ValueError(f"line.{name} must contain two normalized coordinates in [0, 1]")
            object.__setattr__(self, name, tuple(point))
        if self.start == self.end:
            raise ValueError("line endpoints must differ")
        for name in ("positive_label", "negative_label"):
            if not isinstance(getattr(self, name), str) or not getattr(self, name).strip():
                raise ValueError(f"line.{name} must be a nonempty string")
        if self.positive_label == self.negative_label:
            raise ValueError("line direction labels must differ")
        if (type(self.hysteresis_px) not in (int, float)
                or not math.isfinite(self.hysteresis_px) or self.hysteresis_px < 0):
            raise ValueError("line.hysteresis_px must be finite and nonnegative")
        if type(self.max_gap_frames) is not int or self.max_gap_frames < 1:
            raise ValueError("line.max_gap_frames must be a positive integer")


@dataclass(frozen=True)
class Config:
    model: str = "yolo11n.pt"
    device: str = "auto"
    imgsz: int = 640
    confidence: float = 0.10
    iou: float = 0.70
    tracker: str = "bytetrack.yaml"
    line: LineConfig | None = None

    def __post_init__(self):
        if isinstance(self.line, dict):
            try:
                object.__setattr__(self, "line", LineConfig(**self.line))
            except TypeError as exc:
                raise ValueError(f"Unknown line configuration option: {exc}") from exc
        elif self.line is not None and not isinstance(self.line, LineConfig):
            raise ValueError("line must be a TOML table")
        if not isinstance(self.model, str) or not self.model.endswith(".pt"):
            raise ValueError("model must name a COCO YOLO .pt model")
        if self.device not in ("auto", "cpu", "0"):
            raise ValueError("device must be auto, cpu, or 0")
        if type(self.imgsz) is not int or self.imgsz < 32 or self.imgsz % 32:
            raise ValueError("imgsz must be a positive multiple of 32")
        for name in ("confidence", "iou"):
            value = getattr(self, name)
            if type(value) not in (float, int) or not 0 < value <= 1:
                raise ValueError(f"{name} must be in (0, 1]")
        if self.tracker != "bytetrack.yaml":
            raise ValueError("This prototype supports bytetrack.yaml only")

    @classmethod
    def load(cls, path: Path | None):
        if path is None:
            return cls()
        with path.open("rb") as stream:
            values = tomllib.load(stream)
        try:
            return cls(**values)
        except TypeError as exc:
            raise ValueError(f"Unknown configuration option: {exc}") from exc
