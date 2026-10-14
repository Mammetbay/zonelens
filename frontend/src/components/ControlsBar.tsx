import React, { useState } from 'react';
import { Play, Pause, Square, RotateCcw, Video, Radio } from 'lucide-react';
import type { Telemetry } from '../types';

interface ControlsBarProps {
  telemetry: Telemetry | null;
  onStart: (source: string, loop: boolean, device: string) => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onResetCounts: () => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  telemetry,
  onStart,
  onStop,
  onPause,
  onResume,
  onResetCounts,
}) => {
  const [sourceType, setSourceType] = useState<'sample' | 'webcam' | 'rtsp' | 'custom'>('sample');
  const [customPath, setCustomPath] = useState<string>('');
  const [webcamIndex, setWebcamIndex] = useState<string>('0');
  const [rtspUrl, setRtspUrl] = useState<string>('rtsp://admin:12345@192.168.1.64:554/Streaming/Channels/101');
  const [loop, setLoop] = useState<boolean>(true);
  const [device, setDevice] = useState<string>('auto');

  const isRunning = telemetry?.status === 'running';
  const isPaused = telemetry?.status === 'paused';

  const getEffectiveSource = (): string => {
    switch (sourceType) {
      case 'sample':
        return 'samples/people.mp4';
      case 'webcam':
        return webcamIndex;
      case 'rtsp':
        return rtspUrl.trim() || 'rtsp://127.0.0.1:8554/live';
      case 'custom':
        return customPath.trim() || 'samples/people.mp4';
    }
  };

  const handleStart = () => {
    onStart(getEffectiveSource(), loop, device);
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
      }}
    >
      {/* Source & Configuration */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Video size={16} color="var(--accent-cyan)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>Source:</span>
          <select
            className="input-text"
            style={{ width: '160px' }}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as any)}
          >
            <option value="sample">Sample Clip (people.mp4)</option>
            <option value="webcam">Webcam Device</option>
            <option value="rtsp">RTSP Camera (M4)</option>
            <option value="custom">Custom File Path</option>
          </select>
        </div>

        {/* Dynamic Source Inputs */}
        {sourceType === 'webcam' && (
          <select
            className="input-text"
            style={{ width: '110px' }}
            value={webcamIndex}
            onChange={(e) => setWebcamIndex(e.target.value)}
          >
            <option value="0">Camera #0</option>
            <option value="1">Camera #1</option>
            <option value="2">Camera #2</option>
          </select>
        )}

        {sourceType === 'rtsp' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={14} color="#F59E0B" />
            <input
              type="text"
              className="input-text"
              style={{ width: '260px', fontSize: '12px' }}
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://user:pass@ip:port/stream"
            />
          </div>
        )}

        {sourceType === 'custom' && (
          <input
            type="text"
            className="input-text"
            style={{ width: '220px', fontSize: '12px' }}
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="e.g. D:/Videos/test.mp4"
          />
        )}

        {/* Loop checkbox (applicable for video files) */}
        {sourceType !== 'webcam' && sourceType !== 'rtsp' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              style={{ accentColor: 'var(--accent-emerald)', cursor: 'pointer' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Loop Video</span>
          </label>
        )}

        {/* Device select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Device:</span>
          <select
            className="input-text"
            style={{ padding: '6px 8px', fontSize: '12px' }}
            value={device}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="auto">Auto (CUDA/CPU)</option>
            <option value="0">CUDA 0 (GPU)</option>
            <option value="cpu">CPU Only</option>
          </select>
        </div>
      </div>

      {/* Playback & Reset Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!isRunning && !isPaused ? (
          <button id="btn-start" className="btn btn-primary" onClick={handleStart}>
            <Play size={15} fill="#FFFFFF" />
            <span>Start Analysis</span>
          </button>
        ) : (
          <>
            {isPaused ? (
              <button id="btn-resume" className="btn btn-primary" onClick={onResume}>
                <Play size={15} fill="#FFFFFF" />
                <span>Resume</span>
              </button>
            ) : (
              <button id="btn-pause" className="btn btn-secondary" onClick={onPause}>
                <Pause size={15} />
                <span>Pause</span>
              </button>
            )}

            <button id="btn-stop" className="btn btn-danger" onClick={onStop}>
              <Square size={14} fill="#FDA4AF" />
              <span>Stop</span>
            </button>
          </>
        )}

        <button
          id="btn-reset-counts"
          className="btn btn-secondary"
          onClick={onResetCounts}
          title="Reset line and zone counts to zero"
        >
          <RotateCcw size={14} />
          <span>Reset Counts</span>
        </button>
      </div>
    </div>
  );
};
