// Property player (Earth Modeling 3D grid upgrade, 2026-10-17): three linked
// views of the fine grid. A vertical section along an I line, a J line or
// through wells; a map of one layer (a K slice); and the 3D window with the
// same slices. The sliders move the slices, the play button sweeps them, and
// a property range filters the cells (the 3D cell filter and a dimmed map).
// Contacts are lines in the section and on the map, and the cells above the
// contact can be shaded by fluid. Section and map are canvas views on a dark
// ground, like the other Earth Modeling canvases (not analytic charts).

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import { isNull } from '@/lib/gridding/gridmath';
import FrameworkView3D, { DEFAULT_GRID_VIEW, FilterRange } from './FrameworkView3D';
import { cellLayers, zoneContacts, cellValue, propertyStats, colourOf, PROPERTY_LABELS, ZONE_COLORS } from '../services/grid3d/scene';
import { contactAtNode } from '../services/grid3d/properties';
import { toDisplay } from '@/components/wells/depthModes';

const selCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs';
const btn = (on) => `flex items-center gap-1 px-2 py-1 text-xs rounded border ${on ? 'border-pl-primary text-pl-primary-text bg-pl-primary/10' : 'border-pl-border text-pl-text hover:bg-pl-sunken'}`;
const PROPS = ['phi', 'sw', 'ntg', 'perm', 'vsh', 'facies', 'fluid', 'zone'];
const css = (rgb, a = 1) => `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},${a})`;

/**
 * The cells along a section: an I line (one column of nodes), a J line, or a
 * polyline through wells (sampled every cell, each sample the nearest node).
 * @returns {Array<{j: number, s: number}>} node index and distance along (native units)
 */
export function sectionCells(spec, kind, index, wellXY = []) {
  const out = [];
  if (kind === 'i') { for (let r = 0; r < spec.ny; r++) out.push({ j: r * spec.nx + index, s: r * spec.dy }); return out; }
  if (kind === 'j') { for (let c = 0; c < spec.nx; c++) out.push({ j: index * spec.nx + c, s: c * spec.dx }); return out; }
  let s0 = 0;
  const step = Math.min(spec.dx, spec.dy);
  for (let q = 0; q + 1 < wellXY.length; q++) {
    const [x1, y1] = wellXY[q]; const [x2, y2] = wellXY[q + 1];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(L / step));
    for (let t = q === 0 ? 0 : 1; t <= n; t++) {
      const x = x1 + ((x2 - x1) * t) / n; const y = y1 + ((y2 - y1) * t) / n;
      const c = Math.round((x - spec.x0) / spec.dx); const r = Math.round((y - spec.y0) / spec.dy);
      if (c < 0 || r < 0 || c >= spec.nx || r >= spec.ny) continue;
      out.push({ j: r * spec.nx + c, s: s0 + (L * t) / n });
    }
    s0 += L;
  }
  return out;
}

