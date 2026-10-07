import cv2
import numpy as np
import pytest
from app.vision.source import VideoSource


def make_video(path):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10, (64, 48))
    assert writer.isOpened()
    for _ in range(5):
        writer.write(np.zeros((48, 64, 3), dtype=np.uint8))
    writer.release()


def test_reads_to_eof_and_releases(tmp_path):
    path = tmp_path / "sample.avi"
    make_video(path)
    with VideoSource(path) as source:
        assert [index for index, _ in source] == list(range(5))
        assert source.fps == pytest.approx(10)
    assert not source.capture.isOpened()


def test_releases_on_consumer_failure(tmp_path):
    path = tmp_path / "sample.avi"
    make_video(path)
    with pytest.raises(RuntimeError), VideoSource(path) as source:
        next(iter(source))
        raise RuntimeError("inference failed")
    assert not source.capture.isOpened()


def test_missing_video(tmp_path):
    with pytest.raises(ValueError, match="does not exist"):
        VideoSource(tmp_path / "missing.mp4")
