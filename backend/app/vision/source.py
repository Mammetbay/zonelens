"""Sequential file decoding with explicit resource ownership."""

import math
from pathlib import Path

import cv2


class VideoSource:
    def __init__(self, path: Path):
        if not path.is_file():
            raise ValueError(f"Video file does not exist: {path}")
        self.capture = cv2.VideoCapture(str(path))
        if not self.capture.isOpened():
            self.capture.release()
            raise ValueError(f"Cannot open video: {path}")
        self.fps = self.capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(self.fps) or self.fps <= 0:
            self.capture.release()
            raise ValueError("Video has no valid FPS metadata; convert it to constant frame rate.")
        self.frame_count = int(self.capture.get(cv2.CAP_PROP_FRAME_COUNT))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.capture.release()

    def __iter__(self):
        index = 0
        while True:
            ok, frame = self.capture.read()
            if not ok:
                if index == 0:
                    raise ValueError("Video contains no decodable frames.")
                return
            yield index, frame
            index += 1
