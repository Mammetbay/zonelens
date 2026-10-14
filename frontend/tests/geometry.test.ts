import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRenderedVideoRect,
  clientToNormalizedVideo,
  normalizedToCanvasPixels,
  pointDistance,
  isValidLineSegment,
  isValidPolygon,
} from '../src/utils/geometry.ts';

test('calculateRenderedVideoRect - exact 16:9 match', () => {
  const rect = calculateRenderedVideoRect(1600, 900, 16 / 9);
  assert.strictEqual(rect.x, 0);
  assert.strictEqual(rect.y, 0);
  assert.strictEqual(rect.width, 1600);
  assert.strictEqual(rect.height, 900);
});

test('calculateRenderedVideoRect - pillarboxing (wider container)', () => {
  // Container 2000x900 has aspect > 16/9 -> video width should be 1600, x centered at 200
  const rect = calculateRenderedVideoRect(2000, 900, 16 / 9);
  assert.strictEqual(rect.height, 900);
  assert.strictEqual(rect.width, 1600);
  assert.strictEqual(rect.x, 200);
  assert.strictEqual(rect.y, 0);
});

test('calculateRenderedVideoRect - letterboxing (taller container)', () => {
  // Container 1600x1200 has aspect < 16/9 -> video height should be 900, y centered at 150
  const rect = calculateRenderedVideoRect(1600, 1200, 16 / 9);
  assert.strictEqual(rect.width, 1600);
  assert.strictEqual(rect.height, 900);
  assert.strictEqual(rect.x, 0);
  assert.strictEqual(rect.y, 150);
});

test('calculateRenderedVideoRect - invalid or zero dimensions', () => {
  const rect = calculateRenderedVideoRect(0, 0);
  assert.strictEqual(rect.width, 0);
  assert.strictEqual(rect.height, 0);
});

test('clientToNormalizedVideo - converts client coordinates within video bounds', () => {
  const canvasRect = { left: 100, top: 50, right: 900, bottom: 500, width: 800, height: 450 } as DOMRect;
  const videoRect = { x: 0, y: 0, width: 800, height: 450 };

  // Center click
  const ptCenter = clientToNormalizedVideo(500, 275, canvasRect, videoRect);
  assert.strictEqual(ptCenter[0], 0.5);
  assert.strictEqual(ptCenter[1], 0.5);

  // Top-left click
  const ptTL = clientToNormalizedVideo(100, 50, canvasRect, videoRect);
  assert.strictEqual(ptTL[0], 0);
  assert.strictEqual(ptTL[1], 0);

  // Bottom-right click
  const ptBR = clientToNormalizedVideo(900, 500, canvasRect, videoRect);
  assert.strictEqual(ptBR[0], 1);
  assert.strictEqual(ptBR[1], 1);
});

test('clientToNormalizedVideo - clamps points outside video area', () => {
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 } as DOMRect;
  const videoRect = { x: 100, y: 0, width: 800, height: 500 }; // 100px padding left and right

  // Click in left black bar
  const ptLeft = clientToNormalizedVideo(50, 250, canvasRect, videoRect);
  assert.strictEqual(ptLeft[0], 0);

  // Click in right black bar
  const ptRight = clientToNormalizedVideo(950, 250, canvasRect, videoRect);
  assert.strictEqual(ptRight[0], 1);
});

test('normalizedToCanvasPixels - converts normalized back to canvas space', () => {
  const videoRect = { x: 100, y: 50, width: 800, height: 450 };
  const pixels = normalizedToCanvasPixels([0.25, 0.5], videoRect);
  assert.strictEqual(pixels[0], 300);
  assert.strictEqual(pixels[1], 275);
});

test('pointDistance & isValidLineSegment', () => {
  assert.strictEqual(pointDistance([0, 0], [3, 4]), 5);
  assert.strictEqual(isValidLineSegment([0.1, 0.1], [0.105, 0.105], 0.02), false);
  assert.strictEqual(isValidLineSegment([0.1, 0.1], [0.5, 0.5], 0.02), true);
});

test('isValidPolygon', () => {
  assert.strictEqual(isValidPolygon([]), false);
  assert.strictEqual(isValidPolygon([[0, 0], [1, 1]]), false);
  // Non-degenerate triangle
  assert.strictEqual(isValidPolygon([[0.1, 0.1], [0.8, 0.1], [0.5, 0.8]]), true);
  // Degenerate collapsed polygon
  assert.strictEqual(isValidPolygon([[0.1, 0.1], [0.1001, 0.1001], [0.1002, 0.1002]]), false);
});