export default function PropertyPlayer({ built, wells = [], surfaceNames = [], faultPolygons = [], depthUnit = 'ft', onStatus }) {
  const layers = useMemo(() => cellLayers(built), [built]);
  const contacts = useMemo(() => zoneContacts(built), [built]);
  const { spec } = built;
  const nK = layers.length;
  const [prop, setProp] = useState('phi');
  const [secKind, setSecKind] = useState('j');
  const [iIdx, setI] = useState(Math.floor(spec.nx / 2));
  const [jIdx, setJ] = useState(Math.floor(spec.ny / 2));
  const firstSand = Math.max(0, layers.findIndex((L) => built.zones[L.zone]?.kind !== 'cap'));
  const [kIdx, setK] = useState(firstSand);
  const [sweep, setSweep] = useState('k');
  const [playing, setPlaying] = useState(false);
  const [filterOn, setFilterOn] = useState(false);
  const [filter, setFilter] = useState(null);
  const [density, setDensity] = useState(5);
  const [hover, setHover] = useState(null);
  const sectionWells = useMemo(() => {
    const names = ['Ekene-1', 'Ekene-3', 'Ekene-4'];
    const pick = wells.filter((w) => names.includes(w.name)).sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
    return (pick.length >= 2 ? pick : wells.slice(0, 3)).filter((w) => Number.isFinite(w.surface_x));
  }, [wells]);
  const range = useMemo(() => propertyStats(built, prop, layers), [built, prop, layers]);
  const value = useCallback((K, j) => cellValue(built, layers, contacts, K, j, prop), [built, layers, contacts, prop]);
  const passes = useCallback((v) => !filterOn || !filter || v === null || (v >= filter.lo && v <= filter.hi), [filterOn, filter]);

  // play: sweep the layers (K) or the section line (I or J), one step every 350 ms, looping
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      if (sweep === 'k') setK((k) => (k + 1) % nK);
      else if (secKind === 'i') setI((i) => (i + 1) % spec.nx);
      else setJ((j) => (j + 1) % spec.ny);
    }, 350);
    return () => clearInterval(t);
  }, [playing, sweep, nK, secKind, spec.nx, spec.ny]);

  // the 3D window follows the sliders
  const gridView = useMemo(() => ({
    ...DEFAULT_GRID_VIEW, prop, density,
    mode: filterOn ? 'filter' : 'slices',
    slices: { i: secKind === 'i' ? iIdx : null, j: secKind === 'j' ? jIdx : null, k: kIdx },
    filter: filterOn ? filter : null,
  }), [prop, density, filterOn, secKind, iIdx, jIdx, kIdx, filter]);
  const onGridView = (g) => {
    if (g.prop !== prop) setProp(g.prop);
    if (g.density !== density) setDensity(g.density);
    if (g.slices?.k !== undefined && g.slices.k !== null && g.slices.k !== kIdx) setK(g.slices.k);
    if (g.slices?.i !== undefined && g.slices.i !== null && g.slices.i !== iIdx) setI(g.slices.i);
    if (g.slices?.j !== undefined && g.slices.j !== null && g.slices.j !== jIdx) setJ(g.slices.j);
    if (g.filter !== filter && g.mode === 'filter') setFilter(g.filter);
  };

  const cells = useMemo(() => sectionCells(spec, secKind, secKind === 'i' ? iIdx : jIdx, sectionWells.map((w) => [w.surface_x, w.surface_y])), [spec, secKind, iIdx, jIdx, sectionWells]);
  const L = layers[kIdx];
  const kLabel = L ? `${built.zones[L.zone]?.name} layer ${L.k + 1} of ${built.zones[L.zone]?.layers?.length || 1}` : '';

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2" data-testid="em-player">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className={selCls} data-testid="em-player-prop" value={prop} onChange={(e) => { setProp(e.target.value); setFilter(null); }}>
          {PROPS.map((k) => <option key={k} value={k}>{PROPERTY_LABELS[k]}</option>)}
        </select>
        <select className={selCls} data-testid="em-player-section" value={secKind} onChange={(e) => setSecKind(e.target.value)} title="The vertical section: along an I line, a J line, or through the wells">
          <option value="i">section: I line</option><option value="j">section: J line</option><option value="wells">section: through {sectionWells.map((w) => w.name).join(', ')}</option>
        </select>
        {secKind !== 'wells' && (
          <label className="flex items-center gap-1 text-pl-muted">{secKind.toUpperCase()}
            <input type="range" data-testid="em-player-ij" min={0} max={secKind === 'i' ? spec.nx - 1 : spec.ny - 1} value={secKind === 'i' ? iIdx : jIdx}
              onChange={(e) => (secKind === 'i' ? setI(Number(e.target.value)) : setJ(Number(e.target.value)))} className="w-32" />
            <span className="w-14 text-pl-text" data-testid="em-player-ij-text">{(secKind === 'i' ? iIdx : jIdx) + 1} of {secKind === 'i' ? spec.nx : spec.ny}</span>
          </label>
        )}
        <label className="flex items-center gap-1 text-pl-muted">K
          <input type="range" data-testid="em-player-k" min={0} max={nK - 1} value={kIdx} onChange={(e) => setK(Number(e.target.value))} className="w-40" />
          <span className="text-pl-text whitespace-nowrap" data-testid="em-player-k-text">{kLabel}</span>
        </label>
        <select className={selCls} data-testid="em-player-sweep" value={sweep} onChange={(e) => setSweep(e.target.value)} title="What the play button sweeps">
          <option value="k">sweep layers</option>{secKind !== 'wells' && <option value="ij">sweep the section</option>}
        </select>
        <button type="button" data-testid="em-player-play" className={btn(playing)} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" data-testid="em-player-rewind" className={btn(false)} onClick={() => { setPlaying(false); setK(firstSand); }} title="Back to the first reservoir layer"><SkipBack className="w-3.5 h-3.5" /></button>
        <label className="flex items-center gap-1 text-pl-muted" title="Grid lines every n cells">grid
          <select className={selCls} data-testid="em-player-density" value={density} onChange={(e) => setDensity(Number(e.target.value))}>
            {[0, 1, 2, 5, 10].map((n) => <option key={n} value={n}>{n === 0 ? 'off' : n === 1 ? 'every cell' : `every ${n}`}</option>)}
          </select>
        </label>
        {range && (
          <button type="button" data-testid="em-player-filter" className={btn(filterOn)} onClick={() => setFilterOn((f) => !f)} title="Show only the cells whose value is in a range">cell filter</button>
        )}
        {filterOn && range && (
          <div className="rounded border border-pl-border px-2 py-0.5 text-[10px]"><FilterRange range={{ ...range, lo: range.min ?? range.lo, hi: range.max ?? range.hi }} filter={filter} prop={prop} onChange={setFilter} /></div>
        )}
        <span className="ml-auto text-[11px] text-pl-muted" data-testid="em-player-hover">{hover || 'hover the map or the section for a cell'}</span>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2">
        <div className="min-h-0 relative rounded border border-slate-800 bg-slate-950" data-canvas="dark">
          <SectionPane built={built} layers={layers} contacts={contacts} cells={cells} value={value} prop={prop} range={range} passes={passes}
            density={density} kIdx={kIdx} depthUnit={depthUnit} wells={secKind === 'wells' ? sectionWells : []} onHover={setHover}
            title={secKind === 'wells' ? `Section through ${sectionWells.map((w) => w.name).join(', ')}` : `${secKind.toUpperCase()} line ${(secKind === 'i' ? iIdx : jIdx) + 1}`} />
        </div>
        <div className="min-h-0 relative rounded border border-slate-800 bg-slate-950" data-canvas="dark">
          <MapPane built={built} layers={layers} contacts={contacts} K={kIdx} value={value} prop={prop} range={range} passes={passes} density={density}
            line={secKind === 'wells' ? sectionWells.map((w) => [w.surface_x, w.surface_y]) : secKind === 'i'
              ? [[spec.x0 + iIdx * spec.dx, spec.y0], [spec.x0 + iIdx * spec.dx, spec.y0 + (spec.ny - 1) * spec.dy]]
              : [[spec.x0, spec.y0 + jIdx * spec.dy], [spec.x0 + (spec.nx - 1) * spec.dx, spec.y0 + jIdx * spec.dy]]}
            wells={wells} title={`Map: ${kLabel}`} onHover={setHover} depthUnit={depthUnit} />
        </div>
        <div className="col-span-2 min-h-0">
          <FrameworkView3D built={built} wells={wells} surfaceNames={surfaceNames} faultPolygons={faultPolygons} depthUnit={depthUnit}
            onStatus={onStatus} gridView={gridView} onGridView={onGridView} compact />
        </div>
      </div>
      <Legend built={built} prop={prop} range={range} />
    </div>
  );
}

