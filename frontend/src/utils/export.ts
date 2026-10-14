/**
 * Event export utilities for ZoneLens.
 * Supports JSON and CSV formats with clean timestamp formatting.
 */

import type { AnalyticsEvent } from '../types';

export function formatEventTimestamp(isoString: string | undefined, videoTimeMs: number): string {
  if (isoString) {
    try {
      const d = new Date(isoString);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString();
      }
    } catch {
      // fallback to video time
    }
  }
  return `${(videoTimeMs / 1000).toFixed(1)}s`;
}

export function exportEventsToJSON(events: AnalyticsEvent[], filenamePrefix = 'zonelens-events'): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
  downloadFile(dataStr, `${filenamePrefix}-${Date.now()}.json`);
}

export function exportEventsToCSV(events: AnalyticsEvent[], filenamePrefix = 'zonelens-events'): void {
  const headers = ['ID', 'Event ID', 'Type', 'Rule / Zone', 'Track ID', 'Direction', 'Dwell (s)', 'Video Time (s)', 'Occurred At (UTC)'];
  const rows = events.map((ev) => [
    ev.id ?? '',
    ev.event_id ?? '',
    ev.event_type ?? '',
    `"${(ev.rule_name ?? '').replace(/"/g, '""')}"`,
    ev.track_id ?? '',
    ev.direction ?? '',
    ev.observed_duration !== undefined && ev.observed_duration !== null ? ev.observed_duration.toFixed(2) : '',
    (ev.video_time_ms / 1000).toFixed(2),
    ev.created_at ?? '',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  downloadFile(dataStr, `${filenamePrefix}-${Date.now()}.csv`);
}

function downloadFile(uri: string, filename: string): void {
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', uri);
  downloadAnchor.setAttribute('download', filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
