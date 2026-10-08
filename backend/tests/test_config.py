import pytest
from app.vision.config import Config, LineConfig, ZoneConfig


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


def test_load_multiple_zones(tmp_path):
    path = tmp_path / "zones.toml"
    path.write_text('[[zones]]\nname = "one"\nvertices = [[0,0], [1,0], [1,1]]\n'
                    '[[zones]]\nname = "two"\nvertices = [[0,0], [1,0], [1,1]]\n'
                    'dwell_seconds = 2\n', encoding="utf-8")
    config = Config.load(path)
    assert [z.name for z in config.zones] == ["one", "two"]
    assert config.zones[1].dwell_seconds == 2
    assert Config().zones == ()


@pytest.mark.parametrize("values", [
    {"name": " "}, {"vertices": [[0, 0], [1, 1]]},
    {"vertices": [[0, 0], [1, 0], [float("nan"), 1]]},
    {"vertices": [[0, 0], [1, 0], [1, 1.1]]},
    {"vertices": [[0, 0], [1, 0], [True, 1]]},
    {"vertices": [[0, 0], [1, 0], [1, 1], [0, 0]]},
    {"vertices": [[0, 0], [0.5, 0.5], [1, 1]]},
    {"vertices": [[0, 0], [1, 1], [0, 1], [1, 0]]},
    {"vertices": [[0, 0], [1, 0], [0.5, 0], [0.5, 1], [0, 1]]},
    {"dwell_seconds": 0}, {"dwell_seconds": float("inf")}, {"dwell_seconds": True},
    {"max_gap_frames": 0}, {"max_gap_frames": 1.5},
])
def test_reject_invalid_zone_settings(values):
    settings = {"name": "test", "vertices": [[0, 0], [1, 0], [1, 1]], **values}
    with pytest.raises(ValueError):
        ZoneConfig(**settings)


def test_zone_names_are_unique_and_unknown_keys_rejected():
    zone = ZoneConfig(name="test", vertices=((0, 0), (1, 0), (1, 1)))
    with pytest.raises(ValueError, match="unique"):
        Config(zones=[zone, zone])
    with pytest.raises(ValueError, match="Invalid zone configuration option"):
        Config(zones=[{"name": "test", "vertices": zone.vertices, "unknown": 1}])
    with pytest.raises(ValueError, match="tables"):
        Config(zones=["test"])
