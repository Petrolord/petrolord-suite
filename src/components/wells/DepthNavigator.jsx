// Depth navigator (PT5, 2026-09-03): the "scroll picker" beside a vertical
// log viewer. A miniature of the whole well with the current window as a
// band: drag the band to scroll, drag its handles to squeeze or stretch
// the vertical scale, click outside it to jump, wheel to zoom, double
// click to see the full well; arrow keys and PageUp/PageDown when focused.
// Shared by Petrophysics TrackViewer and MultiWellTracks and by Well
// Correlation CrossSection; all the arithmetic is depthNavMath.js.
//
// Presentation only: `view` is [top, base] in the viewer's displayed depth
// or null for the full extent, and every change goes out through
// onViewChange. Depth labels print in `depthUnit`; `tvdLookup` swaps the
// labels to TVD the way the track axis does.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveView, panBy, zoomAbout, dragEdge, centerOn, stepPan, hitNav, navYOf, navDOf, decimateProfile, MIN_SPAN_M,
} from './depthNavMath';

const THEMES = {
  light: { bg: '#ffffff', frame: 'rgba(148,163,184,0.9)', text: '#475569', profile: 'rgba(71,85,105,0.55)', band: 'rgba(14,116,144,0.16)', bandEdge: 'rgba(14,116,144,0.9)', handle: '#0e7490', handleText: '#0f172a' },
  dark: { bg: '#0f172a', frame: 'rgba(71,85,105,0.9)', text: '#94a3b8', profile: 'rgba(148,163,184,0.55)', band: 'rgba(34,211,238,0.18)', bandEdge: 'rgba(34,211,238,0.9)', handle: '#22d3ee', handleText: '#e2e8f0' },
};
const M_PER_FT = 0.3048;

