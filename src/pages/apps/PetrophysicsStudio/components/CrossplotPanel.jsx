// Crossplot windows (Petrophysics Studio G2.4, PS1): density-neutron
// with chart-book lithology overlays + manual facies polygon tagging,
// the Pickett plot with live iso-Sw lines + a depth-windowed
// water-line fit that writes m and Rw back to the parameter set (the
// classic workflow: pick the aquifer, fit, apply), and the Buckles
// plot (phi vs Sw with iso-BVW hyperbolas — constant BVW at
// irreducible saturation). PS1 also adds z-coloring by any curve with
// a colorbar, and zoom/pan owned here as per-plot domain state.
//
// PT8 (2026-09-05): the Pickett plot takes a zone filter — the defined
// zones as a multi-select defaulting to all of them — so the plot can be
// read on the reservoir intervals alone; picking more than one colours
// the points by zone. Every plot gains a PNG button, and the Pickett
// caption records which zones the image was made from.

import React, { useEffect, useMemo, useState } from 'react';
import { ImageDown } from 'lucide-react';
import Crossplot from './Crossplot';
import {
  crossplotSamples, ND_LITHOLOGY_LINES, pickettIsoSwLine, pickettFitDepthWindow,
  faciesCurve, bucklesIsoBvwLine, hingleY, hingleWaterLine, hingleFitDepthWindow,
  pointInPolygon,
} from '../engine/crossplot';
import { COLOR_MAPS } from '@/utils/colorMaps';
import { trackPlotPng } from '@/components/wells/plotPng';
import { planZoneFilter } from '../services/zoneFilter';

const FACIES_COLORS = ['#d97706', '#059669', '#7c3aed', '#dc2626', '#2563eb', '#ca8a04'];
const ISO_SW = [1, 0.8, 0.6, 0.4, 0.2];
const ISO_BVW = [0.02, 0.04, 0.06, 0.09, 0.12];
const POINT_COLOR = '#64748b';
const WINDOW_COLOR = '#0891b2';

const DEFAULT_DOMAINS = {
  nd: { x: [-0.05, 0.5], y: [1.9, 3.0] },
  pickett: { x: [0.1, 1000], y: [0.01, 1] },
  buckles: { x: [0, 0.4], y: [0, 1] },
  hingle: { x: [0, 0.4], y: [0, 2.5] },
};
const DIMMED = '#d8dde4';

const viridisFn = COLOR_MAPS.viridis.fn;
const mapFn = (t) => {
  const [r, g, b] = viridisFn(Math.min(1, Math.max(0, t)));
  return `rgb(${r},${g},${b})`;
};

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';

