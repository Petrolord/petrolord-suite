// The cross-section viewport (Well Correlation G3.2, rebuilt on the shared
// track painter in the WC series, 2026-09-03): one real multi-track log
// column per well from the active layout template (fills, scale rows,
// white printed-log palette, the Petrophysics picture), correlation lines
// between same-named tops, zone bands between correlated tops, datum
// flattening, a synchronized crosshair with per-well readouts, and tops
// that are dragged on their name tag, picked by click, all on a chosen
// depth reference (MD, TVD or TVDSS) in the display unit.
//
// Geometry comes from the vendored engine/section.js plus
// engine/sectionFrame.js; this owns only the depth window, the cursor,
// the in-progress drag and the pick popover. Two canvases: the STATIC
// layer repaints on data or view changes, the CURSOR layer composites it
// and adds the crosshair, readouts and previews on every pointer move.

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { computeFlattening, correlationPolyline, displayedRange, displayedDepth } from '../engine/section';
import {
  toReferenceFrame, depthOfFor, displayedArray, isMonotonic, mdFromDisplayed, columnLayout, zoneBands, DEPTH_REF_LABEL,
} from '../engine/sectionFrame';
import { trackGeometry } from '@/components/wells/trackRender';
import {
  PALETTES, visibleRange, paintDepthAxis, paintTrackHeader, paintTrackBody, paintReadouts, paintTopMarker,
} from '@/components/wells/trackPainter';
import { hitTopAt } from '@/components/wells/hitTest';
import { topColor } from '@/components/wells/topColors';
import { depthLabel } from '@/components/wells/depthModes';
import TopNamePopover from '@/components/wells/TopNamePopover';
import DepthNavigator from '@/components/wells/DepthNavigator';
import { zoomAbout, panBy } from '@/components/wells/depthNavMath';
import { trackPlotPng } from '@/components/wells/plotPng';

export const AXIS_W = 56;      // depth axis gutter (TrackViewer)
export const WELL_H = 26;      // well name band above the track headers
export const HEADER_H = 50;    // track header (title + scale rows + readout)
const PAD_TOP = 2;
const PAD_BOTTOM = 4;
const TAG_MAX = 120;
const MIN_READOUT_W = 60;
const P = PALETTES.light;
const AMBER = '#b45309';
const DATUM = 'rgba(15,23,42,0.55)';

const nearestIdx = (arr, d) => {
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < d) lo = mid; else hi = mid;
  }
  return d - arr[lo] < arr[hi] - d ? lo : hi;
};

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * @param {Object} p
 * @param {Array} p.wells section order: {id, name, is_own, tops, depth (MD), tracks, frame, surface_x, surface_y, kb_m}
 * @param {{mode, topName?, datumM?}} p.datum datumM in the reference depth (metres)
 * @param {'m'|'ft'} [p.depthUnit] display unit, data stays metres
 * @param {'md'|'tvd'|'tvdss'} [p.depthRef] plotted depth reference
 * @param {'equal'|'proportional'} [p.spacing]
 * @param {'none'|'consecutive'|'pair'} [p.zoneMode]
 * @param {?[string,string]} [p.zonePair]
 * @param {string[]} p.shownTops
 * @param {?'top'} [p.pickMode]
 * @param {(top, mdM: number) => void} [p.onTopMove] own wells only
 * @param {(wellId: string, mdM: number, name: string) => void} [p.onTopCreate]
 * @param {() => void} [p.onPickCancel]
 * @param {(msg: string) => void} [p.onNotice]
 */
