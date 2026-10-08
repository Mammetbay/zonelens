"""Finite line crossing rules, independent of inference and video rendering."""

from dataclasses import dataclass
from math import hypot

from app.vision.config import LineConfig


@dataclass
class TrackState:
    point: tuple[float, float]
    side: int
    last_seen: int


class LineCounter:
    def __init__(self, config: LineConfig, width: int, height: int):
        self.config = config
        self.start = (config.start[0] * (width - 1), config.start[1] * (height - 1))
        self.end = (config.end[0] * (width - 1), config.end[1] * (height - 1))
        self.dx = self.end[0] - self.start[0]
        self.dy = self.end[1] - self.start[1]
        self.length = hypot(self.dx, self.dy)
        if self.length == 0:
            raise ValueError("Counting line has zero length at this video resolution")
        self.states: dict[int, TrackState] = {}
        self.counts = {config.positive_label: 0, config.negative_label: 0}

    def _distance(self, point):
        return (self.dx * (point[1] - self.start[1])
                - self.dy * (point[0] - self.start[0])) / self.length

    def _crosses_segment(self, previous, current):
        d0, d1 = self._distance(previous), self._distance(current)
        fraction = d0 / (d0 - d1)
        intersection = (previous[0] + fraction * (current[0] - previous[0]),
                        previous[1] + fraction * (current[1] - previous[1]))
        projection = ((intersection[0] - self.start[0]) * self.dx
                      + (intersection[1] - self.start[1]) * self.dy) / self.length**2
        return 0 <= projection <= 1

    def update(self, frame: int, video_time_ms: float, people: list[dict]) -> list[dict]:
        """Count stable side changes of the box foot point; expire stale track IDs."""
        self.states = {key: state for key, state in self.states.items()
                       if frame - state.last_seen <= self.config.max_gap_frames}
        events = []
        for person in people:
            track_id = person["id"]
            if track_id is None:
                continue
            x1, _, x2, y2 = person["xyxy"]
            point = ((x1 + x2) / 2, y2)
            distance = self._distance(point)
            side = (1 if distance > self.config.hysteresis_px else
                    -1 if distance < -self.config.hysteresis_px else 0)
            previous = self.states.get(track_id)
            if side == 0:
                if previous is not None:
                    previous.last_seen = frame
                continue
            if (previous is not None and previous.side != side
                    and self._crosses_segment(previous.point, point)):
                direction = (self.config.positive_label if side > 0
                             else self.config.negative_label)
                self.counts[direction] += 1
                events.append({"type": "line_crossing", "frame": frame,
                               "video_time_ms": video_time_ms, "track_id": track_id,
                               "direction": direction, "point": list(point)})
            self.states[track_id] = TrackState(point, side, frame)
        return events
