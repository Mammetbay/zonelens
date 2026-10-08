import pytest
from app.vision.config import ZoneConfig
from app.vision.geometry import contains_point
from app.vision.zone_monitor import ZoneMonitor

SQUARE = ((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8))


def person(track_id=1, x=50, y=50):
    return {"id": track_id, "xyxy": [x - 5, y - 10, x + 5, y]}


def monitor(**kwargs):
    return ZoneMonitor(ZoneConfig(name="test", vertices=SQUARE, **kwargs), 101, 101)


def test_entry_dwell_once_exit_and_reentry():
    rule = monitor(dwell_seconds=1)
    assert rule.update(0, 0, [person(y=10)]) == []
    assert rule.update(1, 100, [person()])[0]["type"] == "zone_enter"
    assert rule.update(2, 1099, [person()]) == []
    assert rule.update(3, 1100, [person()]) == [
        {"type": "zone_dwell", "zone": "test", "track_id": 1, "frame": 3,
         "video_time_ms": 1100, "duration_ms": 1000}]
    assert rule.update(4, 1500, [person()]) == []
    exit_event = rule.update(5, 1600, [person(y=90)])[0]
    assert exit_event["type"] == "zone_exit"
    assert exit_event["reason"] == "outside"
    assert exit_event["duration_ms"] == 1500
    assert rule.stats["occupancy"] == 0
    assert rule.update(6, 1700, [person()])[0]["type"] == "zone_enter"
    assert rule.update(7, 2700, [person()])[0]["type"] == "zone_dwell"
    assert rule.stats == {"occupancy": 1, "peak_occupancy": 1, "entries": 2,
                          "exits": 1, "dwell_events": 2}


def test_short_gap_preserves_visit_but_not_visible_occupancy():
    rule = monitor(dwell_seconds=1, max_gap_frames=2)
    rule.update(0, 0, [person()])
    assert rule.update(1, 500, []) == []
    assert rule.stats["occupancy"] == 0
    assert rule.update(2, 1000, [person()])[0]["type"] == "zone_dwell"
    assert rule.stats["entries"] == 1


def test_lost_track_exits_without_inventing_dwell_and_restarts():
    rule = monitor(dwell_seconds=1, max_gap_frames=2)
    rule.update(0, 0, [person()])
    rule.update(1, 100, [person()])
    assert rule.update(2, 1000, []) == []
    assert rule.update(3, 2000, []) == []
    event = rule.update(4, 3000, [])[0]
    assert event["type"] == "zone_exit"
    assert event["reason"] == "track_lost"
    assert event["duration_ms"] == 100
    assert rule.visits == {}
    assert rule.stats["dwell_events"] == 0
    assert rule.update(5, 3100, [person()])[0]["type"] == "zone_enter"


def test_multiple_people_unknown_ids_and_overlapping_zones():
    first, second = monitor(), monitor()
    people = [person(1), person(2), person(None)]
    assert len(first.update(0, 0, people)) == 2
    assert len(second.update(0, 0, people)) == 2
    assert first.stats["occupancy"] == 2
    assert first.stats["peak_occupancy"] == 2
    first.update(1, 100, [person(1)])
    assert first.stats["occupancy"] == 1
    assert first.stats["peak_occupancy"] == 2


@pytest.mark.parametrize("point, inside", [
    ((0, 0), True), ((2, 2), False), ((0, 1), True), ((1, 0), True),
    ((0.5, 1.5), True), ((1.5, 0.5), True), ((1.5, 1.5), False), ((3, 1), False),
])
def test_concave_polygon_and_boundary(point, inside):
    polygon = ((0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2))
    assert contains_point(polygon, point) is inside
    assert contains_point(tuple(reversed(polygon)), point) is inside