const CrossSection = forwardRef(function CrossSection({
  wells, datum, depthUnit = 'm', depthRef = 'md', spacing = 'equal', zoneMode = 'consecutive', zonePair = null,
  shownTops, pickMode = null, onTopMove, onTopCreate, onPickCancel, onNotice, topNames = [],
  view: viewProp, onViewChange,
}, exportRef) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const staticRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewState, setViewState] = useState(null);
  const controlled = viewProp !== undefined;
  const view = controlled ? viewProp : viewState;
  const setView = useCallback((next) => {
    if (!controlled) setViewState(next);
    if (onViewChange) onViewChange(next);
  }, [controlled, onViewChange]);
  const [tick, setTick] = useState(0);
  const [cursor, setCursor] = useState(null);     // {y, disp}
  const [topDrag, setTopDrag] = useState(null);   // {top (row), wellIndex, disp}
  const [popover, setPopover] = useState(null);   // {x, y, wellIndex, disp}
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- frame: reference depths, flattening, plotted arrays ----------------
  const frame = useMemo(() => {
    // wells whose reference depth is not monotonic (a horizontal reach)
    // fall back to MD for everything, and say so in their header
    const fallback = new Set();
    if (depthRef !== 'md') {
      for (const w of wells) {
        if (!w.depth?.length) continue;
        if (!isMonotonic(displayedArray(w.depth, depthOfFor(w, depthRef), 0))) fallback.add(w.id);
      }
    }
    const refAll = toReferenceFrame(wells, depthRef);
    const frameWells = wells.map((w, i) => (fallback.has(w.id) ? w : refAll[i]));
    let flattening;
    try {
      flattening = computeFlattening(frameWells, datum);
    } catch {
      flattening = frameWells.map((w) => ({ id: w.id, shift: 0, hasDatumTop: true }));
    }
    const logRanges = {};
    const columns = wells.map((w, i) => {
      const f = flattening[i];
      const depthOf = fallback.has(w.id) ? (md) => md : depthOfFor(w, depthRef);
      const disp = w.depth?.length ? displayedArray(w.depth, depthOf, f.shift) : null;
      if (disp) {
        let a = 0;
        while (a < disp.length && !Number.isFinite(disp[a])) a++;
        let b = disp.length - 1;
        while (b >= 0 && !Number.isFinite(disp[b])) b--;
        if (b > a) logRanges[w.id] = [disp[a], disp[b]];
      }
      return {
        well: w, frameWell: frameWells[i], shift: f.shift, hasDatumTop: f.hasDatumTop,
        disp, fallback: fallback.has(w.id), tracks: w.tracks || [],
        refForWell: fallback.has(w.id) ? 'md' : depthRef,
      };
    });
    const autoRange = displayedRange(frameWells, flattening, logRanges) || [0, 1];
    return { frameWells, flattening, columns, autoRange };
  }, [wells, datum, depthRef]);
  const { frameWells, flattening, columns, autoRange } = frame;
  const [vTop, vBase] = view || autoRange;
  useEffect(() => { setView(null); }, [datum, depthRef, setView]); // refit on a new frame

  // ---- layout -------------------------------------------------------------
  const plotTop = WELL_H + HEADER_H + PAD_TOP;
  const plotH = Math.max(10, size.h - plotTop - PAD_BOTTOM);
  const plotW = Math.max(10, size.w - AXIS_W);
  const boxes = useMemo(
    () => columnLayout(wells, { mode: spacing, plotLeft: AXIS_W, plotW }),
    [wells, spacing, plotW],
  );
  const geoms = useMemo(
    () => columns.map((c, i) => trackGeometry(c.tracks, boxes[i]?.w || 0, 0).map((g) => ({ x0: g.x0 + (boxes[i]?.x0 || 0), w: g.w }))),
    [columns, boxes],
  );
  const yOf = useCallback((d) => plotTop + ((d - vTop) / (vBase - vTop || 1)) * plotH, [plotTop, plotH, vTop, vBase]);
  const dOf = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);
  const colorOf = (name) => topColor(name);
  const columnAt = (x) => boxes.findIndex((b) => x >= b.x0 && x < b.x0 + b.w);

  // shown tops per column in displayed depth (the hit-test shape)
  const columnTops = useMemo(() => columns.map((c) => (c.frameWell.tops || [])
    .filter((t) => shownTops.includes(t.name))
    .map((t) => ({ ...t, md_m: displayedDepth(t.md_m, c.shift), row: c.well.tops.find((r) => r.id === t.id) || t }))),
  [columns, shownTops]);

  const unitTxt = depthUnit === 'ft' ? 'ft' : 'm';
  const axisTitle = datum.mode === 'flatten'
    ? `flattened ${DEPTH_REF_LABEL[depthRef]} (${unitTxt})`
    : `${DEPTH_REF_LABEL[depthRef]} (${unitTxt})`;

  // ---- STATIC layer -------------------------------------------------------
  useEffect(() => {
    if (!size.w || !size.h || !wells.length) return;
    const dpr = window.devicePixelRatio || 1;
    if (!staticRef.current) staticRef.current = document.createElement('canvas');
    const canvas = staticRef.current;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, size.w, size.h);

    // zone bands under everything
    if (zoneMode !== 'none') {
      const pairs = zoneMode === 'pair' ? (zonePair ? [zonePair] : []) : null;
      columns.forEach((c, i) => {
        const box = boxes[i];
        for (const z of zoneBands(c.frameWell, c.shift, shownTops, pairs)) {
          const y0 = yOf(Math.max(z.top, vTop));
          const y1 = yOf(Math.min(z.base, vBase));
          if (y1 <= y0) continue;
          ctx.fillStyle = `${colorOf(z.upper)}1f`;
          ctx.fillRect(box.x0, y0, box.w, y1 - y0);
        }
      });
    }

    paintDepthAxis(ctx, { axisW: AXIS_W, plotTop, plotH, plotRight: size.w, vTop, vBase, yOf, F, title: axisTitle });

    // datum line
    if (datum.mode === 'flatten' && Number.isFinite(datum.datumM)) {
      const y = yOf(datum.datumM);
      ctx.strokeStyle = DATUM;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(AXIS_W, y); ctx.lineTo(size.w, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = DATUM;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`datum ${datum.topName}`, AXIS_W + 4, y - 3);
    }

    // well columns
    columns.forEach((c, i) => {
      const box = boxes[i];
      const w = c.well;
      // well band
      ctx.fillStyle = P.headerBg;
      ctx.fillRect(box.x0, 0, box.w, WELL_H);
      ctx.strokeStyle = P.frame;
      ctx.strokeRect(box.x0 + 0.5, 0.5, box.w - 1, WELL_H - 1);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = P.textStrong;
      ctx.textAlign = 'center';
      ctx.fillText(`${w.name}${w.is_own ? '' : ' (shared)'}`, box.x0 + box.w / 2, 13, box.w - 8);
      const notes = [];
      if (datum.mode === 'flatten' && !c.hasDatumTop) notes.push('no datum top: true depth');
      if (c.fallback) notes.push(`${DEPTH_REF_LABEL[depthRef]} not monotonic: MD shown`);
      if (notes.length) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = AMBER;
        ctx.fillText(notes.join(' · '), box.x0 + box.w / 2, WELL_H - 4, box.w - 8);
      }
      // inter-well distance in the gap (proportional spacing)
      if (box.gapAfter > 0 && Number.isFinite(box.distM)) {
        ctx.fillStyle = P.axisText;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fmtDist(box.distM), box.x0 + box.w + box.gapAfter / 2, 13, box.gapAfter - 4);
      }
      // track headers sit below the well band
      const geom = geoms[i];
      ctx.save();
      ctx.translate(0, WELL_H);
      c.tracks.forEach((track, ti) => paintTrackHeader(ctx, { track, x0: geom[ti].x0, w: geom[ti].w, headerH: HEADER_H }));
      ctx.restore();
      if (!c.tracks.length) {
        ctx.strokeStyle = P.frame;
        ctx.strokeRect(box.x0 + 0.5, plotTop + 0.5, box.w - 1, plotH - 1);
        ctx.fillStyle = P.axisText;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.disp ? 'no curve of this template' : 'no curves', box.x0 + box.w / 2, plotTop + 16, box.w - 8);
        return;
      }
      if (!c.disp) return;
      const { i0, i1 } = visibleRange(c.disp, vTop, vBase);
      c.tracks.forEach((track, ti) => paintTrackBody(ctx, {
        track, depth: c.disp, yOf, i0, i1, x0: geom[ti].x0, w: geom[ti].w, plotTop, plotH, headerH: WELL_H + HEADER_H,
      }));
    });

    // correlation lines between same-named tops, column centre to centre
    for (const name of shownTops) {
      const line = correlationPolyline(frameWells, flattening, name);
      if (line.length < 2) continue;
      ctx.strokeStyle = colorOf(name);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      line.forEach((pt, k) => {
        const box = boxes[pt.wellIndex];
        const cx = box.x0 + box.w / 2;
        const y = yOf(pt.displayed);
        if (k) ctx.lineTo(cx, y); else ctx.moveTo(cx, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // top markers per well: dashed line and a name tag at the column's right edge
    columns.forEach((c, i) => {
      const box = boxes[i];
      for (const t of columnTops[i]) {
        if (topDrag && topDrag.top.id === t.id) continue; // drawn by the cursor layer while dragging
        if (t.md_m < vTop || t.md_m > vBase) continue;
        paintTopMarker(ctx, {
          name: t.name, color: colorOf(t.name), y: yOf(t.md_m), xLeft: box.x0, xRight: box.x0 + box.w,
          tagMax: Math.min(TAG_MAX, box.w - 4), grip: !!(c.well.is_own && onTopMove),
        });
      }
    });

    setTick((t) => t + 1);
  }, [size, wells, columns, boxes, geoms, frameWells, flattening, columnTops, shownTops, zoneMode, zonePair, datum, depthRef, F, axisTitle, vTop, vBase, yOf, plotTop, plotH, topDrag, onTopMove]);

  // ---- CURSOR layer -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stat = staticRef.current;
    if (!canvas || !stat || !size.w || !size.h || !wells.length) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== stat.width || canvas.height !== stat.height) {
      canvas.width = stat.width;
      canvas.height = stat.height;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stat, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const inPlot = cursor && cursor.y >= plotTop && cursor.y <= plotTop + plotH;
    if (inPlot) {
      // per-well readouts: curve values at the cursor depth, and the well's
      // own measured depth there (the section shares displayed depth only)
      columns.forEach((c, i) => {
        const box = boxes[i];
        if (!c.disp) return;
        const idx = nearestIdx(c.disp, cursor.disp);
        if (box.w >= MIN_READOUT_W && c.tracks.length && Math.abs(c.disp[idx] - cursor.disp) <= (vBase - vTop) / plotH * 3) {
          // one readout row per track that has room for its curves
          c.tracks.forEach((track, ti) => {
            const g = geoms[i][ti];
            if (g.w >= 48 * Math.max(1, track.curves.length)) paintReadouts(ctx, { tracks: [track], geom: [g], idx, y: WELL_H + 46 });
          });
        }
        const inv = mdFromDisplayed(cursor.disp, c.shift, c.well, c.refForWell);
        if (inv && Number.isFinite(inv.md)) {
          const parts = [`MD ${depthLabel(inv.md, depthUnit)}`];
          if (c.refForWell !== 'md') parts.push(`${DEPTH_REF_LABEL[c.refForWell]} ${depthLabel(cursor.disp - (c.shift || 0), depthUnit)}`);
          ctx.fillStyle = P.textStrong;
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(parts.join(' · '), box.x0 + box.w - 3, WELL_H - 4, box.w - 6);
        }
      });
    }

    if (topDrag) {
      const box = boxes[topDrag.wellIndex];
      const y = yOf(topDrag.disp);
      const color = colorOf(topDrag.top.name);
      ctx.strokeStyle = color;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(box.x0, y); ctx.lineTo(box.x0 + box.w, y); ctx.stroke();
      ctx.setLineDash([]);
      const c = columns[topDrag.wellIndex];
      const inv = mdFromDisplayed(topDrag.disp, c.shift, c.well, c.refForWell);
      ctx.fillStyle = color;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${topDrag.top.name} → ${inv ? depthLabel(inv.md, depthUnit) : '?'}`, box.x0 + 4, y - 4);
    }

    if (pickMode === 'top' && inPlot && !topDrag) {
      ctx.strokeStyle = '#0e7490';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(AXIS_W, cursor.y); ctx.lineTo(size.w, cursor.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0e7490';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('click a well column to place a top', AXIS_W + 4, cursor.y - 4);
    }

    if (inPlot) {
      ctx.strokeStyle = P.crosshair;
      ctx.beginPath(); ctx.moveTo(AXIS_W, cursor.y); ctx.lineTo(size.w, cursor.y); ctx.stroke();
      ctx.fillStyle = P.textStrong;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((cursor.disp * F).toFixed(1), AXIS_W - 4, cursor.y - 4);
    }
  }, [tick, size, wells, columns, boxes, geoms, cursor, topDrag, pickMode, yOf, plotTop, plotH, vTop, vBase, F, depthUnit]);

  // Esc leaves the pick mode / closes the popover
  useEffect(() => {
    if (!pickMode && !popover) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (popover) { setPopover(null); return; }
      if (onPickCancel) onPickCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickMode, popover, onPickCancel]);
  useEffect(() => { if (!pickMode) setPopover(null); }, [pickMode]);

  // ---- pointer ------------------------------------------------------------
  const topAt = (x, y) => {
    if (pickMode || !onTopMove) return null;
    const i = columnAt(x);
    if (i < 0 || !columns[i].well.is_own) return null;
    const box = boxes[i];
    const tagLeft = Math.max(box.x0, box.x0 + box.w - Math.min(TAG_MAX, box.w - 4) - 2);
    const hit = hitTopAt({ x, y }, columnTops[i], yOf, { tagLeft, tol: 5 });
    return hit ? { top: hit.row, wellIndex: i, disp: hit.md_m } : null;
  };
  const clampDisp = (d) => Math.min(autoRange[1], Math.max(autoRange[0], d));

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (topDrag) { setTopDrag((td) => ({ ...td, disp: clampDisp(dOf(y)) })); return; }
    if (dragRef.current) {
      movedRef.current = true;
      const dd = dOf(dragRef.current.y) - dOf(y);
      setView(panBy(dragRef.current.view, dd, autoRange));
      return;
    }
    canvasRef.current.style.cursor = pickMode ? 'copy' : topAt(x, y) ? 'grab' : 'crosshair';
    const d = dOf(y);
    setCursor(y >= plotTop && y <= plotTop + plotH ? { y, disp: d } : null);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const d = dOf(e.clientY - rect.top);
    const next = zoomAbout([vTop, vBase], d, e.deltaY > 0 ? 1.25 : 0.8, autoRange);
    if (next !== null && next[0] === vTop && next[1] === vBase) return;
    setView(next);
  };

  const onPointerDown = (e) => {
    movedRef.current = false;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (popover) setPopover(null);
    const hit = topAt(x, y);
    if (hit) {
      setTopDrag(hit);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (x > AXIS_W && y > plotTop) {
      dragRef.current = { y, view: [vTop, vBase] };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerUp = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (topDrag) {
      const { top, wellIndex, disp } = topDrag;
      setTopDrag(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      const c = columns[wellIndex];
      const inv = mdFromDisplayed(disp, c.shift, c.well, c.refForWell);
      if (!inv || !Number.isFinite(inv.md)) { onNotice?.('That depth is outside the well.'); return; }
      if (inv.ambiguous) { onNotice?.('That depth is reached twice along this well; drag in MD instead.'); return; }
      const md = Number(inv.md.toFixed(2));
      if (Math.abs(md - top.md_m) > 1e-9) onTopMove(top, md);
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pickMode === 'top' && !movedRef.current && y > plotTop && y <= plotTop + plotH) {
      const i = columnAt(x);
      if (i < 0) return;
      if (!columns[i].well.is_own) { onNotice?.(`${columns[i].well.name} is read-only (shared by another user).`); return; }
      const px = Math.min(Math.max(8, x + 8), Math.max(8, size.w - 236));
      const py = Math.min(Math.max(8, y + 8), Math.max(8, size.h - 110));
      setPopover({ x: px, y: py, wellIndex: i, disp: clampDisp(dOf(y)) });
    }
  };

  const onPopoverConfirm = (name) => {
    const pv = popover;
    setPopover(null);
    if (!pv || !onTopCreate) return;
    const c = columns[pv.wellIndex];
    const inv = mdFromDisplayed(pv.disp, c.shift, c.well, c.refForWell);
    if (!inv || !Number.isFinite(inv.md)) { onNotice?.('That depth is outside the well.'); return; }
    onTopCreate(c.well.id, Number(inv.md.toFixed(2)), name);
  };

  useImperativeHandle(exportRef, () => ({
    toPng: (title) => {
      setCursor(null);
      return trackPlotPng({ canvas: canvasRef.current, title });
    },
  }), []);

  // PT5 navigator: first well with a curve, in displayed depth; shown tops as ticks
  const navProfile = (() => {
    const c = columns.find((x) => x.disp && x.tracks.length && x.tracks[0].curves?.length);
    if (!c) return null;
    const curve = c.tracks[0].curves[0];
    return { depth: c.disp, values: curve.data, min: curve.min ?? c.tracks[0].min, max: curve.max ?? c.tracks[0].max };
  })();
  const navTops = columnTops.flatMap((list) => list.map((t) => ({ d: t.md_m, name: t.name, color: colorOf(t.name) })));

  const popoverDisp = popover ? (() => {
    const c = columns[popover.wellIndex];
    const inv = mdFromDisplayed(popover.disp, c.shift, c.well, c.refForWell);
    return `New top on ${c.well.name} at ${inv ? depthLabel(inv.md, depthUnit) : '?'}`;
  })() : '';

  return (
    <div
      className="h-full min-h-0 w-full flex"
      data-testid="corr-section"
      data-axis-w={AXIS_W}
      data-plot-top={plotTop}
      data-plot-h={plotH}
      data-col-x={boxes.map((b) => Math.round(b.x0)).join(',')}
      data-col-w={boxes.map((b) => Math.round(b.w)).join(',')}
      data-view-top={vTop}
      data-view-base={vBase}
      data-pick-mode={pickMode || ''}
    >
      <div ref={wrapRef} className="flex-1 min-w-0 h-full relative overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          data-testid="corr-section-canvas"
          className="cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursor(null)}
          onDoubleClick={() => { if (!pickMode) setView(null); }}
          onWheel={onWheel}
        />
        {popover && (
          <TopNamePopover
            x={popover.x}
            y={popover.y}
            title={popoverDisp}
            defaultValue=""
            names={topNames}
            placeholder="Top name"
            onConfirm={onPopoverConfirm}
            onCancel={() => setPopover(null)}
            testIdPrefix="corr-top"
          />
        )}
        <span className="absolute bottom-1 right-2 text-[10px] text-slate-500 pointer-events-none">
          {pickMode === 'top'
            ? 'click a column: place a top · Esc: finish'
            : 'drag a name tag: move a top · drag: pan · wheel: zoom · double-click: fit'}
        </span>
      </div>
      {size.w >= 460 && (
        <DepthNavigator
          extent={autoRange}
          view={view}
          onViewChange={setView}
          profile={navProfile}
          tops={navTops}
          depthUnit={depthUnit}
          headerOffset={plotTop}
          bottomPad={PAD_BOTTOM}
          theme="light"
          testId="corr-depth-nav"
        />
      )}
    </div>
  );
});

export default CrossSection;
