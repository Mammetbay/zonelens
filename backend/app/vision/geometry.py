"""Small polygon helpers in image coordinates, with boundary points included."""


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a, b, p):
    return (abs(cross(a, b, p)) <= 1e-12
            and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def segments_intersect(a, b, c, d):
    values = cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)
    if values[0] * values[1] < 0 and values[2] * values[3] < 0:
        return True
    return any(on_segment(*args) for args in [(a, b, c), (a, b, d), (c, d, a), (c, d, b)])


def validate_polygon(points):
    if len(set(points)) != len(points):
        raise ValueError("zone vertices must be distinct; do not repeat the first vertex")
    edges = list(zip(points, points[1:] + points[:1]))
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in edges)
    if abs(area) <= 1e-12:
        raise ValueError("zone polygon must have nonzero area")
    for index, (a, b) in enumerate(edges):
        # Adjacent edges must not backtrack and overlap.
        c = points[(index + 2) % len(points)]
        if on_segment(a, b, c) or on_segment(b, c, a):
            raise ValueError("zone polygon edges must not overlap")
        for other in range(index + 1, len(edges)):
            if other == index + 1 or (index == 0 and other == len(edges) - 1):
                continue
            if segments_intersect(a, b, *edges[other]):
                raise ValueError("zone polygon must not intersect itself")


def contains_point(points, point):
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        if on_segment(a, b, point):
            return True
        if (a[1] > point[1]) != (b[1] > point[1]):
            intersection_x = a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if point[0] < intersection_x:
                inside = not inside
    return inside
