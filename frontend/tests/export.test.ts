import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEventTimestamp } from '../src/utils/export.ts';

test('formatEventTimestamp - valid ISO date', () => {
  const result = formatEventTimestamp('2026-10-14T09:30:00Z', 15000);
  assert.match(result, /\d+:\d+/);
});

test('formatEventTimestamp - empty or invalid date falls back to video time', () => {
  const result1 = formatEventTimestamp('', 12500);
  assert.strictEqual(result1, '12.5s');

  const result2 = formatEventTimestamp('invalid-date-string', 4200);
  assert.strictEqual(result2, '4.2s');
});
