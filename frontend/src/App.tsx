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

  const [savedRulesSnapshot, setSavedRulesSnapshot] = useState<string>('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Fetch initial health, rules, and events from API
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Health fetch failed:', err));

    fetch('/api/rules')
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.line || data.zones)) {
          const loadedRules: RulesData = {
            line: data.line,
            zones: data.zones || [],
          };
          setRules(loadedRules);
          setSavedRulesSnapshot(JSON.stringify(loadedRules));
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

  // Real-time telemetry and instant events via Server-Sent Events (SSE)
  // Works with standard HTTP, zero external websocket dependencies required on server
  useEffect(() => {
    let es: EventSource | null = null;
    let isSubscribed = true;

    const setupSSE = () => {
      try {
        es = new EventSource('/api/events/stream');

        es.onopen = () => {
          if (isSubscribed) setWsConnected(true);
        };

        es.onmessage = (msgEvent) => {
          if (!isSubscribed) return;
          try {
            const msg = JSON.parse(msgEvent.data);
            if (msg.type === 'telemetry') {
              setTelemetry(msg.data);
              setWsConnected(true);
            } else if (msg.type === 'event') {
              // Instant event delivery from vision worker
              setEvents((prev) => {
                const incoming = msg.data;
                if (prev.some((e) => e.event_id === incoming.event_id)) {
                  return prev;
                }
                return [incoming, ...prev].slice(0, 500);
              });
            }
          } catch {
            // Ignore non-json messages
          }
        };

        es.onerror = () => {
          if (isSubscribed) setWsConnected(false);
        };
      } catch (err) {
        console.warn('SSE connection error:', err);
        if (isSubscribed) setWsConnected(false);
      }
    };

    setupSSE();

    return () => {
      isSubscribed = false;
      if (es) {
        es.close();
      }
    };
  }, []);

  // Fallback status polling if real-time stream is offline
  useEffect(() => {
    const pollStatus = () => {
      if (wsConnected) {
        return; // Stream is active, no need to poll
      }
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.status) {
            setTelemetry(data);
          }
        })
        .catch(() => {});
    };

    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [wsConnected]);

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
          setSavedRulesSnapshot(JSON.stringify(data.rules));
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
  const hasUnsavedRules = JSON.stringify(rules) !== savedRulesSnapshot;

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header telemetry={telemetry} wsConnected={wsConnected} health={health} />

      {/* Main Workspace Dashboard */}
      <main className="dashboard-layout">
        {/* Left: Video Viewport & Controls */}
        <section className="viewport-section">
          <VideoPlayer
            rules={rules}
            onUpdateRules={setRules}
            onSaveRules={handleSaveRules}
            isRunning={isRunning}
            hasUnsavedRules={hasUnsavedRules}
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
        <section className="analytics-section">
          <AnalyticsPanel
            telemetry={telemetry}
            rules={rules}
            onUpdateRules={setRules}
            onSaveRules={handleSaveRules}
            events={events}
            onClearEvents={handleClearEvents}
            hasUnsavedRules={hasUnsavedRules}
          />
        </section>
      </main>

      {/* Footer bar */}
      <footer className="footer-bar">
        <span>ZoneLens — Local-first Computer Vision Intelligence</span>
        <span>AGPL-3.0 License • Powered by YOLO11n & ByteTrack</span>
      </footer>
    </div>
  );
};

export default App;
