import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, Edit3, Move, PlusSquare, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import type { RulesData, EditorTool, LineRule, ZoneRule } from '../types';

interface VideoPlayerProps {
  rules: RulesData;
  onUpdateRules: (rules: RulesData) => void;
  onSaveRules: (rules: RulesData) => void;
  isRunning: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  rules,
  onUpdateRules,
  onSaveRules,
  isRunning,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('view');

  // Drawing state
  const [lineDraft, setLineDraft] = useState<[number, number][]>([]);
  const [zoneDraft, setZoneDraft] = useState<[number, number][]>([]);
  const [activeZoneName, setActiveZoneName] = useState<string>('Zone 1');
  const [draggingTarget, setDraggingTarget] = useState<{
    type: 'line_start' | 'line_end' | 'zone_vertex';
    zoneIndex?: number;
    vertexIndex?: number;
  } | null>(null);

  // Stream reload key to force reconnect if stream stops/restarts
  const [streamKey, setStreamKey] = useState<number>(Date.now());
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Convert mouse event on canvas to normalized [0, 1] video coords
  const getNormalizedCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [
      Math.max(0, Math.min(1, parseFloat(x.toFixed(4)))),
      Math.max(0, Math.min(1, parseFloat(y.toFixed(4)))),
    ];
  }, []);

  // Sync canvas size to container
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Redraw canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Zones
    rules.zones.forEach((z) => {
      if (z.vertices.length < 3) return;
      ctx.beginPath();
      const firstPt = z.vertices[0];
      ctx.moveTo(firstPt[0] * width, firstPt[1] * height);
      for (let i = 1; i < z.vertices.length; i++) {
        ctx.lineTo(z.vertices[i][0] * width, z.vertices[i][1] * height);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#10B981';
      ctx.stroke();

      // Label
      const centerPt = z.vertices[0];
      ctx.font = '600 12px Inter';
      ctx.fillStyle = '#34D399';
      ctx.fillText(`⬡ ${z.name} (${z.dwell_seconds}s dwell)`, centerPt[0] * width + 8, centerPt[1] * height + 16);

      // Edit handles
      if (activeTool === 'edit') {
        z.vertices.forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt[0] * width, pt[1] * height, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#34D399';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    });

    // 2. Draw Zone Draft (while drawing)
    if (zoneDraft.length > 0) {
      ctx.beginPath();
      ctx.moveTo(zoneDraft[0][0] * width, zoneDraft[0][1] * height);
      for (let i = 1; i < zoneDraft.length; i++) {
        ctx.lineTo(zoneDraft[i][0] * width, zoneDraft[i][1] * height);
      }
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      zoneDraft.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt[0] * width, pt[1] * height, idx === 0 ? 8 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 0 ? '#F59E0B' : '#06B6D4';
        ctx.fill();
        ctx.stroke();
      });
    }

    // 3. Draw Counting Line
    if (rules.line) {
      const p1 = [rules.line.start[0] * width, rules.line.start[1] * height];
      const p2 = [rules.line.end[0] * width, rules.line.end[1] * height];

      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Arrowhead at end
      const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      const headLen = 14;
      ctx.beginPath();
      ctx.moveTo(p2[0], p2[1]);
      ctx.lineTo(p2[0] - headLen * Math.cos(angle - Math.PI / 6), p2[1] - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p2[0] - headLen * Math.cos(angle + Math.PI / 6), p2[1] - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = '#8B5CF6';
      ctx.fill();

      // Direction labels
      ctx.font = '600 12px Inter';
      ctx.fillStyle = '#C4B5FD';
      ctx.fillText(`➜ ${rules.line.positive_label.toUpperCase()} / ${rules.line.negative_label.toUpperCase()}`, (p1[0] + p2[0]) / 2 + 10, (p1[1] + p2[1]) / 2 - 8);

      // Edit handles
      if (activeTool === 'edit') {
        [p1, p2].forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 7, 0, 2 * Math.PI);
          ctx.fillStyle = '#8B5CF6';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    }

    // 4. Draw Line Draft (first point placed)
    if (lineDraft.length === 1) {
      const p = lineDraft[0];
      ctx.beginPath();
      ctx.arc(p[0] * width, p[1] * height, 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.font = '500 12px Inter';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText('Click second point to finish line', p[0] * width + 10, p[1] * height - 8);
    }
  }, [rules, zoneDraft, lineDraft, activeTool]);

  // Handle canvas mouse events
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getNormalizedCoords(e);

    if (activeTool === 'draw_line') {
      if (lineDraft.length === 0) {
        setLineDraft([coords]);
      } else {
        const newLine: LineRule = {
          start: lineDraft[0],
          end: coords,
          positive_label: rules.line?.positive_label || 'in',
          negative_label: rules.line?.negative_label || 'out',
          hysteresis_px: 3.0,
          max_gap_frames: 5,
        };
        onUpdateRules({ ...rules, line: newLine });
        setLineDraft([]);
        setActiveTool('view');
      }
    } else if (activeTool === 'draw_zone') {
      if (zoneDraft.length >= 2) {
        // If clicking near start point, close zone
        const startPt = zoneDraft[0];
        const dist = Math.hypot(coords[0] - startPt[0], coords[1] - startPt[1]);
        if (dist < 0.04) {
          finishZone();
          return;
        }
      }
      setZoneDraft([...zoneDraft, coords]);
    } else if (activeTool === 'edit') {
      // Check hit on line start/end
      if (rules.line) {
        const dStart = Math.hypot(coords[0] - rules.line.start[0], coords[1] - rules.line.start[1]);
        if (dStart < 0.04) {
          setDraggingTarget({ type: 'line_start' });
          return;
        }
        const dEnd = Math.hypot(coords[0] - rules.line.end[0], coords[1] - rules.line.end[1]);
        if (dEnd < 0.04) {
          setDraggingTarget({ type: 'line_end' });
          return;
        }
      }
      // Check hit on zone vertices
      for (let zIdx = 0; zIdx < rules.zones.length; zIdx++) {
        const z = rules.zones[zIdx];
        for (let vIdx = 0; vIdx < z.vertices.length; vIdx++) {
          const v = z.vertices[vIdx];
          const dist = Math.hypot(coords[0] - v[0], coords[1] - v[1]);
          if (dist < 0.04) {
            setDraggingTarget({ type: 'zone_vertex', zoneIndex: zIdx, vertexIndex: vIdx });
            return;
          }
        }
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingTarget) return;
    const coords = getNormalizedCoords(e);

    if (draggingTarget.type === 'line_start' && rules.line) {
      onUpdateRules({
        ...rules,
        line: { ...rules.line, start: coords },
      });
    } else if (draggingTarget.type === 'line_end' && rules.line) {
      onUpdateRules({
        ...rules,
        line: { ...rules.line, end: coords },
      });
    } else if (
      draggingTarget.type === 'zone_vertex' &&
      draggingTarget.zoneIndex !== undefined &&
      draggingTarget.vertexIndex !== undefined
    ) {
      const nextZones = [...rules.zones];
      const targetZone = { ...nextZones[draggingTarget.zoneIndex] };
      const nextVertices = [...targetZone.vertices];
      nextVertices[draggingTarget.vertexIndex] = coords;
      targetZone.vertices = nextVertices;
      nextZones[draggingTarget.zoneIndex] = targetZone;
      onUpdateRules({ ...rules, zones: nextZones });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingTarget(null);
  };

  const finishZone = () => {
    if (zoneDraft.length < 3) return;
    const newZone: ZoneRule = {
      name: activeZoneName || `Zone ${rules.zones.length + 1}`,
      vertices: zoneDraft,
      dwell_seconds: 5.0,
      max_gap_frames: 5,
    };
    onUpdateRules({ ...rules, zones: [...rules.zones, newZone] });
    setZoneDraft([]);
    setActiveZoneName(`Zone ${rules.zones.length + 2}`);
    setActiveTool('view');
  };

  const handleSave = () => {
    onSaveRules(rules);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Interactive Tool Ribbon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(0,0,0,0.3)',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="tool-view"
            className={`btn ${activeTool === 'view' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => { setActiveTool('view'); setLineDraft([]); setZoneDraft([]); }}
            title="Inspect preview without editing"
          >
            <Eye size={15} />
            <span>View</span>
          </button>

          <button
            id="tool-draw-line"
            className={`btn ${activeTool === 'draw_line' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => { setActiveTool('draw_line'); setLineDraft([]); setZoneDraft([]); }}
            title="Click two points to define bidirectional line crossing"
          >
            <Edit3 size={15} />
            <span>Draw Line</span>
          </button>

          <button
            id="tool-draw-zone"
            className={`btn ${activeTool === 'draw_zone' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => { setActiveTool('draw_zone'); setLineDraft([]); setZoneDraft([]); }}
            title="Click at least 3 points to create polygon zone"
          >
            <PlusSquare size={15} />
            <span>Draw Zone</span>
          </button>

          <button
            id="tool-edit"
            className={`btn ${activeTool === 'edit' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => { setActiveTool('edit'); setLineDraft([]); setZoneDraft([]); }}
            title="Click and drag line endpoints or zone vertices"
          >
            <Move size={15} />
            <span>Edit Vertices</span>
          </button>
        </div>

        {/* Zone draft finishing action */}
        {activeTool === 'draw_zone' && zoneDraft.length >= 3 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              className="input-text"
              style={{ width: '130px', padding: '4px 8px' }}
              value={activeZoneName}
              onChange={(e) => setActiveZoneName(e.target.value)}
              placeholder="Zone Name"
            />
            <button className="btn btn-primary" onClick={finishZone}>
              <CheckCircle2 size={15} />
              <span>Finish Polygon</span>
            </button>
          </div>
        )}

        {/* Clear and Save actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {rules.line && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              onClick={() => onUpdateRules({ ...rules, line: null })}
              title="Remove counting line"
            >
              <Trash2 size={13} color="#FDA4AF" />
              <span>Line</span>
            </button>
          )}

          {rules.zones.length > 0 && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              onClick={() => onUpdateRules({ ...rules, zones: [] })}
              title="Remove all polygon zones"
            >
              <Trash2 size={13} color="#FDA4AF" />
              <span>Zones ({rules.zones.length})</span>
            </button>
          )}

          <button
            id="save-rules-btn"
            className="btn btn-primary"
            onClick={handleSave}
            title="Sync line and zone rules directly to backend"
          >
            {saveSuccess ? <CheckCircle2 size={15} /> : <CheckCircle2 size={15} />}
            <span>{saveSuccess ? 'Rules Synced!' : 'Apply Rules'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Viewport with Overlay Canvas */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#030508',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Stream image */}
        <img
          key={streamKey}
          src={`/api/preview?t=${streamKey}`}
          alt="ZoneLens Live Stream"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={() => {
            // Retry image connection after 2 seconds
            setTimeout(() => setStreamKey(Date.now()), 2000);
          }}
        />

        {!isRunning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(3, 5, 8, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: 'var(--text-dim)',
            zIndex: 5,
          }}>
            <RotateCcw size={36} color="#9CA3AF" />
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#E5E7EB' }}>
              Video stream stopped.
            </p>
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
              Click "Start Analysis" below or choose a source to run tracking.
            </p>
          </div>
        )}

        {/* Interactive Drawing Canvas Layer */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor:
              activeTool === 'draw_line' || activeTool === 'draw_zone'
                ? 'crosshair'
                : activeTool === 'edit'
                ? 'grab'
                : 'default',
          }}
        />

        {/* Tooltip helper at bottom left */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          padding: '4px 10px',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
          border: '1px solid var(--border-subtle)'
        }}>
          {activeTool === 'draw_line' && 'Line Mode: Click start, then click end point to set crossing vector.'}
          {activeTool === 'draw_zone' && 'Zone Mode: Click points to draw polygon. Click near first point or "Finish Polygon" to close.'}
          {activeTool === 'edit' && 'Edit Mode: Click & drag any line endpoint or polygon vertex to adjust.'}
          {activeTool === 'view' && 'View Mode: Switch to Draw Line or Draw Zone above to customize analytics.'}
        </div>
      </div>
    </div>
  );
};
