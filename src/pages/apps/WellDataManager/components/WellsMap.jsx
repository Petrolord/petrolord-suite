// Well map: surface locations on a canvas (dark workstation viewport,
// like Seismolord's MapView — this is a navigation view, not an
// analytic chart, so the white chartTheme does not apply). Extent fits
// all wells with padding; clicking selects the nearest well.

import React, { useEffect, useMemo, useRef } from 'react';

const PAD = 40;           // px inside the canvas
const HIT_RADIUS = 14;    // px pick tolerance

/** Wells with a usable surface location. A well may carry none (never
 *  imported with coordinates, or the Header tab cleared them, PT8), and
 *  Math.min would read a null as 0 and drag the extent to the origin. */
const coord = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
// WDM-U1-017: Number(null) is 0, so a cleared coordinate used to pass the
// finite test and put the well at the origin
export const mappable = (wells) => (wells || []).filter((w) => coord(w.surface_x) && coord(w.surface_y));

/**
 * What the map caption says about the frame and the wells left off it
 * (WDM-U1-011, WDM-U1-016): the coordinate systems and units actually in
 * use, a warning when wells sit in more than one (their positions are
 * then not comparable on one canvas), and how many wells have no surface
 * location and are not drawn.
 * @returns {{frame: string, mixed: boolean, undrawn: number}}
 */
export function mapFrameSummary(wells) {
  const all = wells || [];
  const drawn = mappable(all);
  const frames = new Map();
  for (const w of drawn) {
    const key = `${w.crs || 'CRS unknown'}|${w.xy_unit || 'm'}`;
    frames.set(key, (frames.get(key) || 0) + 1);
  }
  const labels = [...frames.keys()].map((k) => { const [c, u] = k.split('|'); return `${c}, ${u}`; });
  return {
    frame: labels.length ? labels.join('; ') : 'no located wells',
    mixed: frames.size > 1,
    undrawn: all.length - drawn.length,
  };
}

function fitExtent(wells) {
  const xs = wells.map((w) => Number(w.surface_x));
  const ys = wells.map((w) => Number(w.surface_y));
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  // degenerate extents (single well / colinear) get a nominal margin
  if (!(maxX - minX > 0)) { minX -= 250; maxX += 250; }
  if (!(maxY - minY > 0)) { minY -= 250; maxY += 250; }
  return { minX, maxX, minY, maxY };
}

export default function WellsMap({ wells, selectedId, onSelect, height = 480 }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const placedRef = useRef([]); // [{id, px, py}] for hit-testing

  const placed = useMemo(() => mappable(wells), [wells]);
  const summary = useMemo(() => mapFrameSummary(wells), [wells]);
  const extent = useMemo(() => (placed.length ? fitExtent(placed) : null), [placed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth || 640;
    const cssH = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);

    placedRef.current = [];
    if (!extent) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No wells to map yet', cssW / 2, cssH / 2);
      return;
    }

    const { minX, maxX, minY, maxY } = extent;
    // uniform scale (metres are metres in both axes), Y up
    const scale = Math.min((cssW - 2 * PAD) / (maxX - minX), (cssH - 2 * PAD) / (maxY - minY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toPx = (x, y) => ({
      px: cssW / 2 + (x - cx) * scale,
      py: cssH / 2 - (y - cy) * scale,
    });

    // grid: round world step near 1/5 of the extent
    const targetStep = Math.max(maxX - minX, maxY - minY) / 5;
    const step = 10 ** Math.floor(Math.log10(targetStep));
    const gridStep = targetStep / step >= 5 ? 5 * step : targetStep / step >= 2 ? 2 * step : step;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    ctx.fillStyle = '#475569';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(minX / gridStep) * gridStep; gx <= maxX; gx += gridStep) {
      const { px } = toPx(gx, cy);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cssH); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round(gx)), px + 2, cssH - 4);
    }
    for (let gy = Math.ceil(minY / gridStep) * gridStep; gy <= maxY; gy += gridStep) {
      const { py } = toPx(cx, gy);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cssW, py); ctx.stroke();
      ctx.fillText(String(Math.round(gy)), 4, py - 2);
    }

    for (const w of placed) {
      const { px, py } = toPx(Number(w.surface_x), Number(w.surface_y));
      placedRef.current.push({ id: w.id, px, py });
      const sel = w.id === selectedId;
      ctx.beginPath();
      ctx.arc(px, py, sel ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = w.organization_id ? '#34d399' : '#fbbf24';
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = sel ? '#a5f3fc' : '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(w.name, px + 8, py + 4);
    }
  }, [placed, selectedId, extent, height]);

  const pick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    for (const p of placedRef.current) {
      const d = Math.hypot(p.px - x, p.py - y);
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best) onSelect(best.id);
  };

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        data-testid="wdm-map"
        data-canvas="dark"
        className="rounded-pl-canvas border border-pl-border cursor-pointer"
        onClick={pick}
      />
      <p className="mt-1 text-[11px] text-pl-muted" data-testid="wdm-map-caption">
        Surface locations ({summary.frame}). Amber = private, green = org-shared; click a well to open it.
        {summary.undrawn > 0 && ` ${summary.undrawn} well${summary.undrawn === 1 ? ' has' : 's have'} no surface location and ${summary.undrawn === 1 ? 'is' : 'are'} not drawn.`}
      </p>
      {summary.mixed && (
        <p className="mt-1 text-[11px] text-pl-warning-text" data-testid="wdm-map-mixed">
          These wells are stored in more than one coordinate system, so their positions here are not comparable. Assign or reproject them to the Project CRS.
        </p>
      )}
    </div>
  );
}
