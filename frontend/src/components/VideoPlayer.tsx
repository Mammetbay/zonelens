import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, Edit3, Move, PlusSquare, Trash2, CheckCircle2, RotateCcw, AlertCircle, XCircle } from 'lucide-react';
import type { RulesData, EditorTool, LineRule, ZoneRule } from '../types';
import {
  calculateRenderedVideoRect,
  clientToNormalizedVideo,
  normalizedToCanvasPixels,
  pointDistance,
  isValidLineSegment,
  type Rect,
  type Point,
} from '../utils/geometry';

interface VideoPlayerProps {
  rules: RulesData;
  onUpdateRules: (rules: RulesData) => void;
  onSaveRules: (rules: RulesData) => void;
  isRunning: boolean;
  hasUnsavedRules?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  rules,
  onUpdateRules,
  onSaveRules,
  isRunning,
  hasUnsavedRules,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [activeTool, setActiveTool] = useState<EditorTool>('view');
  const [videoRect, setVideoRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  // Drawing state
  const [lineDraft, setLineDraft] = useState<Point[]>([]);
  const [zoneDraft, setZoneDraft] = useState<Point[]>([]);
  const [activeZoneName, setActiveZoneName] = useState<string>('Zone 1');
  const [hoveredVertex, setHoveredVertex] = useState<{ zoneIndex: number; vertexIndex: number } | null>(null);

  const [draggingTarget, setDraggingTarget] = useState<{
    type: 'line_start' | 'line_end' | 'zone_vertex';
    zoneIndex?: number;
    vertexIndex?: number;
  } | null>(null);

  // Stream reload key to force reconnect if stream stops/restarts
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Measure rendered video rect inside the container
  const updateDimensions = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const naturalWidth = imgRef.current?.naturalWidth || 16;
    const naturalHeight = imgRef.current?.naturalHeight || 9;
    const videoAspect = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 16 / 9;

    const rect = calculateRenderedVideoRect(width, height, videoAspect);
    setVideoRect(rect);
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [updateDimensions]);

