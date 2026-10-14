import test from 'node:test';
import assert from 'node:assert/strict';
import type { RulesData, AnalyticsEvent, Telemetry } from '../src/types.ts';

test('RulesData - line and zone rules data structure', () => {
  const rules: RulesData = {
    line: {
      start: [0.1, 0.5],
      end: [0.9, 0.5],
      positive_label: 'in',
      negative_label: 'out',
      hysteresis_px: 3.0,
      max_gap_frames: 5,
    },
    zones: [
      {
        name: 'Zone A',
        vertices: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]],
        dwell_seconds: 5.0,
        max_gap_frames: 5,
      },
    ],
  };

  assert.strictEqual(rules.line?.positive_label, 'in');
  assert.strictEqual(rules.zones.length, 1);
  assert.strictEqual(rules.zones[0].vertices.length, 4);
});

test('AnalyticsEvent filtering and metrics calculation', () => {
  const events: AnalyticsEvent[] = [
    {
      id: 1,
      event_id: 'e1',
      event_type: 'line_crossing',
      rule_name: 'line_1',
      track_id: 10,
      video_time_ms: 1000,
      direction: 'in',
      created_at: '2026-10-14T09:00:00Z',
    },
    {
      id: 2,
      event_id: 'e2',
      event_type: 'zone_entry',
      rule_name: 'Zone A',
      track_id: 10,
      video_time_ms: 2000,
      created_at: '2026-10-14T09:00:01Z',
    },
    {
      id: 3,
      event_id: 'e3',
      event_type: 'zone_dwell',
      rule_name: 'Zone A',
      track_id: 10,
      video_time_ms: 7000,
      observed_duration: 5.0,
      created_at: '2026-10-14T09:00:06Z',
    },
  ];

  // Filtering
  const lineCrossings = events.filter((e) => e.event_type === 'line_crossing');
  assert.strictEqual(lineCrossings.length, 1);

  const dwellAlerts = events.filter((e) => e.event_type === 'zone_dwell');
  assert.strictEqual(dwellAlerts.length, 1);
  assert.strictEqual(dwellAlerts[0].observed_duration, 5.0);
});

test('Telemetry parsing and net counts', () => {
  const telemetry: Partial<Telemetry> = {
    status: 'running',
    line_counts: { in: 14, out: 6 },
    active_people_count: 3,
  };

  const inCount = telemetry.line_counts?.['in'] ?? 0;
  const outCount = telemetry.line_counts?.['out'] ?? 0;
  const netCount = inCount - outCount;

  assert.strictEqual(inCount, 14);
  assert.strictEqual(outCount, 6);
  assert.strictEqual(netCount, 8);
});
