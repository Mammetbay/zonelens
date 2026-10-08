import json
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
import torch
from app.vision.config import Config, LineConfig, ZoneConfig
from app.vision.pipeline import inference_device_info, run


def test_device_comes_from_predictor_copy(monkeypatch):
    # The original model stays on CPU while inference uses a separate CUDA copy.
    model = SimpleNamespace(
        model=torch.nn.Linear(1, 1),
        predictor=SimpleNamespace(device=torch.device("cuda:0")),
    )
    queried = []

    def gpu_name(device):
        queried.append(device)
        return "Test GPU"

    monkeypatch.setattr(torch.cuda, "get_device_name", gpu_name)
    assert inference_device_info(model) == ("cuda:0", "Test GPU")
    assert queried == [torch.device("cuda:0")]


def test_cpu_predictor_does_not_report_gpu(monkeypatch):
    model = SimpleNamespace(predictor=SimpleNamespace(device="cpu"))

    def unexpected_gpu_lookup(device):
        raise AssertionError("CPU inference must not query a GPU")

    monkeypatch.setattr(torch.cuda, "get_device_name", unexpected_gpu_lookup)
    assert inference_device_info(model) == ("cpu", None)


@pytest.mark.parametrize("enabled", [True, False])
@pytest.mark.parametrize("zones_enabled", [True, False])
def test_pipeline_writes_crossings_and_playable_video(tmp_path, monkeypatch, enabled, zones_enabled):
    source = tmp_path / "input.avi"
    writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"MJPG"), 10, (100, 100))
    assert writer.isOpened()
    for _ in range(3):
        writer.write(np.zeros((100, 100, 3), dtype=np.uint8))
    writer.release()

    class FakeModel:
        def __init__(self, *_):
            self.index = 0
            self.names = {0: "person"}
            self.predictor = SimpleNamespace(device="cpu")

        def predict(self, *_args, **_kwargs):
            pass

        def track(self, frame, **_kwargs):
            bottom = [40, 60, 65][self.index]
            self.index += 1
            boxes = SimpleNamespace(xyxy=torch.tensor([[40, 20, 60, bottom]]),
                                    conf=torch.tensor([0.9]), id=torch.tensor([7]), is_track=True)
            return [SimpleNamespace(boxes=boxes, speed={"inference": 1}, plot=frame.copy)]

    monkeypatch.setattr("app.vision.pipeline.YOLO", FakeModel)
    output = tmp_path / "result"
    zone = ZoneConfig(name="test", vertices=((0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)),
                      dwell_seconds=0.05)
    summary = run(source, Config(device="cpu", line=LineConfig() if enabled else None,
                                zones=(zone,) if zones_enabled else ()), output)
    records = [json.loads(line) for line in (output / "tracks.jsonl").read_text().splitlines()]
    events = [json.loads(line) for line in (output / "events.jsonl").read_text().splitlines()]
    assert len(records) == 3
    assert summary["frames"] == 3
    assert summary["stop_reason"] == "end_of_file"
    assert json.loads((output / "summary.json").read_text()) == json.loads(json.dumps(summary))
    crossings = [e for e in events if e["type"] == "line_crossing"]
    zone_events = [e for e in events if e["type"].startswith("zone_")]
    if enabled:
        assert summary["line_counts"] == {"in": 1, "out": 0}
        assert len(crossings) == 1
        assert crossings[0]["track_id"] == 7
        assert crossings[0]["frame"] == 1
        assert crossings[0]["video_time_ms"] == 100
        assert crossings[0]["direction"] == "in"
    else:
        assert summary["line_counts"] is None
        assert crossings == []
    if zones_enabled:
        assert [e["type"] for e in zone_events] == ["zone_enter", "zone_dwell"]
        assert zone_events[1]["duration_ms"] == 100
        assert summary["zones"]["test"] == {"occupancy": 1, "peak_occupancy": 1,
                                            "entries": 1, "exits": 0, "dwell_events": 1}
        assert all(r["zone_occupancy"] == {"test": 1} for r in records)
    else:
        assert summary["zones"] == {}
        assert zone_events == []
        assert all("zone_occupancy" not in r for r in records)
    capture = cv2.VideoCapture(str(output / "annotated.mp4"))
    try:
        assert capture.isOpened()
        assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 3
        assert capture.read()[0]
    finally:
        capture.release()
