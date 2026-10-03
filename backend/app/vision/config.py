"""Validated, deliberately small inference configuration."""

from dataclasses import dataclass
from pathlib import Path
import tomllib


@dataclass(frozen=True)
class Config:
    model: str = "yolo11n.pt"
    device: str = "auto"
    imgsz: int = 640
    confidence: float = 0.10
    iou: float = 0.70
    tracker: str = "bytetrack.yaml"

    def __post_init__(self):
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
