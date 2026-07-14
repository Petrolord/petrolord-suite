// Model map viewport (Earth Modeling G8.2): any model layer (surface
// depth, zone thickness, property, fault blocks) as a color raster
// with contours, posted wells, fault polygons, and click-to-draw fault
// polygon editing. Dark map viewport (Seismolord/Mapping MapView
// lineage — a map, not an analytic chart). Canvas; reuses the shared
// byte-golden contour/raster math (src/lib/gridding/mapContours).

import React, { useEffect, useMemo, useRef } from 'react';
import {
  contourLevels, contourPolylines, buildMapPixels, gridRange,
} from '@/lib/gridding/mapContours';

const PAD = 44;

function makeLut() {
  const stops = [
    [0.0, [40, 60, 160]], [0.25, [40, 180, 200]], [0.5, [60, 190, 90]],
    [0.75, [230, 210, 70]], [1.0, [210, 60, 50]],
  ];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const f = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (f >= stops[s][0] && f <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const t = (f - a[0]) / (b[0] - a[0] || 1);
    for (let k = 0; k < 3; k++) lut[i * 4 + k] = Math.round(a[1][k] + t * (b[1][k] - a[1][k]));
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export default function MapView({
  spec, grid, wells = [], polygons = [], pendingVertices = [],
  drawing = false, onMapClick, contours = true, height = 480, label = '',
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const toWorldRef = useRef(null);
  const lut = useMemo(makeLut, []);
  const range = useMemo(() => (grid ? gridRange(grid) : null), [grid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !spec || !grid) return;
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

    const { x0, y0, nx, ny, dx, dy } = spec;
    const wMinX = x0;
    const wMaxX = x0 + (nx - 1) * dx;
    const wMinY = y0;
    const wMaxY = y0 + (ny - 1) * dy;
    const scale = Math.min((cssW - 2 * PAD) / (wMaxX - wMinX || 1), (cssH - 2 * PAD) / (wMaxY - wMinY || 1));
    const cx = (wMinX + wMaxX) / 2;
    const cy = (wMinY + wMaxY) / 2;
    const toPx = (x, y) => ({ px: cssW / 2 + (x - cx) * scale, py: cssH / 2 - (y - cy) * scale });
    toWorldRef.current = (px, py) => ({ x: cx + (px - cssW / 2) / scale, y: cy - (py - cssH / 2) / scale });
    const colToX = (c) => x0 + c * dx;
    const rowToY = (r) => y0 + r * dy;

    if (!range) return;
    const { zMin, zMax } = range;

    const rgba = buildMapPixels(grid, ny, nx, lut, zMin, zMax === zMin ? zMin + 1 : zMax);
    const off = document.createElement('canvas');
    off.width = nx; off.height = ny;
    off.getContext('2d').putImageData(new ImageData(rgba, nx, ny), 0, 0);
    const tl = toPx(colToX(0), rowToY(ny - 1));
    const br = toPx(colToX(nx - 1), rowToY(0));
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.translate(tl.px, tl.py);
    ctx.scale((br.px - tl.px) / nx, (br.py - tl.py) / ny);
    ctx.drawImage(off, 0, 0);
    ctx.restore();

    if (contours && zMax > zMin) {
      const { levels } = contourLevels(zMin, zMax, 10);
      ctx.lineWidth = 1;
      for (const lvl of levels) {
        const polys = contourPolylines(grid, ny, nx, lvl);
        ctx.strokeStyle = 'rgba(15,23,42,0.55)';
        for (const poly of polys) {
          ctx.beginPath();
          for (let k = 0; k < poly.length; k += 2) {
            const { px, py } = toPx(colToX(poly[k]), rowToY(poly[k + 1]));
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
      }
    }

    // fault polygons (committed, gold) + the in-progress ring (dashed)
    const drawRing = (verts, stroke, dash, close) => {
      if (!verts.length) return;
      ctx.strokeStyle = stroke;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      verts.forEach((v, i) => {
        const [vx, vy] = Array.isArray(v) ? v : [v.x, v.y];
        const { px, py } = toPx(vx, vy);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      if (close) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const p of polygons) drawRing(p.vertices, '#eab308', [], true);
    drawRing(pendingVertices, '#f97316', [4, 3], false);
    for (const v of pendingVertices) {
      const { px, py } = toPx(v[0], v[1]);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    for (const w of wells) {
      if (!Number.isFinite(w.surface_x)) continue;
      const { px, py } = toPx(w.surface_x, w.surface_y);
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(w.name, px + 5, py + 3);
    }

    // colorbar
    const cbX = cssW - 16;
    const cbY = PAD;
    const cbH = cssH - 2 * PAD;
    for (let i = 0; i < cbH; i++) {
      const li = Math.round((1 - i / cbH) * 255) * 4;
      ctx.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`;
      ctx.fillRect(cbX, cbY + i, 8, 1);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(zMax.toFixed(zMax - zMin < 2 ? 3 : 0), cbX - 2, cbY + 8);
    ctx.fillText(zMin.toFixed(zMax - zMin < 2 ? 3 : 0), cbX - 2, cbY + cbH);
    if (label) {
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      ctx.font = '10px sans-serif';
      ctx.fillText(label, 8, 14);
    }
  }, [spec, grid, wells, polygons, pendingVertices, range, lut, height, contours, label]);

  const handleClick = (e) => {
    if (!drawing || !onMapClick || !toWorldRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    onMapClick(toWorldRef.current(e.clientX - rect.left, e.clientY - rect.top));
  };

  return (
    <div ref={wrapRef} className="w-full" data-testid="em-map-wrap">
      <canvas
        ref={canvasRef}
        data-testid="em-map-canvas"
        className={`rounded border border-slate-800 ${drawing ? 'cursor-crosshair' : ''}`}
        onClick={handleClick}
      />
      {range && (
        <p className="mt-1 text-[11px] text-slate-500" data-testid="em-map-zrange">
          {label ? `${label} · ` : ''}{range.zMin.toFixed(2)} – {range.zMax.toFixed(2)} · {spec?.nx}×{spec?.ny} grid
          {drawing ? ' · click to add fault-polygon vertices' : ''}
        </p>
      )}
    </div>
  );
}
