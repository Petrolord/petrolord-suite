// The digitizer's picture (PT7): the scan drawn at a display scale with
// calibration lines, the trace box, the colour seed and the points on
// top. Every callback speaks NATURAL image pixels; the display scale is
// this component's business only, so the tracer, the calibration and
// the saved provenance all share one frame.
//
// interaction:
//   'calibrate'  click reports a point (the dialog assigns it to the armed row)
//   'manual'     click appends a point
//   'roi'        drag draws the box; shift-click reports a colour seed
//   'review'     drag moves the nearest point, click on empty adds one,
//                alt-click or right-click removes one
//   null         inert

import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_W = 560;
const HIT_PX = 7;

export default function ScanCanvas({
  imgEl, width, height, interaction,
  depthCal = [], valueCal = [], roi = null, seed = null, points = [], hoverIndex = null,
  onPoint, onSeed, onRoi, onMovePoint, onRemovePoint, onHover,
}) {
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [tick, setTick] = useState(0);
  const scale = useMemo(() => Math.min(1, MAX_W / Math.max(1, width || 1)), [width]);
  const dw = Math.max(1, Math.round((width || 1) * scale));
  const dh = Math.max(1, Math.round((height || 1) * scale));

  const toNatural = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width - 1, (e.clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(height - 1, (e.clientY - rect.top) / scale)),
    };
  };
  const nearest = (pt) => {
    let best = -1;
    let bd = (HIT_PX / scale) ** 2;
    points.forEach((p, i) => {
      const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
      if (d <= bd) { bd = d; best = i; }
    });
    return best;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, dw, dh);
    try { ctx.drawImage(imgEl, 0, 0, dw, dh); } catch (_e) { /* image not decoded yet */ }
    const s = scale;
    // calibration lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#06b6d4';
    for (const c of depthCal) {
      if (!c || c.pixel == null) continue;
      const y = Math.round(c.pixel * s) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(dw, y); ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    for (const c of valueCal) {
      if (!c || c.pixel == null) continue;
      const x = Math.round(c.pixel * s) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, dh); ctx.stroke();
    }
    // trace box
    const box = drag.current?.kind === 'roi' ? drag.current.roi : roi;
    if (box) {
      const x = Math.min(box.x1, box.x2) * s;
      const y = Math.min(box.y1, box.y2) * s;
      const w = Math.abs(box.x2 - box.x1) * s;
      const h = Math.abs(box.y2 - box.y1) * s;
      ctx.fillStyle = 'rgba(34,211,238,0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#22d3ee';
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.setLineDash([]);
    }
    if (seed) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(seed.x * s, seed.y * s, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // points
    if (points.length) {
      // white halo under the red trace so it reads on red or black curves
      ctx.beginPath();
      points.forEach((p, i) => { if (i) ctx.lineTo(p.x * s, p.y * s); else ctx.moveTo(p.x * s, p.y * s); });
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 1;
      const many = points.length > 400;
      points.forEach((p, i) => {
        if (many && i % 8 !== 0 && i !== hoverIndex) return;
        ctx.fillStyle = i === hoverIndex ? '#fbbf24' : '#ef4444';
        ctx.beginPath(); ctx.arc(p.x * s, p.y * s, i === hoverIndex ? 4 : 2, 0, Math.PI * 2); ctx.fill();
      });
    }
  }, [imgEl, dw, dh, scale, depthCal, valueCal, roi, seed, points, hoverIndex, tick]);

  const onPointerDown = (e) => {
    if (!interaction || e.button === 2) return;
    const pt = toNatural(e);
    if (interaction === 'roi') {
      if (e.shiftKey) { onSeed?.(pt); return; }
      drag.current = { kind: 'roi', roi: { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }, moved: false };
      canvasRef.current.setPointerCapture?.(e.pointerId);
    } else if (interaction === 'review') {
      const i = nearest(pt);
      if (i >= 0 && e.altKey) { onRemovePoint?.(i); return; }
      if (i >= 0) {
        drag.current = { kind: 'point', index: i, moved: false };
        canvasRef.current.setPointerCapture?.(e.pointerId);
      } else if (!e.altKey) {
        onPoint?.(pt, { shift: e.shiftKey, alt: e.altKey });
      }
    }
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const pt = toNatural(e);
    if (!d) {
      if (interaction === 'review') onHover?.(nearest(pt));
      return;
    }
    if (d.kind === 'roi') {
      d.roi = { ...d.roi, x2: pt.x, y2: pt.y };
      d.moved = true;
      setTick((t) => t + 1);
    } else if (d.kind === 'point') {
      d.moved = true;
      onMovePoint?.(d.index, pt, false);
    }
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const pt = toNatural(e);
    if (d.kind === 'roi') {
      if (d.moved) onRoi?.({ x1: d.roi.x1, y1: d.roi.y1, x2: pt.x, y2: pt.y });
      else setTick((t) => t + 1);
    } else if (d.kind === 'point') {
      onMovePoint?.(d.index, pt, true);
    }
  };
  const onClick = (e) => {
    if (interaction === 'calibrate' || interaction === 'manual') {
      onPoint?.(toNatural(e), { shift: e.shiftKey, alt: e.altKey });
    }
  };
  const onContextMenu = (e) => {
    if (interaction !== 'review') return;
    e.preventDefault();
    const i = nearest(toNatural(e));
    if (i >= 0) onRemovePoint?.(i);
  };

  const cursor = {
    calibrate: 'crosshair', manual: 'crosshair', roi: 'crosshair', review: hoverIndex != null && hoverIndex >= 0 ? 'grab' : 'copy',
  }[interaction] || 'default';

  return (
    <canvas
      ref={canvasRef}
      data-testid="petro-digitizer-canvas"
      data-scale={scale}
      style={{ cursor, display: 'block', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
}
