import React, { useState } from 'react';
import {
  Activity,
  Sliders,
  BellRing,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Trash2,
  Download,
} from 'lucide-react';
import type { Telemetry, RulesData, AnalyticsEvent } from '../types';

interface AnalyticsPanelProps {
  telemetry: Telemetry | null;
  rules: RulesData;
  onUpdateRules: (rules: RulesData) => void;
  onSaveRules: (rules: RulesData) => void;
  events: AnalyticsEvent[];
  onClearEvents: () => void;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  telemetry,
  rules,
  onUpdateRules,
  onSaveRules,
  events,
  onClearEvents,
}) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'rules' | 'events'>('analytics');
  const [eventFilter, setEventFilter] = useState<string>('all');

  // Filtered events
  const filteredEvents = events.filter((ev) => {
    if (eventFilter === 'all') return true;
    return ev.event_type === eventFilter;
  });

  const exportEventsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `zonelens-events-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const lineCounts = telemetry?.line_counts || {};
  const positiveLabel = rules.line?.positive_label || 'in';
  const negativeLabel = rules.line?.negative_label || 'out';
  const inCount = lineCounts[positiveLabel] || 0;
  const outCount = lineCounts[negativeLabel] || 0;
  const netCount = inCount - outCount;

  return (
    <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '620px' }}>
      {/* Tab Navigation Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
        <button
          className={`btn ${activeTab === 'analytics' ? 'btn-active' : 'btn-secondary'}`}
          style={{ flex: 1, borderRadius: 0, border: 'none', borderBottom: activeTab === 'analytics' ? '2px solid var(--accent-emerald)' : 'none', padding: '12px 10px' }}
          onClick={() => setActiveTab('analytics')}
        >
          <Activity size={15} color={activeTab === 'analytics' ? '#10B981' : undefined} />
          <span>Live HUD</span>
        </button>

        <button
          className={`btn ${activeTab === 'rules' ? 'btn-active' : 'btn-secondary'}`}
          style={{ flex: 1, borderRadius: 0, border: 'none', borderBottom: activeTab === 'rules' ? '2px solid var(--accent-violet)' : 'none', padding: '12px 10px' }}
          onClick={() => setActiveTab('rules')}
        >
          <Sliders size={15} color={activeTab === 'rules' ? '#8B5CF6' : undefined} />
          <span>Rules</span>
        </button>

        <button
          className={`btn ${activeTab === 'events' ? 'btn-active' : 'btn-secondary'}`}
          style={{ flex: 1, borderRadius: 0, border: 'none', borderBottom: activeTab === 'events' ? '2px solid var(--accent-cyan)' : 'none', padding: '12px 10px' }}
          onClick={() => setActiveTab('events')}
        >
          <BellRing size={15} color={activeTab === 'events' ? '#06B6D4' : undefined} />
          <span>Events ({events.length})</span>
        </button>
      </div>

      {/* Tab 1: Live Analytics & Counters */}
      {activeTab === 'analytics' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Bidirectional Line Crossing Card */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-violet">Line Crossing</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {rules.line ? 'Configured Segment' : 'No line rule defined'}
                </span>
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                Band: {rules.line?.hysteresis_px || 3}px
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-sm)', padding: '10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px', color: '#34D399', fontWeight: 600, textTransform: 'uppercase' }}>
                  <ArrowDownRight size={13} />
                  <span>{positiveLabel}</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#10B981', marginTop: '4px' }}>
                  {inCount}
                </div>
              </div>

              <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: 'var(--radius-sm)', padding: '10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px', color: '#FDA4AF', fontWeight: 600, textTransform: 'uppercase' }}>
                  <ArrowUpRight size={13} />
                  <span>{negativeLabel}</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#F43F5E', marginTop: '4px' }}>
                  {outCount}
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Net Flow
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: netCount >= 0 ? '#38BDF8' : '#F59E0B', marginTop: '4px' }}>
                  {netCount >= 0 ? `+${netCount}` : netCount}
                </div>
              </div>
            </div>
          </div>

          {/* Polygon Zones Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Monitored Zones ({rules.zones.length})
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Polygon Occupancy</span>
            </div>

            {rules.zones.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-subtle)', color: 'var(--text-dim)', fontSize: '12px' }}>
                No zones drawn yet. Click "Draw Zone" above the video to define areas.
              </div>
            ) : (
              rules.zones.map((z) => {
                const zStat = telemetry?.zones?.[z.name] || { occupancy: 0, peak_occupancy: 0, dwell_events: 0 };
                return (
                  <div
                    key={z.name}
                    style={{
                      background: 'rgba(16, 185, 129, 0.04)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#34D399' }}>⬡ {z.name}</span>
                        <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                          Dwell: {z.dwell_seconds}s
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {z.vertices.length} vertices
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius-sm)', padding: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>OCCUPANCY</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#10B981' }}>
                          {zStat.occupancy}
                        </div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius-sm)', padding: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>PEAK</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38BDF8' }}>
                          {zStat.peak_occupancy}
                        </div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius-sm)', padding: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>DWELL ALERTS</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#F59E0B' }}>
                          {zStat.dwell_events}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Active Detected People in Scene */}
          <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', padding: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} color="var(--accent-cyan)" />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Active Tracked Persons</span>
              </div>
              <span className="badge badge-cyan">
                {telemetry?.active_people_count || 0} Visible
              </span>
            </div>

            {telemetry?.tracks && telemetry.tracks.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {telemetry.tracks.map((p, idx) => (
                  <div
                    key={p.id !== null ? p.id : idx}
                    style={{
                      background: 'rgba(6, 182, 212, 0.08)',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ color: '#38BDF8', fontWeight: 700 }}>ID #{p.id ?? '?'}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{(p.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', padding: '6px 0' }}>
                No persons currently detected in active frame.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Rules Configuration */}
      {activeTab === 'rules' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Line rule settings */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '10px' }}>
              Counting Line Settings
            </span>

            {rules.line ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Positive Label (A ➔ B)
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      style={{ width: '100%' }}
                      value={rules.line.positive_label}
                      onChange={(e) =>
                        onUpdateRules({
                          ...rules,
                          line: { ...rules.line!, positive_label: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Negative Label (B ➔ A)
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      style={{ width: '100%' }}
                      value={rules.line.negative_label}
                      onChange={(e) =>
                        onUpdateRules({
                          ...rules,
                          line: { ...rules.line!, negative_label: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Deadband Hysteresis (px)
                    </label>
                    <input
                      type="number"
                      className="input-text"
                      style={{ width: '100%' }}
                      value={rules.line.hysteresis_px}
                      min={0}
                      step={0.5}
                      onChange={(e) =>
                        onUpdateRules({
                          ...rules,
                          line: { ...rules.line!, hysteresis_px: parseFloat(e.target.value) || 0 },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Max Gap (frames)
                    </label>
                    <input
                      type="number"
                      className="input-text"
                      style={{ width: '100%' }}
                      value={rules.line.max_gap_frames}
                      min={1}
                      onChange={(e) =>
                        onUpdateRules({
                          ...rules,
                          line: { ...rules.line!, max_gap_frames: parseInt(e.target.value) || 1 },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                No line currently placed. Use the "Draw Line" tool above the video to create one.
              </p>
            )}
          </div>

          {/* Zones rule settings */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '10px' }}>
              Polygon Zones Settings
            </span>

            {rules.zones.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                No zones created. Use the "Draw Zone" tool on video canvas to outline areas.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {rules.zones.map((z, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        className="input-text"
                        style={{ width: '110px', padding: '4px 6px', fontWeight: 600 }}
                        value={z.name}
                        onChange={(e) => {
                          const updated = [...rules.zones];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          onUpdateRules({ ...rules, zones: updated });
                        }}
                      />
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                        {z.vertices.length} vertices defined
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                          Dwell (sec)
                        </span>
                        <input
                          type="number"
                          className="input-text"
                          style={{ width: '65px', padding: '4px 6px' }}
                          value={z.dwell_seconds}
                          min={0.5}
                          step={0.5}
                          onChange={(e) => {
                            const updated = [...rules.zones];
                            updated[idx] = { ...updated[idx], dwell_seconds: parseFloat(e.target.value) || 1.0 };
                            onUpdateRules({ ...rules, zones: updated });
                          }}
                        />
                      </div>

                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px', marginTop: '14px' }}
                        onClick={() => {
                          const updated = rules.zones.filter((_, i) => i !== idx);
                          onUpdateRules({ ...rules, zones: updated });
                        }}
                        title="Delete zone"
                      >
                        <Trash2 size={13} color="#FDA4AF" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 'auto' }}
            onClick={() => onSaveRules(rules)}
          >
            Apply & Save Rules to Backend
          </button>
        </div>
      )}

      {/* Tab 3: Events History & Live Stream */}
      {activeTab === 'events' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
          {/* Action and Filter Ribbon */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="input-text"
              style={{ padding: '4px 8px', fontSize: '12px', width: '130px' }}
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="all">All Events</option>
              <option value="line_crossing">Line Crossing</option>
              <option value="zone_entry">Zone Entry</option>
              <option value="zone_exit">Zone Exit</option>
              <option value="zone_dwell">Dwell Alert</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 8px', fontSize: '11px' }}
                onClick={exportEventsJson}
                title="Download events as JSON"
              >
                <Download size={13} />
                <span>Export</span>
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 8px', fontSize: '11px' }}
                onClick={onClearEvents}
                title="Clear all events from SQLite"
              >
                <Trash2 size={13} color="#FDA4AF" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Events Scroll List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
            {filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-dim)', fontSize: '12px' }}>
                No events recorded yet. Movements across lines or zones will appear here automatically.
              </div>
            ) : (
              filteredEvents.map((ev, idx) => {
                const isLine = ev.event_type === 'line_crossing';
                const isDwell = ev.event_type === 'zone_dwell';
                const isEntry = ev.event_type === 'zone_entry';

                return (
                  <div
                    key={ev.id || idx}
                    style={{
                      background: isDwell
                        ? 'rgba(245, 158, 11, 0.08)'
                        : isLine
                        ? 'rgba(139, 92, 246, 0.06)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${
                        isDwell
                          ? 'rgba(245, 158, 11, 0.3)'
                          : isLine
                          ? 'rgba(139, 92, 246, 0.25)'
                          : 'var(--border-subtle)'
                      }`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isDwell ? (
                          <span className="badge badge-amber">Dwell Alert</span>
                        ) : isLine ? (
                          <span className="badge badge-violet">Line Cross</span>
                        ) : isEntry ? (
                          <span className="badge badge-emerald">Zone Entry</span>
                        ) : (
                          <span className="badge badge-cyan">Zone Exit</span>
                        )}
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>
                          {ev.rule_name || ev.direction || 'Event'}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : `${(ev.video_time_ms / 1000).toFixed(1)}s`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Track ID: <strong style={{ color: 'var(--text-main)' }}>#{ev.track_id ?? '?'}</strong></span>
                      {ev.direction && (
                        <span>Direction: <strong style={{ color: '#C4B5FD' }}>{ev.direction}</strong></span>
                      )}
                      {ev.observed_duration !== undefined && ev.observed_duration !== null && (
                        <span>Dwell: <strong style={{ color: '#FBBF24' }}>{ev.observed_duration.toFixed(1)}s</strong></span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