export default function DepthNavigator({
  extent, view, onViewChange, profile = null, tops = [], zones = [], depthUnit = 'm', tvdLookup = null,
  headerOffset = 0, bottomPad = 4, minSpan = MIN_SPAN_M, theme = 'light', testId = 'depth-nav', width = 64,
}) {
  const rootRef = useRef(null);
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const [h, setH] = useState(0);
  const dragRef = useRef(null); // {kind:'top'|'base'|'body', y0, view0}
  const [hover, setHover] = useState(null);
  const t = THEMES[theme] || THEMES.light;
  const ext = extent && Number.isFinite(extent[0]) && Number.isFinite(extent[1]) && extent[1] > extent[0] ? extent : null;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const plotTop = headerOffset;
  const plotH = Math.max(10, h - plotTop - bottomPad);
  const yOf = useCallback((d) => plotTop + navYOf(d, ext || [0, 1], plotH), [plotTop, plotH, ext]);
  const dOf = useCallback((y) => navDOf(y - plotTop, ext || [0, 1], plotH), [plotTop, plotH, ext]);
  const F = depthUnit === 'ft' ? 1 / M_PER_FT : 1;
  const label = (d) => {
    const v = tvdLookup ? tvdLookup(d) : d;
    return Number.isFinite(v) ? (v * F).toFixed(0) : '—';
  };

  const prof = useMemo(() => {
    if (!profile?.depth || !profile?.values || !ext || plotH <= 0) return null;
    const rows = Math.max(1, Math.round(plotH));
    const { mins, maxs } = decimateProfile(profile.depth, profile.values, ext, rows);
    let lo = Number.isFinite(profile.min) ? profile.min : Infinity;
    let hi = Number.isFinite(profile.max) ? profile.max : -Infinity;
    if (!Number.isFinite(profile.min) || !Number.isFinite(profile.max)) {
      for (let i = 0; i < rows; i++) { if (mins[i] < lo) lo = mins[i]; if (maxs[i] > hi) hi = maxs[i]; }
    }
    if (!(hi > lo)) return null;
    return { mins, maxs, lo, hi, rows };
  }, [profile, ext, plotH]);

  // static layer: frame, miniature, zones, tops, extent labels
  useEffect(() => {
    const c = staticRef.current;
    if (!c || !h || !ext) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr); c.height = Math.round(h * dpr);
    c.style.width = `${width}px`; c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, width, h);
    ctx.strokeStyle = t.frame; ctx.strokeRect(0.5, plotTop + 0.5, width - 1, plotH - 1);
    const x0 = 8; const x1 = width - 8;
    for (const z of zones || []) {
      const y0 = yOf(Math.max(z.top, ext[0])); const y1 = yOf(Math.min(z.base, ext[1]));
      if (y1 <= y0) continue;
      ctx.fillStyle = z.color || t.band; ctx.fillRect(1, y0, width - 2, y1 - y0);
    }
    if (prof) {
      ctx.strokeStyle = t.profile; ctx.lineWidth = 1;
      ctx.beginPath();
      const xs = (v) => x0 + ((v - prof.lo) / (prof.hi - prof.lo)) * (x1 - x0);
      for (let r = 0; r < prof.rows; r++) {
        if (!Number.isFinite(prof.mins[r])) continue;
        const y = plotTop + r + 0.5;
        ctx.moveTo(Math.max(x0, Math.min(x1, xs(prof.mins[r]))), y);
        ctx.lineTo(Math.max(x0, Math.min(x1, xs(prof.maxs[r]))) + 0.01, y);
      }
      ctx.stroke();
    }
    for (const tp of tops || []) {
      if (tp.hidden || !Number.isFinite(tp.d) || tp.d < ext[0] || tp.d > ext[1]) continue;
      const y = Math.round(yOf(tp.d)) + 0.5;
      ctx.strokeStyle = tp.color || t.handle; ctx.beginPath(); ctx.moveTo(1, y); ctx.lineTo(width - 1, y); ctx.stroke();
    }
    ctx.fillStyle = t.text; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    if (plotTop >= 10) ctx.fillText(label(ext[0]), width / 2, plotTop - 3);
    ctx.fillText(label(ext[1]), width / 2, Math.min(h - 1, plotTop + plotH + 9));
  }, [h, ext, zones, tops, prof, width, plotTop, plotH, yOf, t, depthUnit, tvdLookup]); // eslint-disable-line react-hooks/exhaustive-deps

  // overlay: the window band and its handles
  useEffect(() => {
    const c = overlayRef.current;
    if (!c || !h || !ext) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr); c.height = Math.round(h * dpr);
    c.style.width = `${width}px`; c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    const [vt, vb] = resolveView(view, ext);
    const y0 = yOf(vt); const y1 = yOf(vb);
    ctx.fillStyle = t.band; ctx.fillRect(1, y0, width - 2, Math.max(1, y1 - y0));
    ctx.strokeStyle = t.bandEdge; ctx.strokeRect(1.5, y0 + 0.5, width - 3, Math.max(1, y1 - y0) - 1);
    ctx.fillStyle = t.handle;
    ctx.fillRect(width / 2 - 10, y0 - 2, 20, 4);
    ctx.fillRect(width / 2 - 10, y1 - 2, 20, 4);
    if (view) {
      ctx.fillStyle = t.handleText; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      if (y0 - plotTop > 12) ctx.fillText(label(vt), width / 2, y0 - 5);
      if (plotTop + plotH - y1 > 12) ctx.fillText(label(vb), width / 2, y1 + 12);
    }
  }, [h, ext, view, width, plotTop, plotH, yOf, t, hover, depthUnit, tvdLookup]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next) => { if (onViewChange) onViewChange(next); };
  const localY = (e) => e.clientY - overlayRef.current.getBoundingClientRect().top;
  const handlePx = (e) => (e.pointerType === 'touch' ? 12 : 6);

  const onPointerDown = (e) => {
    if (!ext) return;
    const y = localY(e);
    const kind = hitNav(y - plotTop, view, ext, plotH, handlePx(e));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (kind === 'outside') {
      const next = centerOn(view, dOf(y), ext) || view;
      commit(next);
      dragRef.current = { kind: 'body', y0: y, view0: next };
      return;
    }
    dragRef.current = { kind, y0: y, view0: view };
  };
  const onPointerMove = (e) => {
    if (!ext) return;
    const y = localY(e);
    const d = dragRef.current;
    if (!d) {
      const kind = hitNav(y - plotTop, view, ext, plotH, handlePx(e));
      setHover(kind);
      e.currentTarget.style.cursor = kind === 'top' || kind === 'base' ? 'ns-resize' : kind === 'body' ? 'grab' : 'pointer';
      return;
    }
    if (d.kind === 'body') {
      const dd = dOf(y) - dOf(d.y0);
      commit(panBy(d.view0, dd, ext));
    } else {
      commit(dragEdge(d.view0, d.kind, dOf(y), ext, minSpan));
    }
  };
  const onPointerUp = (e) => { dragRef.current = null; e.currentTarget.releasePointerCapture(e.pointerId); };
  const onWheel = (e) => {
    if (!ext) return;
    e.preventDefault();
    const next = zoomAbout(view, dOf(localY(e)), e.deltaY > 0 ? 1.25 : 0.8, ext, minSpan);
    if (next !== view) commit(next);
  };
  const onKeyDown = (e) => {
    if (!ext) return;
    const [vt, vb] = resolveView(view, ext);
    const mid = (vt + vb) / 2;
    const map = {
      ArrowDown: () => stepPan(view, ext, 0.1), ArrowUp: () => stepPan(view, ext, -0.1),
      PageDown: () => stepPan(view, ext, 1), PageUp: () => stepPan(view, ext, -1),
      '+': () => zoomAbout(view, mid, 0.8, ext, minSpan), '=': () => zoomAbout(view, mid, 0.8, ext, minSpan),
      '-': () => zoomAbout(view, mid, 1.25, ext, minSpan), Home: () => null,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    commit(map[e.key]());
  };

  const [vt, vb] = ext ? resolveView(view, ext) : [NaN, NaN];
  return (
    <div
      ref={rootRef}
      className="relative shrink-0 h-full select-none touch-none outline-none focus:ring-1 focus:ring-cyan-500/60"
      style={{ width }}
      data-testid={testId}
      data-view-top={Number.isFinite(vt) ? (vt * F).toFixed(1) : ''}
      data-view-base={Number.isFinite(vb) ? (vb * F).toFixed(1) : ''}
      role="scrollbar"
      aria-orientation="vertical"
      aria-valuemin={ext ? Math.round(ext[0] * F) : 0}
      aria-valuemax={ext ? Math.round(ext[1] * F) : 0}
      aria-valuenow={Number.isFinite(vt) ? Math.round(vt * F) : 0}
      tabIndex={0}
      onKeyDown={onKeyDown}
      title="Drag the band to scroll, drag its ends to change the vertical scale, double-click for the full well"
    >
      <canvas ref={staticRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0"
        data-testid={`${testId}-canvas`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={() => commit(null)}
      />
    </div>
  );
}
