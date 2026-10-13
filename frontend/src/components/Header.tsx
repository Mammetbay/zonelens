import React from 'react';
import { Activity, Cpu, Layers, Radio } from 'lucide-react';
import type { Telemetry } from '../types';

interface HeaderProps {
  telemetry: Telemetry | null;
  wsConnected: boolean;
  health: { cuda_available: boolean; cuda_device: string | null; torch_version: string } | null;
}

export const Header: React.FC<HeaderProps> = ({ telemetry, wsConnected, health }) => {
  const isRunning = telemetry?.status === 'running';
  const isPaused = telemetry?.status === 'paused';
  const isError = telemetry?.status === 'error';

  return (
    <header className="glass-panel" style={{ padding: '12px 20px', margin: '16px 16px 12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #10B981, #06B6D4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)'
        }}>
          <Layers size={22} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #FFFFFF, #D1D5DB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ZoneLens
            </h1>
            <span className="badge badge-emerald">v0.2 PROTOTYPE</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time Object Tracking, Line Crossing & Polygon Zone Analytics
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Hardware & GPU status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <Cpu size={16} color={health?.cuda_available ? '#10B981' : '#9CA3AF'} />
          <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            {telemetry?.gpu || health?.cuda_device || (health?.cuda_available ? 'CUDA Active' : 'CPU Device')}
          </div>
        </div>

        {/* Telemetry Metrics */}
        {telemetry && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '6px 12px', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color="#06B6D4" />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PROC FPS:</span>
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#38BDF8' }}>
                {telemetry.processing_fps}
              </span>
            </div>

            <div style={{ padding: '6px 12px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>INFER:</span>
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#A78BFA' }}>
                {telemetry.mean_inference_ms} ms
              </span>
            </div>
          </div>
        )}

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div className={`live-dot ${isRunning ? '' : isPaused ? 'idle' : isError ? 'error' : 'idle'}`} />
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {telemetry?.status || 'STOPPED'}
          </span>
        </div>

        {/* WebSocket indicator */}
        <div title={wsConnected ? 'WebSocket Telemetry Connected' : 'Connecting to Server WebSocket...'} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: wsConnected ? '#10B981' : '#F59E0B' }}>
          <Radio size={14} />
          <span>{wsConnected ? 'LIVE' : 'SYNCING'}</span>
        </div>
      </div>
    </header>
  );
};
