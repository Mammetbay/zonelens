import pytest
from app.vision.config import LineConfig
from app.vision.line_counter import LineCounter


def person(track_id, x, y):
    return {"id": track_id, "xyxy": [x - 5, y - 10, x + 5, y]}


def counter(**kwargs):
    return LineCounter(LineConfig(start=(0.2, 0.5), end=(0.8, 0.5), **kwargs), 101, 101)


def test_both_directions_and_repeated_crossings():
    rule = counter()
    assert rule.update(0, 0, [person(1, 50, 40)]) == []
    events = rule.update(1, 40, [person(1, 50, 60)])
    assert events == [{"type": "line_crossing", "frame": 1, "video_time_ms": 40,
                       "track_id": 1, "direction": "in", "point": [50, 60]}]
    assert rule.update(2, 80, [person(1, 50, 65)]) == []
    assert rule.update(3, 120, [person(1, 50, 40)])[0]["direction"] == "out"
    assert rule.update(4, 160, [person(1, 50, 60)])[0]["direction"] == "in"
    assert rule.counts == {"in": 2, "out": 1}


def test_deadband_filters_jitter_and_retains_previous_side():
    rule = counter()
    for frame, y in enumerate([40, 49, 51, 50, 52, 48]):
        assert rule.update(frame, frame * 40, [person(1, 50, y)]) == []
    assert len(rule.update(6, 240, [person(1, 50, 60)])) == 1


def test_starting_on_line_does_not_create_crossing():
    rule = counter()
    for frame, y in enumerate([50, 51, 60]):
        assert rule.update(frame, frame * 40, [person(1, 50, y)]) == []


@pytest.mark.parametrize("x", [10, 90])
def test_crossing_extension_is_not_counted(x):
    rule = counter()
    rule.update(0, 0, [person(1, x, 40)])
    assert rule.update(1, 40, [person(1, x, 60)]) == []
    assert rule.counts == {"in": 0, "out": 0}


def test_segment_intersection_uses_motion_path():
    rule = counter()
    rule.update(0, 0, [person(1, 10, 40)])
    assert len(rule.update(1, 40, [person(1, 50, 60)])) == 1


def test_missing_track_expiry_and_new_ids():
    rule = counter(max_gap_frames=2)
    rule.update(0, 0, [person(1, 50, 40)])
    rule.update(1, 40, [])
    assert len(rule.update(2, 80, [person(1, 50, 60)])) == 1
    rule.update(3, 120, [])
    rule.update(4, 160, [])
    assert rule.update(5, 200, [person(1, 50, 40), person(2, 50, 40)]) == []
    assert rule.counts == {"in": 1, "out": 0}
    rule.update(8, 320, [])
    assert rule.states == {}


def test_untracked_detections_do_not_count():
    rule = counter()
    rule.update(0, 0, [person(None, 50, 40)])
    assert rule.update(1, 40, [person(None, 50, 60)]) == []
    assert rule.states == {}


def test_vertical_line_reversed_endpoints_and_custom_labels():
    settings = {"start": (0.5, 0.2), "end": (0.5, 0.8),
                "positive_label": "left", "negative_label": "right"}
    rule = LineCounter(LineConfig(**settings), 101, 101)
    rule.update(0, 0, [person(1, 60, 50)])
    assert rule.update(1, 40, [person(1, 40, 50)])[0]["direction"] == "left"
    settings.update(start=(0.5, 0.8), end=(0.5, 0.2))
    reverse = LineCounter(LineConfig(**settings), 101, 101)
    reverse.update(0, 0, [person(1, 60, 50)])
    assert reverse.update(1, 40, [person(1, 40, 50)])[0]["direction"] == "right"


def test_multiple_people_are_counted_independently():
    rule = counter()
    rule.update(0, 0, [person(1, 40, 40), person(2, 60, 60)])
    assert len(rule.update(1, 40, [person(1, 40, 60), person(2, 60, 40)])) == 2
    assert rule.counts == {"in": 1, "out": 1}
