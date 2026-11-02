import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Video,
  Radio,
  Smartphone,
  RefreshCw,
  HelpCircle,
  X,
  Wifi,
  Usb,
  Check,
} from 'lucide-react';
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
  const [detectedDevices, setDetectedDevices] = useState<{ index: number; name: string }[]>([]);
  const [rtspUrl, setRtspUrl] = useState<string>('http://192.168.1.50:8080/video');
  const [loop, setLoop] = useState<boolean>(true);
  const [device, setDevice] = useState<string>('auto');

  // Phone guide modal state
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'ipwebcam' | 'droidcam' | 'usb'>('ipwebcam');
  const [guideIpInput, setGuideIpInput] = useState<string>('192.168.1.');
  const [isRefreshingDevices, setIsRefreshingDevices] = useState<boolean>(false);

  const fetchDevices = () => {
    setIsRefreshingDevices(true);
    fetch('/api/source/devices')
      .then((res) => res.json())
      .then((data) => {
        if (data?.devices && Array.isArray(data.devices)) {
          setDetectedDevices(data.devices);
          if (data.devices.length > 0 && !data.devices.some((d: { index: number; name: string }) => String(d.index) === webcamIndex)) {
            setWebcamIndex(String(data.devices[0].index));
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsRefreshingDevices(false));
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const isRunning = telemetry?.status === 'running';
  const isPaused = telemetry?.status === 'paused';

  const normalizeUrlInput = (input: string): string => {
    let val = input.trim();
    if (!val) return val;

    // If input matches raw IP or host with port like 192.168.1.35:8080
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?(?:\/.*)?$/i.test(val) || /^localhost:[0-9]+/i.test(val)) {
      if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('rtsp://')) {
        if (val.includes(':554') || val.includes(':8554')) {
          val = 'rtsp://' + val;
        } else {
          val = 'http://' + val;
        }
      }
    }

    // Auto append endpoint if missing for IP Webcam (:8080) or DroidCam (:4747)
    if (/^https?:\/\/[^/]+:8080\/?$/i.test(val)) {
      val = val.replace(/\/?$/, '/video');
    } else if (/^https?:\/\/[^/]+:4747\/?$/i.test(val)) {
      val = val.replace(/\/?$/, '/video');
    }

    return val;
  };

  const getEffectiveSource = (): string => {
    switch (sourceType) {
      case 'sample':
        return 'samples/people.mp4';
      case 'webcam':
        return webcamIndex;
      case 'rtsp':
        return normalizeUrlInput(rtspUrl) || 'http://192.168.1.50:8080/video';
      case 'custom':
        return customPath.trim() || 'samples/people.mp4';
    }
  };

  const handleStart = () => {
    onStart(getEffectiveSource(), loop, device);
  };

  const applyGuidePreset = () => {
    let cleanIp = guideIpInput.trim();
    if (cleanIp.startsWith('http://')) cleanIp = cleanIp.replace('http://', '');
    if (cleanIp.startsWith('https://')) cleanIp = cleanIp.replace('https://', '');
    cleanIp = cleanIp.split('/')[0];
    cleanIp = cleanIp.split(':')[0]; // pure IP

    let fullUrl = '';
    if (activeGuideTab === 'ipwebcam') {
      fullUrl = `http://${cleanIp || '192.168.1.50'}:8080/video`;
    } else if (activeGuideTab === 'droidcam') {
      fullUrl = `http://${cleanIp || '192.168.1.50'}:4747/video`;
    }

    setRtspUrl(fullUrl);
    setSourceType('rtsp');
    setShowGuideModal(false);
  };

  return (
    <>
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
              style={{ width: '220px' }}
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as any)}
            >
              <option value="sample">Sample Video (people.mp4)</option>
              <option value="rtsp">📱 Mobile / RTSP Stream (WiFi / IP)</option>
              <option value="webcam">🔌 USB / Virtual Webcam (DroidCam / Iriun)</option>
              <option value="custom">Custom File Path</option>
            </select>
          </div>

          {/* Dynamic Source Inputs: Webcam */}
          {sourceType === 'webcam' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                className="input-text"
                style={{ width: '160px' }}
                value={webcamIndex}
                onChange={(e) => setWebcamIndex(e.target.value)}
              >
                {detectedDevices.length > 0 ? (
                  detectedDevices.map((d) => (
                    <option key={d.index} value={String(d.index)}>
                      {d.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="0">Camera #0 (Default)</option>
                    <option value="1">Camera #1</option>
                    <option value="2">Camera #2</option>
                  </>
                )}
              </select>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 8px' }}
                onClick={fetchDevices}
                title="Rescan video capture devices"
              >
                <RefreshCw size={13} className={isRefreshingDevices ? 'spin' : ''} />
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  setActiveGuideTab('usb');
                  setShowGuideModal(true);
                }}
                title="Guide: Connect phone as a USB/virtual webcam"
              >
                <HelpCircle size={13} color="var(--accent-cyan)" />
                <span>Guide</span>
              </button>
            </div>
          )}

          {/* Dynamic Source Inputs: Network / Phone Stream */}
          {sourceType === 'rtsp' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Radio size={14} color="#F59E0B" />
                <input
                  type="text"
                  className="input-text"
                  style={{ width: '270px', fontSize: '12px' }}
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  onBlur={() => setRtspUrl(normalizeUrlInput(rtspUrl))}
                  placeholder="http://192.168.1.XX:8080/video"
                />
              </div>

              {/* Quick preset buttons */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => {
                    const currentIp = rtspUrl.match(/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)?.[0] || '192.168.1.50';
                    setRtspUrl(`http://${currentIp}:8080/video`);
                  }}
                  title="Android IP Webcam format: http://IP:8080/video"
                >
                  <Smartphone size={12} color="#10B981" />
                  <span>IP Webcam</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => {
                    const currentIp = rtspUrl.match(/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)?.[0] || '192.168.1.50';
                    setRtspUrl(`http://${currentIp}:4747/video`);
                  }}
                  title="DroidCam WiFi format: http://IP:4747/video"
                >
                  <span>DroidCam</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-cyan)' }}
                  onClick={() => setShowGuideModal(true)}
                  title="Mobile phone camera connection guide"
                >
                  <HelpCircle size={12} />
                  <span>Phone Guide</span>
                </button>
              </div>
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
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Accelerator:</span>
            <select
              className="input-text"
              style={{ padding: '6px 8px', fontSize: '12px' }}
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            >
              <option value="auto">Auto (GPU / CPU)</option>
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
            title="Reset detection & crossing counts"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Phone Connection Assistant Modal */}
      {showGuideModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGuideModal(false);
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '580px',
              backgroundColor: '#0F172A',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Smartphone size={22} color="var(--accent-emerald)" />
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  Mobile Camera Setup Guide
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px' }}
                onClick={() => setShowGuideModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Method Tabs */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <button
                type="button"
                className={`btn ${activeGuideTab === 'ipwebcam' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setActiveGuideTab('ipwebcam')}
              >
                <Wifi size={14} />
                <span>1. IP Webcam (WiFi - Recommended)</span>
              </button>
              <button
                type="button"
                className={`btn ${activeGuideTab === 'droidcam' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setActiveGuideTab('droidcam')}
              >
                <Smartphone size={14} />
                <span>2. DroidCam (WiFi)</span>
              </button>
              <button
                type="button"
                className={`btn ${activeGuideTab === 'usb' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setActiveGuideTab('usb')}
              >
                <Usb size={14} />
                <span>3. USB Cable (Zero Latency)</span>
              </button>
            </div>

            {/* Tab Contents */}
            {activeGuideTab === 'ipwebcam' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#CBD5E1', lineHeight: '1.6' }}>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: '#38BDF8' }}>Most convenient & fastest setup:</strong> No PC drivers or software installations needed.
                </p>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Open <strong>Google Play Store</strong> on your phone and install <strong>"IP Webcam"</strong> (by Pavel Khlebovich).</li>
                  <li>Ensure your phone and this computer are connected to the <strong>same Wi-Fi network</strong>.</li>
                  <li>Open the app, scroll to the bottom, and tap <strong>"Start server"</strong>.</li>
                  <li>Check the URL shown at the bottom of your phone screen (e.g. <code>http://192.168.1.34:8080</code>).</li>
                </ol>

                <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>Quick Preset:</span>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input-text"
                      style={{ flex: 1, fontSize: '12px' }}
                      value={guideIpInput}
                      onChange={(e) => setGuideIpInput(e.target.value)}
                      placeholder="Phone IP address (e.g. 192.168.1.34)"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                      onClick={() => applyGuidePreset()}
                    >
                      <Check size={14} />
                      <span>Use This Address</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Generated stream URL: <code>http://{guideIpInput || '192.168.1.XX'}:8080/video</code>
                  </span>
                </div>
              </div>
            )}

            {activeGuideTab === 'droidcam' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#CBD5E1', lineHeight: '1.6' }}>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: '#38BDF8' }}>Android & iOS (iPhone):</strong>
                </p>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Install the <strong>DroidCam</strong> app on your mobile phone.</li>
                  <li>Open the app; it will display your <strong>WiFi IP</strong> and <strong>DroidCam Port</strong> (default: 4747).</li>
                  <li>Enter your phone IP below and click to configure:</li>
                </ol>

                <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>Quick Preset:</span>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input-text"
                      style={{ flex: 1, fontSize: '12px' }}
                      value={guideIpInput}
                      onChange={(e) => setGuideIpInput(e.target.value)}
                      placeholder="Phone IP address (e.g. 192.168.1.34)"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                      onClick={() => applyGuidePreset()}
                    >
                      <Check size={14} />
                      <span>Set DroidCam URL</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Generated stream URL: <code>http://{guideIpInput || '192.168.1.XX'}:4747/video</code>
                  </span>
                </div>
              </div>
            )}

            {activeGuideTab === 'usb' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#CBD5E1', lineHeight: '1.6' }}>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: '#10B981' }}>Highest Stability & Best FPS (Zero Wi-Fi Fluctuations):</strong>
                </p>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Install the <strong>DroidCam</strong> or <strong>Iriun 4K Webcam</strong> desktop software on Windows and mobile app on your phone.</li>
                  <li>Connect your phone to PC using a USB cable (enable USB Debugging on Android if required).</li>
                  <li>Start the desktop DroidCam/Iriun application; it registers a virtual DirectShow webcam on Windows.</li>
                  <li>In ZoneLens, set Source to <strong>"🔌 USB / Virtual Webcam"</strong>.</li>
                  <li>Select your camera from the dropdown (Camera #0, #1, etc.). If needed, click "🔄 Rescan".</li>
                </ol>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setSourceType('webcam');
                      setShowGuideModal(false);
                      fetchDevices();
                    }}
                  >
                    <span>Switch to USB Webcam Mode</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
