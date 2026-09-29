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
import { computeFlattening, correlationPolyline, displayedRange, displayedDepth } from '@/pages/apps/WellCorrelation/engine/section';
import {
  toReferenceFrame, depthOfFor, displayedArray, isMonotonic, mdFromDisplayed, columnLayout, zoneBands, DEPTH_REF_LABEL,
  spacingProblem, correlationSegments, frameNotes, verticalScale, resolveColumnWidth, scrollWindow, hasTime,
} from './sectionFrame';
import { trackGeometry } from '@/components/wells/trackRender';
import {
  PALETTES, visibleRange, paintDepthAxis, paintTrackHeader, paintTrackBody, paintReadouts, paintTopMarker,
} from '@/components/wells/trackPainter';
import { surfaceLineStyle, displayLabel, normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { useScheme } from '@/lib/stratigraphy/scheme';
import { computeStretch, invertShift } from '@/lib/stratigraphy/stretch';
import { hitTopAt } from '@/components/wells/hitTest';
import { topColor } from '@/components/wells/topColors';
import { STRIP_W } from './petroStrips';
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
/** U2-006: plot band top and the canvas height that gives a plot band of plotH css px. */
export const PLOT_TOP = WELL_H + HEADER_H + PAD_TOP;
export const sectionHeightFor = (plotH) => PLOT_TOP + plotH + PAD_BOTTOM;
const TAG_MAX = 120;
export const SCROLL_H = 12;    // horizontal scrollbar under a band wider than the window (U2-002)

/** Tag text of a top: the typed abbreviation in the display scheme in front of the name; plain name for formation tops. */
function topLabel(t, scheme) {
  const code = normalizeSurfaceType(t.row?.surface_type ?? t.surface_type);
  if (code === 'formation_top') return t.name;
  return `${displayLabel(code, scheme, { kind: 'surface', short: true }).label} ${t.name}`;
}
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
 * @param {{mode, topName?, datumM?, upperName?, lowerName?}} p.datum datumM in the reference depth (metres); mode 'stretch' (ST2) hangs each well on upperName and lowerName
 * @param {?Array<{wellId, top_md_m, base_md_m, colour?, label?, hatched?, outline?}>} [p.bands] ST2 fills under the tracks in each well's own MD (systems tracts, motifs)
 * @param {?{sourceWellId, targetWellId, shiftM}} [p.ghost] ST2 ghost curve: the source well's first track drawn on the target column
 * @param {'m'|'ft'} [p.depthUnit] display unit, data stays metres
 * @param {'md'|'tvd'|'tvdss'} [p.depthRef] plotted depth reference
 * @param {'equal'|'proportional'|'line'} [p.spacing] 'line' (U2-012): by distance along the drawn section line (p.lineDistances)
 * @param {'none'|'consecutive'|'pair'} [p.zoneMode]
 * @param {?[string,string]} [p.zonePair]
 * @param {string[]} p.shownTops
 * @param {?'top'} [p.pickMode]
 * @param {(top, mdM: number) => void} [p.onTopMove] own wells only
 * @param {(wellId: string, mdM: number, name: string) => void} [p.onTopCreate]
 * @param {() => void} [p.onPickCancel]
 * @param {(msg: string) => void} [p.onNotice]
 * @param {'auto'|'fit'|number} [p.columnWidth] U2-002: fit the window, a fixed px width, or auto (fixed once fit gets too narrow)
 * @param {?{w: number, h: number, pixelRatio?: number}} [p.printSize] U2-006: an offscreen print render at this css size (no navigator, hints or scrollbar)
 * @param {(canvas: HTMLCanvasElement) => void} [p.onPainted] U2-006: the static layer after each paint
 * @param {?Object<string, Array<{key, title, intervals, note?}>>} [p.strips] U2-008: narrow strips per well id (pay, zones, units; petroStrips.wellStrips)
 */
const CrossSection = forwardRef(function CrossSection({
  wells, datum, depthUnit = 'm', depthRef = 'md', spacing = 'equal', zoneMode = 'consecutive', zonePair = null,
  shownTops, pickMode = null, onTopMove, onTopCreate, onPickCancel, onNotice, topNames = [],
  bands = null, ghost = null, columnWidth = 'auto', printSize = null, onPainted = null, strips = null, lineDistances = null,
  view: viewProp, onViewChange,
}, exportRef) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const staticRef = useRef(null);
  const [measured, setSize] = useState({ w: 0, h: 0 });
  const size = printSize ? { w: printSize.w, h: printSize.h } : measured;
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
  const [scrollXState, setScrollX] = useState(0); // U2-002 horizontal offset of the column band
  const scrollbarRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const isTime = depthRef === 'twt'; // U2-003: the axis is TWT in ms (no ft conversion)
  const F = !isTime && depthUnit === 'ft' ? 1 / 0.3048 : 1;

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
    // U2-003: in time, a well without checkshots (or whose time is not
    // monotonic) is not drawn at all; it never falls back to a depth
    const noTime = new Map();
    if (depthRef === 'twt') {
      for (const w of wells) {
        if (!hasTime(w)) noTime.set(w.id, 'no checkshots: not drawn in time');
        else if (w.depth?.length && !isMonotonic(displayedArray(w.depth, depthOfFor(w, depthRef), 0))) noTime.set(w.id, 'TWT not monotonic: not drawn in time');
      }
    } else if (depthRef !== 'md') {
      for (const w of wells) {
        if (!w.depth?.length) continue;
        if (!isMonotonic(displayedArray(w.depth, depthOfFor(w, depthRef), 0))) fallback.add(w.id);
      }
    }
    const refAll = toReferenceFrame(wells, depthRef);
    const frameWells = wells.map((w, i) => (noTime.has(w.id) ? { ...w, tops: [] } : fallback.has(w.id) ? w : refAll[i]));
    let flattening;
    try {
      // ST2: a stretch datum hangs each well on two surfaces (stratigraphy/stretch.js)
      flattening = datum.mode === 'stretch' ? computeStretch(frameWells, datum) : computeFlattening(frameWells, datum);
    } catch {
      flattening = frameWells.map((w) => ({ id: w.id, shift: 0, hasDatumTop: true }));
    }
    const logRanges = {};
    const columns = wells.map((w, i) => {
      const f = flattening[i];
      const depthOf = fallback.has(w.id) ? (md) => md : depthOfFor(w, depthRef);
      const disp = w.depth?.length && !noTime.has(w.id) ? displayedArray(w.depth, depthOf, f.shift) : null;
      if (disp) {
        let a = 0;
        while (a < disp.length && !Number.isFinite(disp[a])) a++;
        let b = disp.length - 1;
        while (b >= 0 && !Number.isFinite(disp[b])) b--;
        if (b > a) logRanges[w.id] = [disp[a], disp[b]];
      }
      return {
        well: w, frameWell: frameWells[i], shift: f.shift, hasDatumTop: f.hasDatumTop,
        disp, fallback: fallback.has(w.id), noTime: noTime.get(w.id) || null, tracks: w.tracks || [],
        refForWell: fallback.has(w.id) ? 'md' : depthRef, depthOf,
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
  const plotW = Math.max(10, size.w - AXIS_W);
  // U2-002: fixed-width columns on a band that scrolls under a pinned depth
  // axis; only the columns in the window are painted
  // (an unmeasured viewport, size.w 0, fits: there is no window to scroll yet)
  const fixedW = size.w > 0 ? resolveColumnWidth(columnWidth, wells.length, plotW) : null;
  const band = useMemo(
    () => columnLayout(wells, { mode: spacing === 'line' ? 'proportional' : spacing, plotLeft: AXIS_W, plotW, fixedW, distances: spacing === 'line' ? lineDistances : null }),
    [wells, spacing, plotW, fixedW, lineDistances],
  );
  // fitted columns never scroll (a gap rule can overrun a tiny window by a few px)
  const win = useMemo(() => (fixedW
    ? scrollWindow(band, { scrollX: scrollXState, plotLeft: AXIS_W, plotW })
    : { ...scrollWindow(band, { plotLeft: AXIS_W, plotW }), maxScroll: 0, scrollX: 0, boxes: band, visible: band.map(() => true) }), [band, scrollXState, plotW, fixedW]);
  const { boxes, visible: colVisible, maxScroll } = win;
  const scrollX = win.scrollX;
  const scrolling = maxScroll > 0;
  const plotH = Math.max(10, size.h - plotTop - PAD_BOTTOM - (scrolling ? SCROLL_H : 0));
  useEffect(() => {
    const el = scrollbarRef.current;
    if (el && Math.abs(el.scrollLeft - scrollX) > 0.5) el.scrollLeft = scrollX;
  }, [scrollX, scrolling]);
  // WC-U1-002: spacing by distance needs one frame and located wells; the
  // columns stay equal otherwise and the host is told why
  const spacingNote = useMemo(() => (spacing === 'proportional' ? spacingProblem(wells)
    : spacing === 'line' && !(lineDistances && lineDistances.length === wells.length - 1) ? 'the section wells are not the wells of the drawn line' : null), [wells, spacing, lineDistances]);
  useEffect(() => {
    if (spacingNote && onNotice) onNotice(`Spacing by distance is off: ${spacingNote}. The columns are equal.`);
  }, [spacingNote]); // eslint-disable-line react-hooks/exhaustive-deps
  // U2-008: strips take a fixed width at the left of a column (when the
  // column is wide enough to keep its tracks readable)
  const stripW = useMemo(() => columns.map((c, i) => {
    const n = strips?.[c.well.id]?.length || 0;
    return n && (boxes[i]?.w || 0) >= n * STRIP_W + 60 ? n * STRIP_W : 0;
  }), [columns, boxes, strips]);
  const geoms = useMemo(
    () => columns.map((c, i) => trackGeometry(c.tracks, (boxes[i]?.w || 0) - stripW[i], 0).map((g) => ({ x0: g.x0 + (boxes[i]?.x0 || 0) + stripW[i], w: g.w }))),
    [columns, boxes, stripW],
  );
  const yOf = useCallback((d) => plotTop + ((d - vTop) / (vBase - vTop || 1)) * plotH, [plotTop, plotH, vTop, vBase]);
  const dOf = (y) => vTop + ((y - plotTop) / plotH) * (vBase - vTop);
  const colorOf = (name) => topColor(name);
  const columnAt = (x) => (x < AXIS_W ? -1 : boxes.findIndex((b, i) => colVisible[i] && x >= b.x0 && x < b.x0 + b.w));

  // shown tops per column in displayed depth (the hit-test shape)
  const columnTops = useMemo(() => columns.map((c) => (c.frameWell.tops || [])
    .filter((t) => shownTops.includes(t.name))
    .map((t) => ({ ...t, md_m: displayedDepth(t.md_m, c.shift), row: c.well.tops.find((r) => r.id === t.id) || t }))),
  [columns, shownTops]);
  // typed surfaces (ST0): marker style per Catuneanu code, tag label in the display scheme
  const [scheme] = useScheme();
  const topTypes = useMemo(() => columnTops.flat().map((t) => `${t.name}:${normalizeSurfaceType(t.row?.surface_type ?? t.surface_type)}`).join(';'), [columnTops]);

  const unitTxt = isTime ? 'ms' : depthUnit === 'ft' ? 'ft' : 'm';
  // WC-U1-011: a stretched section is labelled as such (its depths are the
  // datum frame between two surfaces, not the wells' own)
  const axisTitle = datum.mode === 'flatten'
    ? `flattened ${DEPTH_REF_LABEL[depthRef]} (${unitTxt})`
    : datum.mode === 'stretch'
      ? `stretched ${DEPTH_REF_LABEL[depthRef]} (${unitTxt})`
      : `${DEPTH_REF_LABEL[depthRef]} (${unitTxt})`;

  const axisTitleRef = useRef(axisTitle);
  axisTitleRef.current = axisTitle;

  // header notes per column (also on data-well-notes for the browser checks)
  const columnNotes = useMemo(() => columns.map((c, i) => {
    const notes = [];
    if (datum.mode === 'flatten' && !c.hasDatumTop) notes.push('no datum top: true depth');
    if (datum.mode === 'stretch' && flattening[i]?.partial) notes.push(c.hasDatumTop ? 'one surface: shifted without stretching' : 'neither surface: true depth');
    if (c.noTime) notes.push(c.noTime);
    else if (c.fallback) notes.push(`${DEPTH_REF_LABEL[depthRef]} not monotonic: MD shown`);
    else notes.push(...frameNotes(c.well, depthRef)); // WC-U1-005
    if (c.well.reoriented) notes.push('stored bottom-up: read top-down'); // WC-U1-003
    for (const st of strips?.[c.well.id] || []) if (st.note) notes.push(st.note); // U2-008
    return notes;
  }), [columns, datum, flattening, depthRef, strips]);

  // ---- STATIC layer -------------------------------------------------------
  useEffect(() => {
    if (!size.w || !size.h || !wells.length) return;
    const dpr = printSize?.pixelRatio || window.devicePixelRatio || 1;
    if (!staticRef.current) staticRef.current = document.createElement('canvas');
    const canvas = staticRef.current;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, size.w, size.h);

    // U2-002: everything drawn in the plot band is clipped right of the
    // pinned depth axis, so scrolled columns slide under it
    const clipBand = () => { ctx.save(); ctx.beginPath(); ctx.rect(AXIS_W, 0, size.w - AXIS_W, size.h); ctx.clip(); };
    clipBand();
    // zone bands under everything
    if (zoneMode !== 'none') {
      const pairs = zoneMode === 'pair' ? (zonePair ? [zonePair] : []) : null;
      columns.forEach((c, i) => {
        if (!colVisible[i]) return;
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

    ctx.restore();
    paintDepthAxis(ctx, { axisW: AXIS_W, plotTop, plotH, plotRight: size.w, vTop, vBase, yOf, F, title: axisTitle });
    clipBand();

    // ST2 bands (systems tracts, motifs ...): under the tracks, in each well's own frame
    if (bands?.length) {
      columns.forEach((c, i) => {
        if (!colVisible[i]) return;
        const box = boxes[i];
        for (const b of bands) {
          if (b.wellId !== c.well.id) continue;
          const d0 = displayedDepth(b.top_md_m, c.shift); const d1 = displayedDepth(b.base_md_m, c.shift);
          const y0 = yOf(Math.max(Math.min(d0, d1), vTop)); const y1 = yOf(Math.min(Math.max(d0, d1), vBase));
          if (y1 <= y0) continue;
          if (b.outline) {
            ctx.strokeStyle = b.colour || '#94a3b8'; ctx.setLineDash([3, 2]);
            ctx.strokeRect(box.x0 + 1.5, y0 + 0.5, Math.max(4, box.w * 0.18), y1 - y0 - 1);
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = `${b.colour || '#94a3b8'}${b.hatched ? '22' : '40'}`;
            ctx.fillRect(box.x0, y0, box.w, y1 - y0);
            if (b.hatched) {
              ctx.strokeStyle = `${b.colour || '#94a3b8'}88`;
              ctx.beginPath();
              for (let yy = y0 - box.w; yy < y1; yy += 8) { ctx.moveTo(box.x0, yy + box.w); ctx.lineTo(box.x0 + box.w, yy); }
              ctx.save(); ctx.beginPath(); ctx.rect(box.x0, y0, box.w, y1 - y0); ctx.clip();
              ctx.beginPath();
              for (let yy = y0 - box.w; yy < y1; yy += 8) { ctx.moveTo(box.x0, yy + box.w); ctx.lineTo(box.x0 + box.w, yy); }
              ctx.stroke(); ctx.restore();
            }
          }
          if (b.label) {
            ctx.fillStyle = b.colour || '#94a3b8'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(b.label, box.x0 + 3, Math.min(y1 - 3, y0 + 11), box.w - 6);
          }
        }
      });
    }

    // datum lines: one for flatten-on-top, two for a stretch between surfaces
    if (datum.mode === 'stretch') {
      const st = flattening.find((f) => f.shift && typeof f.shift === 'object')?.shift;
      if (st) {
        for (const [d, name] of [[st.frameTop, datum.upperName], [st.frameBase, datum.lowerName]]) {
          const y = yOf(d);
          ctx.strokeStyle = DATUM; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(AXIS_W, y); ctx.lineTo(size.w, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = DATUM; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
          ctx.fillText(`datum ${name}`, AXIS_W + 4, y - 3);
        }
      }
    }
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
      // inter-well distance in the gap first (the gap can be in view while its column is not)
      if (!colVisible[i]) {
        if (box.gapAfter > 0 && Number.isFinite(box.distM) && box.x0 + box.w + box.gapAfter > AXIS_W && box.x0 + box.w < size.w) {
          ctx.fillStyle = P.axisText; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(fmtDist(box.distM), box.x0 + box.w + box.gapAfter / 2, 13, box.gapAfter - 4);
        }
        return;
      }
      // well band
      ctx.fillStyle = P.headerBg;
      ctx.fillRect(box.x0, 0, box.w, WELL_H);
      ctx.strokeStyle = P.frame;
      ctx.strokeRect(box.x0 + 0.5, 0.5, box.w - 1, WELL_H - 1);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = P.textStrong;
      ctx.textAlign = 'center';
      ctx.fillText(`${w.name}${w.is_own ? '' : ' (shared)'}`, box.x0 + box.w / 2, 13, box.w - 8);
      const notes = columnNotes[i];
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
      // U2-008 strips: title in the header band, intervals in displayed depth
      const ws = stripW[i] ? strips[w.id] : [];
      ws.forEach((st, j) => {
        const sx = box.x0 + j * STRIP_W;
        ctx.save();
        ctx.fillStyle = P.headerBg; ctx.fillRect(sx, WELL_H, STRIP_W, HEADER_H);
        ctx.strokeStyle = P.frame; ctx.strokeRect(sx + 0.5, WELL_H + 0.5, STRIP_W - 1, HEADER_H - 1);
        ctx.translate(sx + STRIP_W / 2 + 3, WELL_H + HEADER_H - 4); ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = P.textStrong; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(st.title, 0, 0, HEADER_H - 8);
        ctx.restore();
        ctx.strokeStyle = P.frame; ctx.strokeRect(sx + 0.5, plotTop + 0.5, STRIP_W - 1, plotH - 1);
        if (c.noTime) return;
        for (const iv of st.intervals) {
          const d0 = displayedDepth(c.depthOf(iv.top_md_m), c.shift); const d1 = displayedDepth(c.depthOf(iv.base_md_m), c.shift);
          if (!Number.isFinite(d0) || !Number.isFinite(d1)) continue;
          const y0 = yOf(Math.max(Math.min(d0, d1), vTop)); const y1 = yOf(Math.min(Math.max(d0, d1), vBase));
          if (y1 <= y0) continue;
          ctx.fillStyle = iv.colour || '#94a3b8';
          ctx.fillRect(sx + 1, y0, STRIP_W - 2, Math.max(1, y1 - y0));
        }
      });
      if (!c.disp) return;
      const { i0, i1 } = visibleRange(c.disp, vTop, vBase);
      c.tracks.forEach((track, ti) => paintTrackBody(ctx, {
        track, depth: c.disp, yOf, i0, i1, x0: geom[ti].x0, w: geom[ti].w, plotTop, plotH, headerH: WELL_H + HEADER_H,
      }));
      // zone summaries (published net, PHIE, Sw) written at each zone top
      for (const st of ws) {
        if (st.key !== 'zones' || c.noTime) continue;
        for (const iv of st.intervals) {
          const d0 = displayedDepth(c.depthOf(iv.top_md_m), c.shift);
          if (!Number.isFinite(d0) || d0 < vTop || d0 > vBase || !iv.label) continue;
          const y = yOf(d0) + 10;
          ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
          const tw = Math.min(ctx.measureText(iv.label).width, box.w - stripW[i] - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(box.x0 + stripW[i] + 2, y - 9, tw + 4, 12);
          ctx.fillStyle = P.textStrong; ctx.fillText(iv.label, box.x0 + stripW[i] + 4, y, box.w - stripW[i] - 8);
        }
      }
    });

    // ST2 ghost curve: the source well's first track drawn translucent on the
    // target column (same track slot), shifted by the ghost offset, so a log
    // shape can be dragged across wells to correlate by eye
    if (ghost?.sourceWellId && ghost?.targetWellId && ghost.sourceWellId !== ghost.targetWellId) {
      const si = columns.findIndex((c) => c.well.id === ghost.sourceWellId);
      const ti = columns.findIndex((c) => c.well.id === ghost.targetWellId);
      const src = columns[si]; const dst = columns[ti];
      if (src?.disp && dst && src.tracks.length && dst.tracks.length && geoms[ti]?.[0]) {
        const shifted = new Float64Array(src.disp.length);
        for (let k = 0; k < shifted.length; k++) shifted[k] = src.disp[k] + (ghost.shiftM || 0);
        const { i0, i1 } = visibleRange(shifted, vTop, vBase);
        const g = geoms[ti][0];
        ctx.save();
        ctx.globalAlpha = 0.45;
        paintTrackBody(ctx, { track: { ...src.tracks[0], fills: [] }, depth: shifted, yOf, i0, i1, x0: g.x0, w: g.w, plotTop, plotH, headerH: WELL_H + HEADER_H });
        ctx.restore();
        ctx.fillStyle = AMBER; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
        const gs = (ghost.shiftM || 0) * F; // WC-U1-012: the display unit
        ctx.fillText(`ghost: ${src.well.name} ${gs >= 0 ? '+' : ''}${Math.round(gs)} ${unitTxt}`, g.x0 + 3, plotTop + 12, g.w - 6);
      }
    }

    // correlation lines between same-named tops, in the gaps between columns
    // (WC-U1-004: column edge to column edge, never over the log tracks;
    // dashed across a well that does not carry the top)
    for (const name of shownTops) {
      const line = correlationPolyline(frameWells, flattening, name);
      if (line.length < 2) continue;
      ctx.strokeStyle = colorOf(name);
      ctx.lineWidth = 1.5;
      const hz = name.startsWith('H: '); // U2-003 horizon: dotted
      for (const seg of correlationSegments(line, boxes, yOf)) {
        ctx.setLineDash(hz ? [1, 3] : seg.dashed ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // top markers per well: dashed line and a name tag at the column's right edge
    columns.forEach((c, i) => {
      if (!colVisible[i]) return;
      const box = boxes[i];
      for (const t of columnTops[i]) {
        if (topDrag && topDrag.top.id === t.id) continue; // drawn by the cursor layer while dragging
        if (t.md_m < vTop || t.md_m > vBase) continue;
        paintTopMarker(ctx, {
          name: t.name, label: topLabel(t, scheme), color: colorOf(t.name), y: yOf(t.md_m), xLeft: box.x0, xRight: box.x0 + box.w,
          tagMax: Math.min(TAG_MAX, box.w - 4), grip: !!(c.well.is_own && onTopMove && !t.row?.readonly),
          style: t.row?.horizon ? { dash: [1, 3], width: 2 } : surfaceLineStyle(t.row?.surface_type ?? t.surface_type),
        });
      }
    });

    ctx.restore();
    setTick((t) => t + 1);
    if (onPainted) onPainted(canvas, { plotTop, plotH, vTop, vBase });
  }, [size.w, size.h, printSize, onPainted, strips, stripW, wells, columns, columnNotes, boxes, colVisible, geoms, frameWells, flattening, columnTops, shownTops, zoneMode, zonePair, datum, depthRef, F, unitTxt, axisTitle, vTop, vBase, yOf, plotTop, plotH, topDrag, onTopMove, scheme, bands, ghost]);

  // ---- CURSOR layer -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stat = staticRef.current;
    if (!canvas || !stat || !size.w || !size.h || !wells.length) return;
    const dpr = printSize?.pixelRatio || window.devicePixelRatio || 1;
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
        if (!c.disp || !colVisible[i]) return;
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
          if (c.refForWell === 'twt') parts.push(`TWT ${Math.round(invertShift(cursor.disp, c.shift))} ms`);
          else if (c.refForWell !== 'md') parts.push(`${DEPTH_REF_LABEL[c.refForWell]} ${depthLabel(invertShift(cursor.disp, c.shift), depthUnit)}`);
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
  }, [tick, size.w, size.h, wells, columns, boxes, colVisible, geoms, cursor, topDrag, pickMode, yOf, plotTop, plotH, vTop, vBase, F, depthUnit]);

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
    // U2-003: horizon markers are read-only (the registry surface is not a top)
    const hit = hitTopAt({ x, y }, columnTops[i].filter((t) => !t.row?.readonly), yOf, { tagLeft, tol: 5 });
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
    // U2-002: shift+wheel or a sideways swipe scrolls the column band
    if (scrolling && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setScrollX(Math.min(maxScroll, Math.max(0, scrollX + dx)));
      return;
    }
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

  // live values for the export (the handle is created once)
  const exportMetaRef = useRef({});
  const shownCols = colVisible.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  exportMetaRef.current = {
    scale: isTime ? null : verticalScale(vTop, vBase, plotH), spacing: spacingNote ? 'equal' : spacing, depthRef,
    // U2-002: a scrolled PNG shows a window of the section and says which wells
    window: scrolling && shownCols.length ? { first: shownCols[0] + 1, last: shownCols[shownCols.length - 1] + 1, n: wells.length } : null,
    // U2-006: what a print render needs to redraw this view at another size
    vTop, vBase, colW: boxes[0]?.w || null, spacingMode: spacing,
  };
  // U2-005: the host converts between a well's MD and the displayed depth
  // (reference, flattening or stretch) through the frame on screen
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  useImperativeHandle(exportRef, () => ({
    /** U2-005: MD of a displayed depth in one well ({md, ambiguous, extrapolated} or null). */
    mdAt: (wellId, disp) => {
      const c = columnsRef.current.find((x) => x.well.id === wellId);
      return c ? mdFromDisplayed(disp, c.shift, c.well, c.refForWell) : null;
    },
    /** U2-005: displayed depth of an MD in one well (NaN when the frame cannot place it). */
    displayedAt: (wellId, md) => {
      const c = columnsRef.current.find((x) => x.well.id === wellId);
      if (!c) return NaN;
      const d = (c.refForWell === 'md' ? (m) => m : depthOfFor(c.well, c.refForWell))(md);
      return Number.isFinite(d) ? displayedDepth(d, c.shift) : NaN;
    },
    /** U2-005: what the displayed depth means, for the host's labels. */
    axisLabel: () => axisTitleRef.current,
    /** U2-006: the live view (depth window, effective column width, scale). */
    meta: () => ({ ...exportMetaRef.current }),
    /** @param {string | ((meta: {scale: ?number, spacing: string}) => {title: string, caption?: string[]})} make */
    toPng: (make) => {
      setCursor(null);
      const meta = typeof make === 'function' ? make(exportMetaRef.current) : { title: make };
      return trackPlotPng({ canvas: canvasRef.current, title: meta.title, caption: meta.caption });
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
      data-col-fixed-w={fixedW || ''}
      data-content-w={Math.round(win.contentW)}
      data-scroll-x={Math.round(scrollX)}
      data-max-scroll={maxScroll}
      data-painted-cols={colVisible.filter(Boolean).length}
      data-strips={columns.map((c, i) => `${c.well.name}=${stripW[i] ? (strips[c.well.id] || []).map((st) => `${st.key}:${st.intervals.length}`).join('|') : ''}`).join(';')}
      data-spacing={spacingNote ? 'equal' : spacing}
      data-well-notes={columns.map((c, i) => `${c.well.name}=${columnNotes[i].join('|')}`).join(';')}
      data-view-top={vTop}
      data-view-base={vBase}
      data-pick-mode={pickMode || ''}
      data-top-types={topTypes}
      data-datum-mode={datum.mode}
      data-band-count={bands ? bands.length : 0}
      data-ghost={ghost?.sourceWellId ? `${ghost.sourceWellId}>${ghost.targetWellId}:${ghost.shiftM || 0}` : ''}
      data-scheme={scheme}
    >
      <div ref={wrapRef} className="flex-1 min-w-0 h-full relative overflow-hidden bg-white" data-canvas="chart"
        style={printSize ? { width: printSize.w, height: printSize.h, flex: 'none' } : undefined}>
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
        {scrolling && !printSize && (
          <div
            ref={scrollbarRef}
            data-testid="corr-hscroll"
            title="Scroll the wells (or shift + wheel on the section)"
            className="absolute bottom-0 right-0 overflow-x-auto overflow-y-hidden"
            style={{ left: AXIS_W, height: SCROLL_H }}
            onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
          >
            <div style={{ width: win.contentW, height: 1 }} />
          </div>
        )}
        {!printSize && <span className="absolute right-2 text-[10px] text-pl-muted pointer-events-none" style={{ bottom: (scrolling ? SCROLL_H : 0) + 4 }}>
          {pickMode === 'top'
            ? 'click a column: place a top · Esc: finish'
            : `drag a name tag: move a top · drag: pan · wheel: zoom${scrolling ? ' · shift+wheel: scroll wells' : ''} · double-click: fit`}
        </span>}
      </div>
      {size.w >= 460 && !printSize && (
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
