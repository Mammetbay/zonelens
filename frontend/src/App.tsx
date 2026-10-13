import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlsBar } from './components/ControlsBar';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import type { Telemetry, RulesData, AnalyticsEvent } from './types';

export const App: React.FC = () => {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [health, setHealth] = useState<{
    cuda_available: boolean;
    cuda_device: string | null;
    torch_version: string;
  } | null>(null);

  const [rules, setRules] = useState<RulesData>({
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
        name: 'Lobby',
        vertices: [
          [0.15, 0.2],
          [0.85, 0.2],
          [0.85, 0.8],
          [0.15, 0.8],
        ],
        dwell_seconds: 5.0,
        max_gap_frames: 5,
      },
    ],
  });

  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Fetch initial health and rules from API
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Health fetch failed:', err));

    fetch('/api/rules')
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.line || data.zones)) {
          setRules({
            line: data.line,
            zones: data.zones || [],
          });
        }
      })
      .catch((err) => console.error('Rules fetch failed:', err));

    fetch('/api/events?limit=100')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      })
      .catch((err) => console.error('Events fetch failed:', err));
  }, []);

  // Polling fallback for guaranteed zero-dependency real-time telemetry
  useEffect(() => {
    const pollStatus = () => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.status) {
            setTelemetry(data);
            setWsConnected(true);
          }
        })
        .catch(() => setWsConnected(false));
    };

    pollStatus();
    const interval = setInterval(pollStatus, 400);
    return () => clearInterval(interval);
  }, []);

  // Server-Sent Events (SSE) for instant event alerts and telemetry
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events/stream');
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'telemetry') {
            setTelemetry(msg.data);
            setWsConnected(true);
          } else if (msg.type === 'event') {
            setEvents((prev) => [msg.data, ...prev].slice(0, 500));
          }
        } catch (e) {
          // ignore parse errors
        }
      };
    } catch (e) {
      // ignore
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // REST API Actions
  const handleStart = async (source: string, loop: boolean, device: string) => {
    try {
      await fetch('/api/source/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, loop, device }),
      });
    } catch (err) {
      console.error('Failed to start source:', err);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/source/stop', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop source:', err);
    }
  };

  const handlePause = async () => {
    try {
      await fetch('/api/source/pause', { method: 'POST' });
    } catch (err) {
      console.error('Failed to pause source:', err);
    }
  };

  const handleResume = async () => {
    try {
      await fetch('/api/source/resume', { method: 'POST' });
    } catch (err) {
      console.error('Failed to resume source:', err);
    }
  };

  const handleResetCounts = async () => {
    try {
      await fetch('/api/source/reset_counts', { method: 'POST' });
    } catch (err) {
      console.error('Failed to reset counts:', err);
    }
  };

  const handleSaveRules = async (newRules: RulesData) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRules),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rules) {
          setRules(data.rules);
        }
      }
    } catch (err) {
      console.error('Failed to save rules:', err);
    }
  };

  const handleClearEvents = async () => {
    try {
      await fetch('/api/events', { method: 'DELETE' });
      setEvents([]);
    } catch (err) {
      console.error('Failed to clear events:', err);
    }
  };

  const isRunning = telemetry?.status === 'running' || telemetry?.status === 'paused';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <Header telemetry={telemetry} wsConnected={wsConnected} health={health} />

      {/* Main Workspace Dashboard */}
      <main
        style={{
          flex: 1,
          padding: '0 16px 16px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.65fr) minmax(360px, 1fr)',
          gap: '16px',
        }}
      >
        {/* Left: Video Viewport & Controls */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <VideoPlayer
            rules={rules}
            onUpdateRules={setRules}
            onSaveRules={handleSaveRules}
            isRunning={isRunning}
          />
          <ControlsBar
            telemetry={telemetry}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
            onResetCounts={handleResetCounts}
          />
        </section>

        {/* Right: Live Analytics & HUD Panel */}
        <section>
          <AnalyticsPanel
            telemetry={telemetry}
            rules={rules}
            onUpdateRules={setRules}
            onSaveRules={handleSaveRules}
            events={events}
            onClearEvents={handleClearEvents}
          />
        </section>
      </main>

      {/* Footer bar */}
      <footer
        style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>ZoneLens — Local-first Computer Vision Intelligence</span>
        <span>AGPL-3.0 License • Powered by YOLO11n & ByteTrack</span>
      </footer>
    </div>
  );
};

export default App;
