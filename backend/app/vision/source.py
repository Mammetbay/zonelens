"""Sequential and live video source decoding with universal camera and stream support."""

import math
import os
import re
from pathlib import Path
from typing import Any

import cv2

NETWORK_TIMEOUT_MS = 5000


def _redact(url: str) -> str:
    """Hide credentials (user:pass@) in stream URLs before logging or returning errors."""
    return re.sub(r"(://)[^/@]+@", r"\1***@", url)


def normalize_source_url(source: str | int | Path) -> str:
    """Intelligently normalizes video source strings, especially phone camera streams.

    Handles:
    - Raw IP addresses and ports (e.g. '192.168.1.50:8080' -> 'http://192.168.1.50:8080/video')
    - IP Webcam apps without path (e.g. 'http://192.168.1.50:8080' -> 'http://192.168.1.50:8080/video')
    - DroidCam WiFi apps without path (e.g. 'http://192.168.1.50:4747' -> 'http://192.168.1.50:4747/video')
    - RTSP port hints (e.g. '192.168.1.50:554/live' -> 'rtsp://192.168.1.50:554/live')
    """
    src_str = str(source).strip()
    if not src_str:
        return src_str

    # Pure webcam index like "0", "1"
    if src_str.isdigit():
        return src_str

    # Check for IP or hostname with port pattern without scheme
    # e.g., 192.168.1.50:8080 or 10.0.0.5:4747 or myphone:8080
    ip_or_host_pattern = (
        r"^(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3}|localhost|[a-zA-Z0-9_\-]+)(?::[0-9]+)(?:/.*)?$"
    )
    if re.match(ip_or_host_pattern, src_str, re.IGNORECASE) and not src_str.lower().startswith(
        ("http://", "https://", "rtsp://", "rtsps://")
    ):
        if ":554" in src_str or ":8554" in src_str:
            src_str = f"rtsp://{src_str}"
        else:
            src_str = f"http://{src_str}"

    # Auto-append endpoint for well-known mobile streaming camera apps if user omitted path
    # IP Webcam (:8080) and DroidCam (:4747) both stream MJPEG at /video
    if re.match(r"^https?://[^/]+:(?:8080|4747)/?$", src_str, re.IGNORECASE):
        src_str = src_str.rstrip("/") + "/video"

    return src_str


def classify_source(source: str | int | Path) -> dict[str, Any]:
    """Classifies any video source into 'webcam', 'network', or 'file'."""
    src_str = str(source).strip()
    if isinstance(source, int) or (src_str.isdigit() and not Path(src_str).is_file()):
        return {
            "type": "webcam",
            "is_live": True,
            "target": int(src_str),
            "display_name": f"Camera Device #{src_str}",
        }

    normalized = normalize_source_url(src_str)
    if normalized.lower().startswith(("rtsp://", "rtsps://", "http://", "https://")):
        return {
            "type": "network",
            "is_live": True,
            "target": normalized,
            "display_name": f"Network Stream ({_redact(normalized)})",
        }

    path = Path(src_str)
    return {
        "type": "file",
        "is_live": False,
        "target": path,
        "display_name": path.name,
    }


def open_video_capture(source: str | int | Path) -> tuple[cv2.VideoCapture, bool]:
    """Universal capture opener supporting webcams (USB/virtual), network streams (RTSP/HTTP),
    and local recorded files.

    Returns:
        tuple[cv2.VideoCapture, bool]: Opened capture and a boolean indicating whether the source is live.
    """
    info = classify_source(source)
    is_live = bool(info["is_live"])

    if info["type"] == "webcam":
        idx = info["target"]
        cap = None
        # On Windows, DirectShow backend provides fast, reliable opening for USB/virtual webcams
        if os.name == "nt":
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        if (cap is None or not cap.isOpened()) and os.name == "nt":
            cap = cv2.VideoCapture(idx, cv2.CAP_MSMF)
        if cap is None or not cap.isOpened():
            cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            cap.release()
            raise RuntimeError(
                f"Failed to open camera device #{idx}. Ensure camera or mobile client "
                "(DroidCam, Iriun, Camo) is active and not opened in another application."
            )
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap, is_live

    if info["type"] == "network":
        url = info["target"]
        if url.lower().startswith(("rtsp://", "rtsps://")):
            # Enforce TCP transport for RTSP to prevent packet corruption and artifacts
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        else:
            # Avoid carrying over RTSP options to HTTP MJPEG sessions
            os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)

        # Fail fast instead of waiting for FFmpeg's long default timeout
        timeout_params = [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, NETWORK_TIMEOUT_MS,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC, NETWORK_TIMEOUT_MS,
        ]
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG, timeout_params)
        if not cap.isOpened():
            # Fallback 1: CAP_ANY (standard backend without forced FFMPEG)
            cap.release()
            cap = cv2.VideoCapture(url)

        # Fallback 2: If IP Webcam was provided with /video and failed, try /videofeed or vice versa
        if not cap.isOpened() and ":8080" in url:
            alt_url = None
            if url.endswith("/video"):
                alt_url = url[:-6] + "/videofeed"
            elif url.endswith("/videofeed"):
                alt_url = url[:-10] + "/video"
            if alt_url:
                cap.release()
                cap = cv2.VideoCapture(alt_url, cv2.CAP_FFMPEG, timeout_params)
                if not cap.isOpened():
                    cap.release()
                    cap = cv2.VideoCapture(alt_url)

        # Fallback 3: DroidCam (:4747) supports both /video and /mjpegfeed (with optional resolution)
        if not cap.isOpened() and ":4747" in url:
            droid_base = url.split(":4747")[0] + ":4747"
            droid_endpoints = ["/mjpegfeed", "/video", "/mjpegfeed?640x480", "/videofeed"]
            for ep in droid_endpoints:
                test_url = droid_base + ep
                if test_url == url:
                    continue
                cap.release()
                cap = cv2.VideoCapture(test_url, cv2.CAP_FFMPEG, timeout_params)
                if not cap.isOpened():
                    cap.release()
                    cap = cv2.VideoCapture(test_url)
                if cap.isOpened():
                    break

        if not cap.isOpened():
            cap.release()
            raise RuntimeError(
                f"Cannot reach network stream {_redact(url)} within "
                f"{NETWORK_TIMEOUT_MS // 1000}s. Check that the phone app (DroidCam / IP Webcam) "
                "is open on screen, that phone and PC are on the same Wi-Fi, and that the IP/port "
                "matches (e.g. http://192.168.1.XX:4747/video or /mjpegfeed)."
            )
        # Low buffer size keeps preview real-time
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap, is_live

    # File source
    path = info["target"]
    if not path.is_file():
        raise FileNotFoundError(f"Video file does not exist: {path}")
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        cap.release()
        raise RuntimeError(f"Cannot open video file: {path}")
    return cap, is_live


def list_available_cameras(max_probe: int = 6) -> list[dict[str, Any]]:
    """Probes local webcam/virtual camera indices (e.g. built-in, USB webcam, DroidCam, Iriun)."""
    devices: list[dict[str, Any]] = []
    for idx in range(max_probe):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY)
        if not cap.isOpened() and os.name == "nt":
            cap = cv2.VideoCapture(idx, cv2.CAP_MSMF)
        if cap.isOpened():
            ok, _ = cap.read()
            cap.release()
            if ok:
                devices.append({
                    "index": idx,
                    "name": f"Camera Device #{idx}",
                })
    return devices


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

