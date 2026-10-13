export interface PersonTrack {
  id: number | null;
  confidence: number;
  xyxy: [number, number, number, number];
}

export interface ZoneStats {
  occupancy: number;
  peak_occupancy: number;
  dwell_events: number;
}

export interface Telemetry {
  status: 'stopped' | 'starting' | 'running' | 'paused' | 'completed' | 'error';
  source: string;
  loop: boolean;
  frame_index: number;
  source_fps: number;
  processing_fps: number;
  mean_inference_ms: number;
  device: string;
  gpu: string | null;
  line_counts: Record<string, number>;
  zones: Record<string, ZoneStats>;
  active_people_count: number;
  tracks: PersonTrack[];
  error: string | null;
}

export interface LineRule {
  start: [number, number];
  end: [number, number];
  positive_label: string;
  negative_label: string;
  hysteresis_px: number;
  max_gap_frames: number;
}

export interface ZoneRule {
  name: string;
  vertices: [number, number][];
  dwell_seconds: number;
  max_gap_frames: number;
}

export interface RulesData {
  line: LineRule | null;
  zones: ZoneRule[];
}

export interface AnalyticsEvent {
  id: number;
  event_id: string;
  event_type: 'line_crossing' | 'zone_entry' | 'zone_exit' | 'zone_dwell' | string;
  rule_name: string;
  track_id: number | null;
  video_time_ms: number;
  direction?: string | null;
  observed_duration?: number | null;
  created_at: string;
  payload?: Record<string, any>;
}

export type EditorTool = 'view' | 'draw_line' | 'draw_zone' | 'edit';
