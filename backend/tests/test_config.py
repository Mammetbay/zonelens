import pytest
from app.vision.config import Config


@pytest.mark.parametrize("values", [
    {"imgsz": 0}, {"imgsz": 641}, {"confidence": float("nan")},
    {"iou": 1.1}, {"device": "7"}, {"confidence": True},
])
def test_reject_invalid_inference_settings(values):
    with pytest.raises(ValueError):
        Config(**values)


def test_unknown_config_key_is_actionable(tmp_path):
    path = tmp_path / "invalid.toml"
    path.write_text("confidense = 0.5", encoding="utf-8")
    with pytest.raises(ValueError, match="Unknown configuration option"):
        Config.load(path)