  // Convert client coordinates to normalized video frame coordinates
  const getNormalizedCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const canvasRect = canvas.getBoundingClientRect();
      return clientToNormalizedVideo(clientX, clientY, canvasRect, videoRect);
    },
    [videoRect]
  );

  // Global window pointer listeners for robust drag handling (prevents getting stuck outside canvas)
  useEffect(() => {
    if (!draggingTarget) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const coords = getNormalizedCoords(e.clientX, e.clientY);

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

    const handleWindowPointerUp = () => {
      setDraggingTarget(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [draggingTarget, getNormalizedCoords, onUpdateRules, rules, videoRect]);

  // Redraw canvas overlay with letterbox compensation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || videoRect.width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Zones
    rules.zones.forEach((z, zIdx) => {
      if (z.vertices.length < 3) return;
      ctx.beginPath();
      const firstPixel = normalizedToCanvasPixels(z.vertices[0], videoRect);
      ctx.moveTo(firstPixel[0], firstPixel[1]);

      for (let i = 1; i < z.vertices.length; i++) {
        const p = normalizedToCanvasPixels(z.vertices[i], videoRect);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#10B981';
      ctx.stroke();

      // Label
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = '#34D399';
      ctx.fillText(`⬡ ${z.name} (${z.dwell_seconds}s)`, firstPixel[0] + 8, firstPixel[1] + 18);

      // Edit handles
      if (activeTool === 'edit') {
        z.vertices.forEach((pt, vIdx) => {
          const pix = normalizedToCanvasPixels(pt, videoRect);
          const isHovered = hoveredVertex?.zoneIndex === zIdx && hoveredVertex?.vertexIndex === vIdx;

          ctx.beginPath();
          ctx.arc(pix[0], pix[1], isHovered ? 8 : 6, 0, 2 * Math.PI);
          ctx.fillStyle = isHovered ? '#F59E0B' : '#34D399';
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
      const firstPix = normalizedToCanvasPixels(zoneDraft[0], videoRect);
      ctx.moveTo(firstPix[0], firstPix[1]);
      for (let i = 1; i < zoneDraft.length; i++) {
        const pix = normalizedToCanvasPixels(zoneDraft[i], videoRect);
        ctx.lineTo(pix[0], pix[1]);
      }
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      zoneDraft.forEach((pt, idx) => {
        const pix = normalizedToCanvasPixels(pt, videoRect);
        ctx.beginPath();
        ctx.arc(pix[0], pix[1], idx === 0 ? 8 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 0 ? '#F59E0B' : '#06B6D4';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // 3. Draw Counting Line
    if (rules.line) {
      const p1 = normalizedToCanvasPixels(rules.line.start, videoRect);
      const p2 = normalizedToCanvasPixels(rules.line.end, videoRect);

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
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = '#C4B5FD';
      ctx.fillText(
        `➜ ${rules.line.positive_label.toUpperCase()} / ${rules.line.negative_label.toUpperCase()}`,
        (p1[0] + p2[0]) / 2 + 10,
        (p1[1] + p2[1]) / 2 - 8
      );

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
      const p = normalizedToCanvasPixels(lineDraft[0], videoRect);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.font = '500 12px Inter, sans-serif';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText('Click second point to finish line', p[0] + 10, p[1] - 8);
    }
  }, [rules, zoneDraft, lineDraft, activeTool, videoRect, hoveredVertex]);

  // Handle canvas pointer down
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Only respond to main button
    if (e.button !== 0 && e.button !== 2) return;

    const coords = getNormalizedCoords(e.clientX, e.clientY);

    // Right click in edit mode to delete vertex
    if (e.button === 2 && activeTool === 'edit') {
      e.preventDefault();
      for (let zIdx = 0; zIdx < rules.zones.length; zIdx++) {
        const z = rules.zones[zIdx];
        for (let vIdx = 0; vIdx < z.vertices.length; vIdx++) {
          const v = z.vertices[vIdx];
          if (pointDistance(coords, v) < 0.04) {
            if (z.vertices.length > 3) {
              const updatedZones = [...rules.zones];
              updatedZones[zIdx] = {
                ...z,
                vertices: z.vertices.filter((_, i) => i !== vIdx),
              };
              onUpdateRules({ ...rules, zones: updatedZones });
              setStatusNotice(`Deleted vertex from ${z.name}`);
              setTimeout(() => setStatusNotice(null), 2000);
            } else {
              setStatusNotice('Polygons require at least 3 vertices.');
              setTimeout(() => setStatusNotice(null), 2500);
            }
            return;
          }
        }
      }
      return;
    }

    if (e.button !== 0) return;

    if (activeTool === 'draw_line') {
      if (lineDraft.length === 0) {
        setLineDraft([coords]);
      } else {
        const startPt = lineDraft[0];
        if (!isValidLineSegment(startPt, coords, 0.03)) {
          setStatusNotice('Line is too short. Place points further apart.');
          setTimeout(() => setStatusNotice(null), 2000);
          return;
        }

        const newLine: LineRule = {
          start: startPt,
          end: coords,
          positive_label: rules.line?.positive_label || 'in',
          negative_label: rules.line?.negative_label || 'out',
          hysteresis_px: rules.line?.hysteresis_px || 3.0,
          max_gap_frames: rules.line?.max_gap_frames || 5,
        };
        onUpdateRules({ ...rules, line: newLine });
        setLineDraft([]);
        setActiveTool('view');
        setStatusNotice('Counting line created! Click "Apply Rules" to sync.');
        setTimeout(() => setStatusNotice(null), 3000);
      }
    } else if (activeTool === 'draw_zone') {
      if (zoneDraft.length >= 2) {
        // If clicking near start point, close zone
        const startPt = zoneDraft[0];
        if (pointDistance(coords, startPt) < 0.05) {
          finishZone();
          return;
        }
      }
      setZoneDraft([...zoneDraft, coords]);
    } else if (activeTool === 'edit') {
      // Check hit on line start/end
      if (rules.line) {
        if (pointDistance(coords, rules.line.start) < 0.04) {
          setDraggingTarget({ type: 'line_start' });
          return;
        }
        if (pointDistance(coords, rules.line.end) < 0.04) {
          setDraggingTarget({ type: 'line_end' });
          return;
        }
      }
      // Check hit on zone vertices
      for (let zIdx = 0; zIdx < rules.zones.length; zIdx++) {
        const z = rules.zones[zIdx];
        for (let vIdx = 0; vIdx < z.vertices.length; vIdx++) {
          if (pointDistance(coords, z.vertices[vIdx]) < 0.04) {
            setDraggingTarget({ type: 'zone_vertex', zoneIndex: zIdx, vertexIndex: vIdx });
            return;
          }
        }
      }
    }
  };

  // Track hover for cursor changes and delete hints
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'edit') {
      setHoveredVertex(null);
      return;
    }
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    for (let zIdx = 0; zIdx < rules.zones.length; zIdx++) {
      const z = rules.zones[zIdx];
      for (let vIdx = 0; vIdx < z.vertices.length; vIdx++) {
        if (pointDistance(coords, z.vertices[vIdx]) < 0.04) {
          setHoveredVertex({ zoneIndex: zIdx, vertexIndex: vIdx });
          return;
        }
      }
    }
    setHoveredVertex(null);
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
    setStatusNotice(`Zone "${newZone.name}" created! Click "Apply Rules" to sync.`);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleSave = () => {
    onSaveRules(rules);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const cancelDraft = () => {
    setLineDraft([]);
    setZoneDraft([]);
    setActiveTool('view');
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Interactive Tool Ribbon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(0,0,0,0.3)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="tool-view"
            className={`btn ${activeTool === 'view' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTool('view');
              setLineDraft([]);
              setZoneDraft([]);
            }}
            title="Inspect preview without editing"
          >
            <Eye size={15} />
            <span>View</span>
          </button>

          <button
            id="tool-draw-line"
            className={`btn ${activeTool === 'draw_line' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTool('draw_line');
              setLineDraft([]);
              setZoneDraft([]);
            }}
            title="Click two points to define bidirectional line crossing"
          >
            <Edit3 size={15} />
            <span>Draw Line</span>
          </button>

          <button
            id="tool-draw-zone"
            className={`btn ${activeTool === 'draw_zone' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTool('draw_zone');
              setLineDraft([]);
              setZoneDraft([]);
            }}
            title="Click at least 3 points to create polygon zone"
          >
            <PlusSquare size={15} />
            <span>Draw Zone</span>
          </button>

          <button
            id="tool-edit"
            className={`btn ${activeTool === 'edit' ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTool('edit');
              setLineDraft([]);
              setZoneDraft([]);
            }}
            title="Click & drag handles to adjust. Right click a vertex to delete."
          >
            <Move size={15} />
            <span>Edit Vertices</span>
          </button>

          {(lineDraft.length > 0 || zoneDraft.length > 0) && (
            <button className="btn btn-secondary" onClick={cancelDraft} title="Cancel current drawing">
              <XCircle size={14} color="#FDA4AF" />
              <span>Cancel</span>
            </button>
          )}
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
            className={`btn ${hasUnsavedRules ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleSave}
            title="Sync line and zone rules directly to backend"
          >
            <CheckCircle2 size={15} />
            <span>{saveSuccess ? 'Rules Synced!' : hasUnsavedRules ? 'Apply Rules *' : 'Rules Synced'}</span>
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
          ref={imgRef}
          key={streamKey}
          src={`/api/preview?t=${streamKey}`}
          alt="ZoneLens Live Stream"
          onLoad={updateDimensions}
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
          <div
            style={{
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
            }}
          >
            <RotateCcw size={36} color="#9CA3AF" />
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#E5E7EB' }}>Video stream stopped.</p>
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
              Click "Start Analysis" below or choose a source to run tracking.
            </p>
          </div>
        )}

        {/* Interactive Drawing Canvas Layer */}
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onMouseMove={handleCanvasMouseMove}
          onContextMenu={(e) => {
            if (activeTool === 'edit') e.preventDefault();
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            touchAction: 'none',
            cursor:
              activeTool === 'draw_line' || activeTool === 'draw_zone'
                ? 'crosshair'
                : activeTool === 'edit'
                ? hoveredVertex
                  ? 'pointer'
                  : draggingTarget
                  ? 'grabbing'
                  : 'grab'
                : 'default',
          }}
        />

        {/* Status notification toast */}
        {statusNotice && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              background: 'rgba(17, 24, 39, 0.9)',
              backdropFilter: 'blur(8px)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--accent-cyan)',
              color: '#38BDF8',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              zIndex: 10,
            }}
          >
            <AlertCircle size={14} />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Tooltip helper at bottom left */}
        <div
          style={{
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
            border: '1px solid var(--border-subtle)',
          }}
        >
          {activeTool === 'draw_line' && 'Line Mode: Click start, then click end point to set crossing vector.'}
          {activeTool === 'draw_zone' &&
            'Zone Mode: Click points to draw polygon. Click near first point or "Finish Polygon" to close.'}
          {activeTool === 'edit' &&
            'Edit Mode: Drag handles to adjust. Right-click vertex to delete (minimum 3 required).'}
          {activeTool === 'view' && 'View Mode: Switch to Draw Line or Draw Zone above to customize analytics.'}
        </div>
      </div>
    </div>
  );
};