function Legend({ built, prop, range }) {
  const fmt = (v) => (prop === 'perm' ? v.toPrecision(3) : v.toFixed(3));
  if (prop === 'zone') {
    return <div className="flex flex-wrap gap-3 text-[11px] text-pl-muted">{built.zones.map((z, i) => <span key={z.name} className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />{z.name}</span>)}</div>;
  }
  if (prop === 'facies' || prop === 'fluid') {
    const codes = prop === 'facies' ? [0, 1, 2, 3] : [2, 1, 0];
    const names = prop === 'facies' ? ['shale', 'oil sand', 'brine sand', 'shaly sand'] : { 2: 'gas', 1: 'oil', 0: 'water' };
    return (
      <div className="flex flex-wrap gap-3 text-[11px] text-pl-muted" data-testid="em-player-legend">
        {codes.map((c, q) => <span key={c} className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: css(colourOf(prop, c)) }} />{prop === 'facies' ? names[q] : names[c]}</span>)}
        {prop === 'fluid' && built.zones.some((z) => z.kind === 'cap') && <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: css(colourOf('fluid', null)) }} />seal (the cap)</span>}
      </div>
    );
  }
  return range ? (
    <div className="flex items-center gap-2 text-[11px] text-pl-muted" data-testid="em-player-legend">
      {PROPERTY_LABELS[prop]} <span className="inline-block h-2 w-40" style={{ background: 'linear-gradient(90deg,#3b4cc0,#7fb2f0,#f6e8a4,#f4865f,#b40426)' }} /> {fmt(range.lo)} to {fmt(range.hi)}
      <span>(colour range: 2nd to 98th percentile of the cells)</span>
    </div>
  ) : null;
}

