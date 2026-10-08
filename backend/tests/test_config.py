import pytest
from app.vision.config import Config, LineConfig


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


def test_load_line_table(tmp_path):
    path = tmp_path / "line.toml"
    path.write_text('[line]\nstart = [0.1, 0.5]\nend = [0.9, 0.5]\n'
                    'positive_label = "entry"\nnegative_label = "exit"\n', encoding="utf-8")
    config = Config.load(path)
    assert config.line == LineConfig(positive_label="entry", negative_label="exit")
    assert Config().line is None


@pytest.mark.parametrize("values", [
    {"start": [0.5]}, {"start": [True, 0.5]}, {"end": [1.1, 0.5]},
    {"end": [float("nan"), 0.5]}, {"start": [0.9, 0.5]},
    {"hysteresis_px": -1}, {"hysteresis_px": float("inf")},
    {"max_gap_frames": 0}, {"max_gap_frames": True},
    {"positive_label": "out"}, {"negative_label": " "},
])
def test_reject_invalid_line_settings(values):
    with pytest.raises(ValueError):
        LineConfig(**values)


def test_unknown_line_setting():
    with pytest.raises(ValueError, match="Unknown line configuration option"):
        Config(line={"unknown": 1})