export default function CrossplotPanel({
  curves, outputs, params, facies, onFaciesChange, onApplyParams, onStatus,
  selection = null, onSelectionChange, initialConfig = null, onConfigChange,
  zones = [], wellName = 'Well',
}) {
  const [plot, setPlot] = useState(initialConfig?.plot || 'nd'); // 'nd' | 'pickett' | 'buckles' | 'hingle'
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState([]);            // [[x, y]] in ND space
  const [faciesName, setFaciesName] = useState('');
  const [fitWin, setFitWin] = useState({ top: '', base: '' });
  const [fit, setFit] = useState(null);              // {m, aRw, nPoints}
  const [hFit, setHFit] = useState(null);            // {rw, slope, nPoints}
  const [colorBy, setColorBy] = useState(initialConfig?.colorBy || 'facies');
  const [domains, setDomains] = useState({ nd: null, pickett: null, buckles: null, hingle: null });
  const [selecting, setSelecting] = useState(false); // PS10 brush polygon
  const [selDraft, setSelDraft] = useState([]);
  // PT8: which zones the Pickett plot shows. [] = every zone, which is
  // also "no filter" — samples outside every zone still plot.
  const [zoneIds, setZoneIds] = useState(initialConfig?.pickettZones || []);

  // persisted crossplot config (petro_projects.crossplots)
  useEffect(() => { onConfigChange?.({ plot, colorBy, pickettZones: zoneIds }); }, [plot, colorBy, zoneIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // drop ids of zones that no longer exist, so a deleted zone cannot
  // leave the plot filtered to nothing the user can see or clear
  useEffect(() => {
    setZoneIds((ids) => {
      const live = ids.filter((id) => zones.some((z) => z.id === id));
      return live.length === ids.length ? ids : live;
    });
  }, [zones]);

  const zoneFilter = useMemo(() => planZoneFilter(zones, zoneIds), [zones, zoneIds]);

  const ndSamples = useMemo(() => (curves.NPHI && curves.RHOB
    ? crossplotSamples(curves.NPHI, curves.RHOB, curves.DEPT) : []), [curves]);
  const pickettSamples = useMemo(() => (curves.RT && outputs?.PHIE
    ? crossplotSamples(curves.RT, outputs.PHIE, curves.DEPT) : []), [curves, outputs]);
  const bucklesSamples = useMemo(() => (outputs?.PHIE && outputs?.SW
    ? crossplotSamples(outputs.PHIE, outputs.SW, curves.DEPT) : []), [curves, outputs]);
  const hingleYCurve = useMemo(() => (curves.RT
    ? Float64Array.from(curves.RT, (r) => hingleY(r, params.m)) : null), [curves, params.m]);
  const hingleSamples = useMemo(() => (hingleYCurve && outputs?.PHIE
    ? crossplotSamples(outputs.PHIE, hingleYCurve, curves.DEPT) : []), [hingleYCurve, outputs, curves]);

  const ndTags = useMemo(() => (curves.NPHI && curves.RHOB && facies.length
    ? faciesCurve(curves.NPHI, curves.RHOB, facies) : null), [curves, facies]);

  // z-color sources: any loaded input curve or computed output, or depth
  const zSources = useMemo(() => {
    const out = [];
    for (const key of ['GR', 'RHOB', 'NPHI', 'DT', 'RT']) {
      if (curves[key]) out.push({ key, data: curves[key] });
    }
    for (const key of ['PHIE', 'VSH', 'SW']) {
      if (outputs?.[key]) out.push({ key, data: outputs[key] });
    }
    return out;
  }, [curves, outputs]);

  const zInfo = useMemo(() => {
    if (colorBy === 'facies' || colorBy === 'none') return null;
    const data = colorBy === 'depth' ? curves.DEPT : zSources.find((s) => s.key === colorBy)?.data;
    if (!data) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!(hi > lo)) return null;
    const title = colorBy === 'depth' ? 'Depth (m MD)' : colorBy;
    return { data, domain: [lo, hi], title };
  }, [colorBy, curves, zSources]);

  const colorFor = useMemo(() => (s) => {
    if (zInfo) {
      const v = zInfo.data[s.i];
      if (!Number.isFinite(v)) return POINT_COLOR;
      return mapFn((v - zInfo.domain[0]) / (zInfo.domain[1] - zInfo.domain[0]));
    }
    if (colorBy === 'facies' && ndTags && !Number.isNaN(ndTags[s.i])) {
      return facies[ndTags[s.i]].color;
    }
    return POINT_COLOR;
  }, [zInfo, colorBy, ndTags, facies]);

  const withZ = (s, color) => ({
    x: s.x,
    y: s.y,
    // PS10 brush: unselected points dim when a selection exists
    color: selection && !selection.has(s.i) ? DIMMED : color,
    depthM: s.depthM,
    zv: zInfo ? zInfo.data[s.i] : undefined,
  });

  const ndPoints = useMemo(
    () => ndSamples.map((s) => withZ(s, colorFor(s))),
    [ndSamples, colorFor, selection], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // PT8: the plot shows only the selected zones, and colours by zone once
  // more than one is selected. An explicit z-colour (a curve or depth)
  // still wins, because a colorbar and zone colours cannot both drive the
  // same dot; facies colouring does not, since facies are ND-space tags
  // that say nothing about a Pickett point.
  const pickettShown = useMemo(
    () => (zoneFilter.filtering ? pickettSamples.filter((s) => zoneFilter.inFilter(s.depthM)) : pickettSamples),
    [pickettSamples, zoneFilter],
  );

  const pickettPoints = useMemo(() => {
    const top = Number(fitWin.top);
    const base = Number(fitWin.base);
    const winValid = Number.isFinite(top) && Number.isFinite(base) && base > top;
    return pickettShown.map((s) => {
      if (winValid && s.depthM >= top && s.depthM <= base) return withZ(s, WINDOW_COLOR);
      const zc = zInfo ? null : zoneFilter.colorOf(s.depthM);
      return withZ(s, zc || colorFor(s));
    });
  }, [pickettShown, fitWin, colorFor, selection, zoneFilter, zInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  const bucklesPoints = useMemo(
    () => bucklesSamples.map((s) => withZ(s, colorFor(s))),
    [bucklesSamples, colorFor, selection], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pickettOverlays = useMemo(() => {
    const lines = ISO_SW.map((sw) => {
      const l = pickettIsoSwLine(sw, params, 0.02, 0.6);
      return { name: `Sw ${Math.round(sw * 100)}%`, pts: l.pts, color: '#2563eb', dash: [5, 4] };
    });
    if (fit) {
      const rt = (phi) => fit.aRw / phi ** fit.m;
      lines.push({
        name: 'fitted water line',
        pts: [{ x: rt(0.02), y: 0.02 }, { x: rt(0.6), y: 0.6 }],
        color: '#dc2626',
        dash: [],
      });
    }
    return lines;
  }, [params, fit]);

  const bucklesOverlays = useMemo(() => ISO_BVW.map((bvw) => {
    const l = bucklesIsoBvwLine(bvw, 0.005, 0.4, 1);
    return { name: `BVW ${bvw}`, pts: l.pts, color: '#2563eb', dash: [5, 4] };
  }), []);

  const hinglePoints = useMemo(
    () => hingleSamples.map((s) => withZ(s, colorFor(s))),
    [hingleSamples, colorFor, selection], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hingleOverlays = useMemo(() => {
    const lines = [{
      name: 'water line', ...hingleWaterLine(params, 0.4), color: '#2563eb', dash: [5, 4],
    }];
    if (hFit) {
      lines.push({
        name: 'fitted', pts: [{ x: 0, y: 0 }, { x: 0.4, y: hFit.slope * 0.4 }], color: '#dc2626', dash: [],
      });
    }
    return lines;
  }, [params, hFit]);

  const runHingleFit = () => {
    const top = Number(fitWin.top);
    const base = Number(fitWin.base);
    if (!Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) {
      onStatus('Enter the water-bearing interval as top/base metres MD.');
      return;
    }
    try {
      const r = hingleFitDepthWindow(curves.DEPT, outputs.PHIE, curves.RT, top, base, { a: params.a, m: params.m });
      setHFit(r);
      onStatus(`Hingle water line fit on ${r.nPoints} samples: Rw = ${r.rw.toFixed(6)} at m = ${params.m}.`);
    } catch (e) {
      setHFit(null);
      onStatus(e.message);
    }
  };

  // PS10 brush: the polygon selects sample INDICES on whichever plot
  // is showing, so the selection follows the samples into the tracks
  const samplesForPlot = { nd: ndSamples, pickett: pickettShown, buckles: bucklesSamples, hingle: hingleSamples }[plot] || [];
  const applySelection = () => {
    if (selDraft.length < 3) { onStatus('A selection polygon needs at least three vertices.'); return; }
    const picked = new Set();
    for (const s of samplesForPlot) {
      if (pointInPolygon(s.x, s.y, selDraft)) picked.add(s.i);
    }
    onSelectionChange?.(picked.size ? picked : null);
    setSelecting(false);
    setSelDraft([]);
    onStatus(picked.size ? `Selected ${picked.size} samples — highlighted on the tracks.` : 'No samples inside the polygon.');
  };

  const closePolygon = () => {
    if (draft.length < 3) { onStatus('A facies polygon needs at least three vertices.'); return; }
    const name = faciesName.trim() || `Facies ${facies.length + 1}`;
    onFaciesChange([...facies, {
      id: `facies-${Date.now()}-${facies.length}`,
      name,
      color: FACIES_COLORS[facies.length % FACIES_COLORS.length],
      polygon: draft,
    }]);
    setDraft([]);
    setDrawing(false);
    setFaciesName('');
    onStatus(`Tagged facies ${name}.`);
  };

  const runFit = () => {
    const top = Number(fitWin.top);
    const base = Number(fitWin.base);
    if (!Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) {
      onStatus('Enter the water-bearing interval as top/base metres MD.');
      return;
    }
    try {
      const r = pickettFitDepthWindow(curves.DEPT, outputs.PHIE, curves.RT, top, base);
      setFit(r);
      onStatus(`Water line fit on ${r.nPoints} samples.`);
    } catch (e) {
      setFit(null);
      onStatus(e.message);
    }
  };

  const applyFit = () => {
    // human-scale parameters — the panel edits these as text
    onApplyParams({
      m: Number(fit.m.toFixed(4)),
      rw: Number((fit.aRw / params.a).toFixed(6)),
    });
    onStatus(`Applied m = ${fit.m.toFixed(4)}, Rw = ${(fit.aRw / params.a).toFixed(6)} from the Pickett fit.`);
  };

  const faciesCounts = useMemo(() => {
    if (!ndTags) return {};
    const counts = {};
    for (const t of ndTags) if (!Number.isNaN(t)) counts[t] = (counts[t] || 0) + 1;
    return counts;
  }, [ndTags]);

  // PT8: PNG of the plot as shown, through the same composer the track
  // plot and the correlation section use. The caption states the zone
  // filter, so a saved Pickett cannot be mistaken for the whole well.
  const PLOT_TITLES = { nd: 'Density–Neutron', pickett: 'Pickett', buckles: 'Buckles', hingle: 'Hingle' };
  const exportPng = async () => {
    try {
      const canvas = document.querySelector('[data-testid="petro-crossplot-canvas"]');
      if (!canvas) { onStatus('Nothing to export: this plot needs its curves first.'); return; }
      const shown = { nd: ndPoints, pickett: pickettPoints, buckles: bucklesPoints, hingle: hinglePoints }[plot] || [];
      const caption = `${shown.length} points`
        + (plot === 'pickett' ? ` · zones: ${zoneFilter.label}` : '')
        + (colorBy !== 'facies' && colorBy !== 'none' ? ` · coloured by ${colorBy}` : '')
        + (plot === 'pickett' && zoneFilter.colouring ? ' · coloured by zone' : '');
      const blob = await trackPlotPng({
        canvas,
        title: `${wellName} · ${PLOT_TITLES[plot]} · Petrophysics Studio`,
        caption,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(wellName).replace(/[^\w.-]+/g, '_')}_${plot}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onStatus(`Exported the ${PLOT_TITLES[plot]} plot as PNG (${caption}).`);
    } catch (e) {
      onStatus(e.message);
    }
  };

  const toggleZone = (id) => setZoneIds((ids) => (
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const dom = (key) => domains[key] || DEFAULT_DOMAINS[key];
  const setDom = (key) => (next) => setDomains((d) => ({ ...d, [key]: next }));
  const colorbar = zInfo ? { title: zInfo.title, domain: zInfo.domain, mapFn } : null;

  const plotBtn = (key, label, testid, disabled = false) => (
    <button
      type="button"
      data-testid={testid}
      disabled={disabled}
      className={`px-2 py-0.5 rounded border disabled:opacity-40 ${plot === key ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
      onClick={() => setPlot(key)}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="petro-crossplot">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 text-xs">
        {plotBtn('nd', 'Density–Neutron', 'petro-plot-nd')}
        {plotBtn('pickett', 'Pickett', 'petro-plot-pickett')}
        {plotBtn('buckles', 'Buckles', 'petro-plot-buckles', !bucklesSamples.length)}
        {plotBtn('hingle', 'Hingle', 'petro-plot-hingle', !hingleSamples.length)}

        <label className="ml-2 flex items-center gap-1 text-slate-500">
          Color by
          <select
            className={inputCls}
            data-testid="petro-colorby"
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value)}
          >
            <option value="facies">Facies</option>
            <option value="none">None</option>
            <option value="depth">Depth</option>
            {zSources.map((s) => <option key={s.key} value={s.key}>{s.key}</option>)}
          </select>
        </label>
        <button
          type="button"
          data-testid="petro-crossplot-png"
          title="Download this plot as a PNG image"
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={exportPng}
        >
          <ImageDown className="w-3 h-3" /> PNG
        </button>
        {domains[plot] && (
          <button
            type="button"
            data-testid="petro-zoom-reset"
            className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200"
            onClick={() => setDom(plot)(null)}
          >
            Reset zoom
          </button>
        )}
        {selecting ? (
          <>
            <span className="text-slate-500">{selDraft.length} pts</span>
            <button type="button" data-testid="petro-select-apply"
              className="px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
              onClick={applySelection}
            >
              Apply selection
            </button>
            <button type="button"
              className="px-2 py-0.5 rounded border border-slate-700 text-slate-400"
              onClick={() => { setSelecting(false); setSelDraft([]); }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" data-testid="petro-select-start"
            className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200"
            title="Draw a polygon to highlight those samples on the tracks"
            onClick={() => { setSelecting(true); setDrawing(false); setDraft([]); }}
          >
            Select…
          </button>
        )}
        {selection && !selecting && (
          <button type="button" data-testid="petro-select-clear"
            className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200"
            onClick={() => onSelectionChange?.(null)}
          >
            Clear selection
          </button>
        )}

        {plot === 'nd' && (
          <div className="ml-auto flex items-center gap-1.5">
            {facies.map((f, i) => (
              <span key={f.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border border-slate-700"
                data-testid={`petro-facies-chip-${f.name}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                <span className="text-slate-300">{f.name}</span>
                <span className="text-slate-500" data-testid={`petro-facies-count-${f.name}`}>{faciesCounts[i] || 0}</span>
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-400"
                  title={`Delete facies ${f.name}`}
                  data-testid={`petro-facies-delete-${f.name}`}
                  onClick={() => onFaciesChange(facies.filter((x) => x.id !== f.id))}
                >
                  ×
                </button>
              </span>
            ))}
            {drawing ? (
              <>
                <input className={`${inputCls} w-28`} placeholder="Facies name" value={faciesName}
                  data-testid="petro-facies-name"
                  onChange={(e) => setFaciesName(e.target.value)} />
                <span className="text-slate-500">{draft.length} pts</span>
                <button type="button" data-testid="petro-facies-close"
                  className="px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={closePolygon}
                >
                  Close polygon
                </button>
                <button type="button"
                  className="px-2 py-0.5 rounded border border-slate-700 text-slate-400"
                  onClick={() => { setDrawing(false); setDraft([]); }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" data-testid="petro-facies-draw"
                className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
                onClick={() => setDrawing(true)}
              >
                Draw facies…
              </button>
            )}
          </div>
        )}

        {plot === 'hingle' && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-slate-500">Water zone (m MD)</span>
            <input className={`${inputCls} w-16`} placeholder="top" value={fitWin.top}
              data-testid="petro-hingle-top"
              onChange={(e) => setFitWin((w) => ({ ...w, top: e.target.value }))} />
            <input className={`${inputCls} w-16`} placeholder="base" value={fitWin.base}
              data-testid="petro-hingle-base"
              onChange={(e) => setFitWin((w) => ({ ...w, base: e.target.value }))} />
            <button type="button" data-testid="petro-hingle-fit"
              className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={runHingleFit}
            >
              Fit water line
            </button>
            {hFit && (
              <>
                <span className="text-slate-300" data-testid="petro-hingle-result">
                  Rw = {hFit.rw.toFixed(6)} at m = {params.m} · {hFit.nPoints} pts
                </span>
                <button type="button" data-testid="petro-hingle-apply"
                  className="px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => {
                    onApplyParams({ rw: Number(hFit.rw.toFixed(6)) });
                    onStatus(`Applied Rw = ${hFit.rw.toFixed(6)} from the Hingle fit.`);
                  }}
                >
                  Apply Rw
                </button>
              </>
            )}
          </div>
        )}

        {plot === 'pickett' && zones.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap max-w-[45%]" data-testid="petro-pickett-zones">
            <span className="text-slate-500">Zones</span>
            <button
              type="button"
              data-testid="petro-pickett-zone-all"
              title="Show every sample, including depths outside all zones"
              className={`px-1.5 py-0.5 rounded border ${zoneFilter.filtering
                ? 'border-slate-700 text-slate-400 hover:text-slate-200' : 'border-cyan-500/60 text-cyan-300'}`}
              onClick={() => setZoneIds([])}
            >
              All zones
            </button>
            {zones.map((z) => {
              const on = zoneIds.includes(z.id);
              const swatch = zoneFilter.legend.find((l) => l.name === z.name)?.color;
              return (
                <button
                  key={z.id}
                  type="button"
                  data-testid={`petro-pickett-zone-${z.name}`}
                  aria-pressed={on}
                  title={`${z.name}: ${z.top_md_m} to ${z.base_md_m} m MD`}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${on
                    ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                  onClick={() => toggleZone(z.id)}
                >
                  {swatch && <span className="w-2 h-2 rounded-sm" style={{ background: swatch }} />}
                  {z.name}
                </button>
              );
            })}
          </div>
        )}

        {plot === 'pickett' && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-slate-500">Water zone (m MD)</span>
            <input className={`${inputCls} w-16`} placeholder="top" value={fitWin.top}
              data-testid="petro-pickett-top"
              onChange={(e) => setFitWin((w) => ({ ...w, top: e.target.value }))} />
            <input className={`${inputCls} w-16`} placeholder="base" value={fitWin.base}
              data-testid="petro-pickett-base"
              onChange={(e) => setFitWin((w) => ({ ...w, base: e.target.value }))} />
            <button type="button" data-testid="petro-pickett-fit"
              className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={runFit}
            >
              Fit water line
            </button>
            {fit && (
              <>
                <span className="text-slate-300" data-testid="petro-pickett-result">
                  m = {fit.m.toFixed(3)} · a·Rw = {fit.aRw.toFixed(4)} · {fit.nPoints} pts
                </span>
                <button type="button" data-testid="petro-pickett-apply"
                  className="px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={applyFit}
                >
                  Apply to parameters
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {plot === 'nd' && (
          ndSamples.length ? (
            <Crossplot
              points={ndPoints}
              xLabel="NPHI (v/v)"
              yLabel="RHOB (g/cc)"
              xDomain={dom('nd').x}
              yDomain={dom('nd').y}
              yReverse
              overlays={ND_LITHOLOGY_LINES.map((l) => ({ ...l, color: '#94a3b8' }))}
              polygons={facies}
              draftPolygon={selecting ? selDraft : (drawing ? draft : null)}
              onPlotClick={selecting
                ? ({ x, y }) => setSelDraft((d) => [...d, [x, y]])
                : (drawing ? ({ x, y }) => setDraft((d) => [...d, [x, y]]) : undefined)}
              colorbar={colorbar}
              onDomainsChange={setDom('nd')}
            />
          ) : <p className="p-4 text-xs text-slate-500">Needs NPHI and RHOB curves.</p>
        )}
        {plot === 'pickett' && (
          pickettShown.length ? (
            <Crossplot
              points={pickettPoints}
              xLabel="RT (ohm·m)"
              yLabel="φe (v/v)"
              xDomain={dom('pickett').x}
              yDomain={dom('pickett').y}
              xLog
              yLog
              overlays={pickettOverlays}
              colorbar={colorbar}
              legend={zInfo ? [] : zoneFilter.legend}
              draftPolygon={selecting ? selDraft : null}
              onPlotClick={selecting ? ({ x, y }) => setSelDraft((d) => [...d, [x, y]]) : undefined}
              onDomainsChange={setDom('pickett')}
            />
          ) : (
            <p className="p-4 text-xs text-slate-500">
              {pickettSamples.length
                ? `No samples in ${zoneFilter.label}. Pick other zones, or All zones.`
                : 'Needs RT and a computed φe.'}
            </p>
          )
        )}
        {plot === 'buckles' && (
          bucklesSamples.length ? (
            <Crossplot
              points={bucklesPoints}
              xLabel="φe (v/v)"
              yLabel="Sw (v/v)"
              xDomain={dom('buckles').x}
              yDomain={dom('buckles').y}
              overlays={bucklesOverlays}
              colorbar={colorbar}
              draftPolygon={selecting ? selDraft : null}
              onPlotClick={selecting ? ({ x, y }) => setSelDraft((d) => [...d, [x, y]]) : undefined}
              onDomainsChange={setDom('buckles')}
            />
          ) : <p className="p-4 text-xs text-slate-500">Needs computed φe and Sw.</p>
        )}
        {plot === 'hingle' && (
          hingleSamples.length ? (
            <Crossplot
              points={hinglePoints}
              xLabel="φe (v/v)"
              yLabel={`Rt^(-1/${params.m})`}
              xDomain={dom('hingle').x}
              yDomain={dom('hingle').y}
              overlays={hingleOverlays}
              colorbar={colorbar}
              draftPolygon={selecting ? selDraft : null}
              onPlotClick={selecting ? ({ x, y }) => setSelDraft((d) => [...d, [x, y]]) : undefined}
              onDomainsChange={setDom('hingle')}
            />
          ) : <p className="p-4 text-xs text-slate-500">Needs RT and a computed φe.</p>
        )}
      </div>
    </div>
  );
}
