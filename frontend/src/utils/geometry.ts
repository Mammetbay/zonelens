/**
 * Geometry and coordinate transformation utilities for ZoneLens.
 *
 * Handles:
 * - Normalized [0, 1] coordinate clamping and precision
 * - Letterbox-aware coordinate mapping between canvas pixels and video frame
 * - Line length and distance calculations
 * - Polygon validity checks (minimum vertices, non-degeneracy)
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = [number, number];

/**
 * Calculates the exact rendered video rectangle inside a container
 * when using CSS object-fit: contain.
 */
export function calculateRenderedVideoRect(
  containerWidth: number,
  containerHeight: number,
  videoAspect: number = 16 / 9
): Rect {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const containerAspect = containerWidth / containerHeight;

  let width = containerWidth;
  let height = containerHeight;
  let x = 0;
  let y = 0;

  if (containerAspect > videoAspect) {
    // Container is wider than video -> pillarboxing (bars on left/right)
    width = containerHeight * videoAspect;
    x = (containerWidth - width) / 2;
  } else {
    // Container is taller than video -> letterboxing (bars on top/bottom)
    height = containerWidth / videoAspect;
    y = (containerHeight - height) / 2;
  }

  return { x, y, width, height };
}

/**
 * Converts mouse/client event coordinates to normalized [0, 1] video frame coordinates,
 * taking into account potential letterbox/pillarbox padding.
 */
export function clientToNormalizedVideo(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  videoRect: Rect
): Point {
  if (videoRect.width <= 0 || videoRect.height <= 0) {
    return [0, 0];
  }

  const canvasX = clientX - canvasRect.left;
  const canvasY = clientY - canvasRect.top;

  // Relative to the actual video frame
  const relX = (canvasX - videoRect.x) / videoRect.width;
  const relY = (canvasY - videoRect.y) / videoRect.height;

  // Clamp to [0, 1] range and round to 4 decimal places
  const clampedX = Math.max(0, Math.min(1, Math.round(relX * 10000) / 10000));
  const clampedY = Math.max(0, Math.min(1, Math.round(relY * 10000) / 10000));

  return [clampedX, clampedY];
}

/**
 * Converts normalized [0, 1] video coordinates to canvas pixel coordinates.
 */
export function normalizedToCanvasPixels(
  normPoint: Point,
  videoRect: Rect
): Point {
  return [
    videoRect.x + normPoint[0] * videoRect.width,
    videoRect.y + normPoint[1] * videoRect.height,
  ];
}

/**
 * Euclidean distance between two points.
 */
export function pointDistance(p1: Point, p2: Point): number {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

/**
 * Checks if a line segment has a minimum required length to avoid zero-length lines.
 */
export function isValidLineSegment(start: Point, end: Point, minDistance: number = 0.02): boolean {
  return pointDistance(start, end) >= minDistance;
}

/**
 * Checks if a polygon is valid (at least 3 vertices and non-degenerate).
 */
export function isValidPolygon(vertices: Point[]): boolean {
  if (!vertices || vertices.length < 3) return false;

  // Ensure vertices aren't all practically identical
  let totalDist = 0;
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    totalDist += pointDistance(vertices[i], vertices[next]);
  }

  return totalDist > 0.05;
}