function useCanvas(draw, deps) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const [size, setSize] = useState({ w: 400, h: 300 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 400, h: el.clientHeight || 300 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`; c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, size.w, size.h);
    draw(ctx, size.w, size.h);
  }, [size, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, wrap };
}

/** The vertical section: each cell between its top and base along the line, the skeleton, zone boundaries and contacts. */
function SectionPane({ built, layers, contacts, cells, value, prop, range, passes, density, kIdx, depthUnit, wells, onHover, title }) {
  const geomRef = useRef(null);
  const { ref, wrap } = useCanvas((ctx, W, H) => {
    const PAD = { l: 52, r: 10, t: 32, b: 22 };
    if (!cells.length) return;
    let zMin = Infinity; let zMax = -Infinity;
    for (const { j } of cells) for (const L of [layers[0], layers[layers.length - 1]]) {
      for (const v of [L.top[j], L.base[j]]) if (!isNull(v)) { zMin = Math.min(zMin, v); zMax = Math.max(zMax, v); }
    }
    if (!Number.isFinite(zMin)) { ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.fillText('No cells on this line.', 20, H / 2); geomRef.current = null; return; }
    const pad = 0.05 * (zMax - zMin || 1); zMin -= pad; zMax += pad;
    const sMax = cells[cells.length - 1].s || 1;
    const X = (s) => PAD.l + (s / sMax) * (W - PAD.l - PAD.r);
    const Y = (z) => PAD.t + ((z - zMin) / (zMax - zMin)) * (H - PAD.t - PAD.b);
    const half = (q) => (q + 1 < cells.length ? (cells[q + 1].s - cells[q].s) / 2 : (q > 0 ? (cells[q].s - cells[q - 1].s) / 2 : 1));
    geomRef.current = { X, Y, cells, sMax, zMin, zMax, PAD, W };
    for (let q = 0; q < cells.length; q++) {
      const { j, s } = cells[q];
      const a = X(s - (q > 0 ? half(q - 1) : half(q))); const b = X(s + half(q));
      for (let K = 0; K < layers.length; K++) {
        const t = layers[K].top[j]; const bb = layers[K].base[j];
        if (isNull(t) || isNull(bb)) continue;
        const v = value(K, j);
        ctx.fillStyle = css(colourOf(prop, v, range), passes(v) ? 1 : 0.12);
        ctx.fillRect(a, Y(t), Math.max(0.5, b - a + 0.4), Math.max(0.4, Y(bb) - Y(t)));
      }
    }
    // skeleton: layer lines every n layers (zone boundaries bold), column lines every n cells
    ctx.lineWidth = 0.5;
    for (let K = 0; K <= layers.length; K++) {
      const Lr = K < layers.length ? layers[K] : layers[layers.length - 1];
      const bound = K === layers.length || Lr.k === 0;
      if (!bound && !(density > 0 && Lr.k % density === 0)) continue;
      ctx.strokeStyle = bound ? 'rgba(226,232,240,0.9)' : 'rgba(2,6,23,0.55)'; ctx.lineWidth = bound ? 1.2 : 0.5;
      ctx.beginPath(); let pen = false;
      for (const { j, s } of cells) {
        const z = K < layers.length ? Lr.top[j] : Lr.base[j];
        if (isNull(z)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(s), Y(z)); else { ctx.moveTo(X(s), Y(z)); pen = true; }
      }
      ctx.stroke();
    }
    if (density > 0) {
      ctx.strokeStyle = 'rgba(2,6,23,0.55)'; ctx.lineWidth = 0.5;
      cells.forEach(({ j, s }, q) => {
        if (q % density) return;
        const t = layers[0].top[j]; const bb = layers[layers.length - 1].base[j];
        if (isNull(t) || isNull(bb)) return;
        ctx.beginPath(); ctx.moveTo(X(s), Y(t)); ctx.lineTo(X(s), Y(bb)); ctx.stroke();
      });
    }
    // the K slice the map shows
    const KL = layers[kIdx];
    if (KL) {
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.beginPath(); let pen = false;
      for (const { j, s } of cells) { const z = (KL.top[j] + KL.base[j]) / 2; if (isNull(KL.top[j])) { pen = false; continue; } if (pen) ctx.lineTo(X(s), Y(z)); else { ctx.moveTo(X(s), Y(z)); pen = true; } }
      ctx.stroke();
    }
    // contacts, dashed, where they cut the zones that carry them
    const drawn = new Set();
    built.zones.forEach((z, zi) => {
      for (const [kind, colour, label] of [['owc', '#38bdf8', 'OWC'], ['goc', '#f87171', 'GOC']]) {
        const c = contacts[zi]?.[kind];
        if (c === null || c === undefined) continue;
        ctx.strokeStyle = colour; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); ctx.beginPath();
        let pen = false; let last = null; let depth = null;
        for (const { j, s } of cells) {
          const v = contactAtNode(c, j, z.labels ? z.labels[j] : 0);
          const t = built.clamped[zi][j]; const b = built.clamped[zi + 1][j];
          if (v === null || isNull(t) || isNull(b) || !(t < v && b > v)) { pen = false; continue; }
          if (pen) ctx.lineTo(X(s), Y(v)); else { ctx.moveTo(X(s), Y(v)); pen = true; }
          last = X(s); depth = v;
        }
        ctx.stroke(); ctx.setLineDash([]);
        const key = `${kind}${depth?.toFixed(2)}`;
        if (last !== null && !drawn.has(key)) {
          drawn.add(key);
          ctx.fillStyle = colour; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
          ctx.fillText(`${label} ${Math.round(toDisplay(depth, depthUnit)).toLocaleString('en-US')} ${depthUnit}`, last - 4, Y(depth) - 4);
        }
      }
    });
    // wells on a well section: a stick at each well's place along the line
    let s0 = 0;
    wells.forEach((w, q) => {
      if (q > 0) s0 += Math.hypot(w.surface_x - wells[q - 1].surface_x, w.surface_y - wells[q - 1].surface_y);
      const x = X(s0);
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
      ctx.fillStyle = '#e2e8f0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(w.name, Math.min(W - 30, Math.max(PAD.l + 20, x)), 28);
    });
    // depth axis in the display unit
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    const dMin = toDisplay(zMin, depthUnit); const dMax = toDisplay(zMax, depthUnit);
    const raw = (dMax - dMin) / 6; const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const st = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || mag * 10;
    for (let dd = Math.ceil(dMin / st) * st; dd <= dMax; dd += st) { const z = zMin + ((dd - dMin) / (dMax - dMin)) * (zMax - zMin); ctx.fillText(String(Math.round(dd)), PAD.l - 4, Y(z) + 3); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#cbd5e1'; ctx.font = '11px sans-serif'; ctx.fillText(title, PAD.l, 14);
    ctx.save(); ctx.translate(11, H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.fillText(`TVDSS (${depthUnit})`, 0, 0); ctx.restore();
  }, [built, layers, contacts, cells, value, prop, range, passes, density, kIdx, depthUnit, wells, title]);
  const onMove = (e) => {
    const g = geomRef.current; if (!g) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    const s = ((x - g.PAD.l) / (g.W - g.PAD.l - g.PAD.r)) * g.sMax;
    let q = 0; let best = Infinity;
    g.cells.forEach((c, i) => { const d = Math.abs(c.s - s); if (d < best) { best = d; q = i; } });
    const j = g.cells[q].j;
    const z = g.zMin + ((y - g.PAD.t) / (r.height - g.PAD.t - g.PAD.b)) * (g.zMax - g.zMin);
    const K = layers.findIndex((L) => !isNull(L.top[j]) && L.top[j] <= z && L.base[j] >= z);
    if (K < 0) { onHover(null); return; }
    const v = value(K, j);
    onHover(`${built.zones[layers[K].zone].name} layer ${layers[K].k + 1}, ${Math.round(toDisplay(z, depthUnit)).toLocaleString('en-US')} ${depthUnit}: ${PROPERTY_LABELS[prop]} ${v === null ? 'none' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}`);
  };
  return <div ref={wrap} className="absolute inset-0" onMouseMove={onMove} onMouseLeave={() => onHover(null)}><canvas ref={ref} data-testid="em-player-section-canvas" /></div>;
}

/** The map of one layer: cells coloured by the property, the skeleton, the contact lines in the layer, the section line and the wells. */
function MapPane({ built, layers, contacts, K, value, prop, range, passes, density, line, wells, title, onHover, depthUnit }) {
  const geomRef = useRef(null);
  const { ref, wrap } = useCanvas((ctx, W, H) => {
    const { spec } = built; const { nx, ny } = spec;
    const PAD = 22;
    const sc = Math.min((W - 2 * PAD) / (nx * spec.dx), (H - 2 * PAD - 10) / (ny * spec.dy));
    const ox = (W - nx * spec.dx * sc) / 2; const oy = (H + ny * spec.dy * sc) / 2;
    const X = (x) => ox + (x - spec.x0 + spec.dx / 2) * sc;
    const Y = (y) => oy - (y - spec.y0 + spec.dy / 2) * sc;
    geomRef.current = { X, Y, sc, ox, oy };
    const L = layers[K];
    if (!L) return;
    const cw = spec.dx * sc; const ch = spec.dy * sc;
    const fl = new Int8Array(nx * ny).fill(-1);
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const j = r * nx + c;
        if (isNull(L.top[j])) continue;
        const v = value(K, j);
        ctx.fillStyle = css(colourOf(prop, v, range), passes(v) ? 1 : 0.12);
        ctx.fillRect(X(spec.x0 + c * spec.dx) - cw / 2, Y(spec.y0 + r * spec.dy) - ch / 2, cw + 0.5, ch + 0.5);
        fl[j] = cellValue(built, layers, contacts, K, j, 'fluid');
      }
    }
    if (density > 0 && cw * density > 3) {
      ctx.strokeStyle = 'rgba(2,6,23,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let c = 0; c <= nx; c += density) { const x = X(spec.x0 + (c - 0.5) * spec.dx); ctx.moveTo(x, Y(spec.y0 - spec.dy / 2)); ctx.lineTo(x, Y(spec.y0 + (ny - 0.5) * spec.dy)); }
      for (let r = 0; r <= ny; r += density) { const y = Y(spec.y0 + (r - 0.5) * spec.dy); ctx.moveTo(X(spec.x0 - spec.dx / 2), y); ctx.lineTo(X(spec.x0 + (nx - 0.5) * spec.dx), y); }
      ctx.stroke();
    }
    // the contact in this layer: the edges between cells of different fluids
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const j = r * nx + c; const f = fl[j];
        if (f < 0) continue;
        if (c + 1 < nx && fl[j + 1] >= 0 && fl[j + 1] !== f) { const x = X(spec.x0 + (c + 0.5) * spec.dx); ctx.moveTo(x, Y(spec.y0 + (r - 0.5) * spec.dy)); ctx.lineTo(x, Y(spec.y0 + (r + 0.5) * spec.dy)); }
        if (r + 1 < ny && fl[j + nx] >= 0 && fl[j + nx] !== f) { const y = Y(spec.y0 + (r + 0.5) * spec.dy); ctx.moveTo(X(spec.x0 + (c - 0.5) * spec.dx), y); ctx.lineTo(X(spec.x0 + (c + 0.5) * spec.dx), y); }
      }
    }
    ctx.stroke();
    // the section line
    if (line?.length >= 2) {
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.beginPath();
      line.forEach(([x, y], q) => (q ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke(); ctx.setLineDash([]);
    }
    // wells
    const seen = [];
    // a well's own name before a copy of it at the same place ("PPS demo: Ekene-1")
    for (const w of [...wells].sort((a, b) => String(a.name).includes(':') - String(b.name).includes(':'))) {
      if (!Number.isFinite(w.surface_x)) continue;
      const x = X(w.surface_x); const y = Y(w.surface_y);
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill();
      if (seen.some(([a, b]) => Math.abs(a - x) < 20 && Math.abs(b - y) < 10)) continue;
      seen.push([x, y]);
      ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(w.name, x + 5, y - 4);
    }
    ctx.fillStyle = '#cbd5e1'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, 8, 14);
    ctx.fillStyle = '#38bdf8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('contact in this layer', W - 8, 14);
  }, [built, layers, contacts, K, value, prop, range, passes, density, line, wells, title]);
  const onMove = (e) => {
    const g = geomRef.current; if (!g) return;
    const r = e.currentTarget.getBoundingClientRect();
    const { spec } = built;
    const c = Math.round(((e.clientX - r.left - g.ox) / g.sc - spec.dx / 2) / spec.dx);
    const rr = Math.round(((g.oy - (e.clientY - r.top)) / g.sc - spec.dy / 2) / spec.dy);
    if (c < 0 || rr < 0 || c >= spec.nx || rr >= spec.ny) { onHover(null); return; }
    const j = rr * spec.nx + c; const L = layers[K];
    if (!L || isNull(L.top[j])) { onHover(null); return; }
    const v = value(K, j);
    onHover(`cell I ${c + 1} J ${rr + 1} K ${K + 1}, top ${Math.round(toDisplay(L.top[j], depthUnit)).toLocaleString('en-US')} ${depthUnit}: ${PROPERTY_LABELS[prop]} ${v === null ? 'none' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}`);
  };
  return <div ref={wrap} className="absolute inset-0" onMouseMove={onMove} onMouseLeave={() => onHover(null)}><canvas ref={ref} data-testid="em-player-map-canvas" /></div>;
}
