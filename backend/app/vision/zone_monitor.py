"""Observed occupancy and one dwell alert per tracked visit to a polygon."""

from dataclasses import dataclass

from app.vision.config import ZoneConfig
from app.vision.geometry import contains_point


@dataclass
class Visit:
    entered_ms: float
    last_seen_frame: int
    last_seen_ms: float
    alerted: bool = False


class ZoneMonitor:
    def __init__(self, config: ZoneConfig, width: int, height: int):
        self.config = config
        self.vertices = tuple((x * (width - 1), y * (height - 1)) for x, y in config.vertices)
        self.visits: dict[int, Visit] = {}
        self.stats = {"occupancy": 0, "peak_occupancy": 0, "entries": 0,
                      "exits": 0, "dwell_events": 0}

    def update(self, frame: int, video_time_ms: float, people: list[dict]) -> list[dict]:
        events = []

        def event(kind, track_id, **details):
            events.append({"type": kind, "zone": self.config.name, "track_id": track_id,
                           "frame": frame, "video_time_ms": video_time_ms, **details})

        for track_id, visit in list(self.visits.items()):
            if frame - visit.last_seen_frame > self.config.max_gap_frames:
                event("zone_exit", track_id, reason="track_lost",
                      duration_ms=round(visit.last_seen_ms - visit.entered_ms, 3))
                self.stats["exits"] += 1
                del self.visits[track_id]

        occupancy = 0
        for person in people:
            track_id = person["id"]
            if track_id is None:
                continue
            x1, _, x2, y2 = person["xyxy"]
            point = ((x1 + x2) / 2, y2)
            visit = self.visits.get(track_id)
            if not contains_point(self.vertices, point):
                if visit is not None:
                    event("zone_exit", track_id, reason="outside",
                          duration_ms=round(video_time_ms - visit.entered_ms, 3))
                    self.stats["exits"] += 1
                    del self.visits[track_id]
                continue
            occupancy += 1
            if visit is None:
                visit = Visit(video_time_ms, frame, video_time_ms)
                self.visits[track_id] = visit
                self.stats["entries"] += 1
                event("zone_enter", track_id, point=list(point))
            visit.last_seen_frame = frame
            visit.last_seen_ms = video_time_ms
            duration_ms = video_time_ms - visit.entered_ms
            if not visit.alerted and duration_ms >= self.config.dwell_seconds * 1000:
                visit.alerted = True
                self.stats["dwell_events"] += 1
                event("zone_dwell", track_id, duration_ms=round(duration_ms, 3))
        self.stats["occupancy"] = occupancy
        self.stats["peak_occupancy"] = max(self.stats["peak_occupancy"], occupancy)
        return events
