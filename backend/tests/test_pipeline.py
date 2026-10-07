from types import SimpleNamespace

import torch
from app.vision.pipeline import inference_device_info


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
