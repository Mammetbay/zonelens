import cv2
import numpy as np
import pytest
from app.vision.source import VideoSource, classify_source, open_video_capture


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


def test_classify_source_webcam():
    info = classify_source("0")
    assert info["type"] == "webcam"
    assert info["is_live"] is True
    assert info["target"] == 0

    info_int = classify_source(1)
    assert info_int["type"] == "webcam"
    assert info_int["is_live"] is True
    assert info_int["target"] == 1


def test_classify_source_network():
    rtsp_info = classify_source("rtsp://admin:12345@192.168.1.64:554/live")
    assert rtsp_info["type"] == "network"
    assert rtsp_info["is_live"] is True

    http_info = classify_source("http://192.168.1.50:8080/video")
    assert http_info["type"] == "network"
    assert http_info["is_live"] is True

    # Test raw mobile streaming inputs without scheme or endpoint
    ipwebcam_raw = classify_source("192.168.1.50:8080")
    assert ipwebcam_raw["type"] == "network"
    assert ipwebcam_raw["target"] == "http://192.168.1.50:8080/video"

    droidcam_raw = classify_source("192.168.1.50:4747")
    assert droidcam_raw["type"] == "network"
    assert droidcam_raw["target"] == "http://192.168.1.50:4747/video"

    rtsp_raw = classify_source("192.168.1.50:554/ch1")
    assert rtsp_raw["type"] == "network"
    assert rtsp_raw["target"] == "rtsp://192.168.1.50:554/ch1"


def test_classify_source_file(tmp_path):
    video_file = tmp_path / "test.mp4"
    info = classify_source(str(video_file))
    assert info["type"] == "file"
    assert info["is_live"] is False
    assert info["target"] == video_file


def test_open_video_capture_file(tmp_path):
    video_path = tmp_path / "valid.avi"
    make_video(video_path)
    cap, is_live = open_video_capture(str(video_path))
    assert is_live is False
    assert cap.isOpened()
    cap.release()


def test_open_video_capture_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        open_video_capture(str(tmp_path / "does_not_exist.mp4"))

