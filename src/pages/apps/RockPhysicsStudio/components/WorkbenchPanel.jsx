// Multi-well crossplot workbench (QI programme Q1 / A2, 2026-10-06): any two
// logs or elastic properties over every selected well and one interval,
// coloured by well, fluid, lithology, depth or a third property, with no
// point cap (the canvas batches large clouds). Per-well statistics with a
// pooling warning, and facies polygons counted per well. The canvas is
// Petrophysics Studio's analytic Crossplot (white, ChartLogo), so drawing,
// zoom, pan and identify work the same in both apps.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Crossplot from '../../PetrophysicsStudio/components/Crossplot';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  loadWellForWorkbench, workbenchVariables, workbenchData, faciesCounts, commonZoneNames, prepareFaciesLog, faciesWriteTargets, WELL_COLORS, ALL_SAMPLES, FACIES_MNEMONIC,
} from '../services/workbench';
import { PIPELINE_VERSION, ENGINE } from '../services/publish';
import { scaleColor } from '../services/crossplot';
import { DEFAULT_UNITS } from '../services/units';

const FACIES_COLORS = ['#16a34a', '#dc2626', '#ca8a04', '#0e7490', '#9333ea', '#be123c'];
const GROUP_COLORS = { hydrocarbon: '#dc2626', water: '#2563eb', sand: '#ca8a04', shale: '#475569', 'no Sw': '#94a3b8', 'no VSH': '#94a3b8' };
const pad = ([lo, hi], f = 0.06) => { const s = hi - lo || Math.abs(hi) * 0.1 || 1; return [lo - f * s, hi + f * s]; };
const fmt = (v) => (Number.isFinite(v) ? Number(v.toPrecision(4)).toString() : EMPTY_VALUE);

export default function WorkbenchPanel({
  wells = [], backend, rock, units = DEFAULT_UNITS, currentWellId = null, projectId = null,
}) {
  const [chosen, setChosen] = useState(() => (currentWellId ? [currentWellId] : []));
  const [loaded, setLoaded] = useState({}); // id -> {well, model, zones} | {error}
  const [loading, setLoading] = useState(new Set());
  const [x, setX] = useState('ai');
  const [y, setY] = useState('vpvs');
  const [color, setColor] = useState('well');
  const [zoneName, setZoneName] = useState(ALL_SAMPLES);
  const [chiText, setChiText] = useState('20');
  const chi = Math.max(-90, Math.min(90, Number.isFinite(parseFloat(chiText)) ? parseFloat(chiText) : 20));
  const [domains, setDomains] = useState(null);
  const [facies, setFacies] = useState([]); // {name, color, polygon, axes}
  const [draft, setDraft] = useState(null); // null | [[x, y], ...]
  const [faciesName, setFaciesName] = useState('');
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState('');
  const trendKey = JSON.stringify(rock?.localVs?.coef || null) + JSON.stringify(rock?.pseudoSonic || null);

  // load each chosen well once; again when the saved shear trend or the
  // pseudo-sonic setting changes (a generation counter drops stale answers)
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const gen = useRef(0);
  const inFlight = useRef(new Set());
  const firstKey = useRef(trendKey);
  useEffect(() => {
    if (firstKey.current === trendKey) return;
    firstKey.current = trendKey;
    gen.current += 1;
    inFlight.current = new Set();
    setLoading(new Set());
    setLoaded({});
  }, [trendKey]);
  useEffect(() => {
    for (const id of chosen) {
      if (loaded[id] || inFlight.current.has(id)) continue;
      const well = wells.find((w) => w.id === id);
      if (!well) continue;
      const g = gen.current;
      inFlight.current.add(id);
      setLoading((s) => new Set(s).add(id));
      const done = (r) => {
        if (!mounted.current || g !== gen.current) return;
        inFlight.current.delete(id);
        setLoaded((m) => ({ ...m, [id]: r }));
        setLoading((s) => { const n = new Set(s); n.delete(id); return n; });
      };
      loadWellForWorkbench(backend, well, { pseudoSonic: rock?.pseudoSonic || null, localVs: rock?.localVs || null })
        .then(done)
        .catch((e) => done({ well, error: e.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, loaded, backend, wells]);

  const ready = chosen.map((id) => loaded[id]).filter((r) => r && !r.error);
  const failed = chosen.map((id) => loaded[id]).filter((r) => r?.error);
  const zonesShared = useMemo(() => commonZoneNames(ready), [ready]);
  const zone = zoneName === ALL_SAMPLES || zonesShared.includes(zoneName) ? zoneName : ALL_SAMPLES;
  const vars = useMemo(() => workbenchVariables(units, chi), [units, chi]);
  const axesKey = `${x}|${y}|${units.velocity}|${units.density}|${units.depth}|${x === 'eei' || y === 'eei' ? chi : ''}`;

  const data = useMemo(
    () => (ready.length ? workbenchData(ready, { x, y, color, zoneName: zone, chi, units }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready.length, ...ready.map((r) => r.model), x, y, color, zone, chi, units],
  );

  const activeFacies = facies.filter((f) => f.axes === axesKey);
  const counts = useMemo(
    () => (data && !data.error && activeFacies.length ? faciesCounts(data.points, activeFacies, ready.length) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, facies, axesKey],
  );

  const plot = useMemo(() => {
    if (!data || data.error || !data.points.length) return null;
    let xLo = Infinity; let xHi = -Infinity; let yLo = Infinity; let yHi = -Infinity;
    for (const p of data.points) { xLo = Math.min(xLo, p.x); xHi = Math.max(xHi, p.x); yLo = Math.min(yLo, p.y); yHi = Math.max(yHi, p.y); }
    const colorOf = (p) => {
      if (color === 'well') return WELL_COLORS[p.wi % WELL_COLORS.length];
      if (p.group) return GROUP_COLORS[p.group];
      return scaleColor(p.zv, data.colorRange);
    };
    const wellName = (wi) => ready[wi]?.well.name || '';
    return {
      points: data.points.map((p) => ({ x: p.x, y: p.y, depthM: p.depthM, zv: p.zv, color: colorOf(p), label: wellName(p.wi) })),
      x: pad([xLo, xHi]),
      y: pad([yLo, yHi]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, color]);

  const legend = color === 'well'
    ? ready.map((r, wi) => ({ name: r.well.name, color: WELL_COLORS[wi % WELL_COLORS.length] }))
    : color === 'fluid' ? [{ name: 'water', color: GROUP_COLORS.water }, { name: 'hydrocarbon (Sw < 0.7)', color: GROUP_COLORS.hydrocarbon }]
      : color === 'lithology' ? [{ name: 'sand (VSH < 0.5)', color: GROUP_COLORS.sand }, { name: 'shale', color: GROUP_COLORS.shale }] : [];
  const colorbar = data && !data.error && data.color && data.colorRange
    ? { title: `${data.color.label}${data.color.unit ? ` (${data.color.unit})` : ''}`, domain: data.colorRange, mapFn: (t) => scaleColor(data.colorRange[0] + t * (data.colorRange[1] - data.colorRange[0]), data.colorRange) }
    : null;
  const axisLabel = (v) => `${v.label}${v.unit ? ` (${v.unit})` : ''}`;

  const toggleWell = (id) => setChosen((c) => (c.includes(id) ? c.filter((k) => k !== id) : [...c, id]));
  const closeFacies = () => {
    if (!draft || draft.length < 3) return;
    const name = faciesName.trim() || `Facies ${facies.length + 1}`;
    setFacies((f) => [...f, { name, color: FACIES_COLORS[f.length % FACIES_COLORS.length], polygon: draft, axes: axesKey }]);
    setDraft(null);
    setFaciesName('');
  };
  // write the facies codes to every plotted well the user owns; a colleague's
  // shared well is read-only and is skipped with a note
  const writeFacies = async () => {
    if (!backend?.publishCurves || !activeFacies.length || !data || data.error) return;
    setWriting(true);
    setWriteNote('');
    const done = []; const failedNames = [];
    const { own, skipped } = faciesWriteTargets(ready);
    for (const r of own) {
      try {
        const log = prepareFaciesLog(r, activeFacies, { x, y, units, chi, eeiInfo: data.eeiInfo, projectId, pipelineVersion: PIPELINE_VERSION, engine: ENGINE });
        await backend.publishCurves(r.well.id, [log], projectId);
        done.push(r.well.name);
      } catch (e) {
        failedNames.push(`${r.well.name} (${e.message})`);
      }
    }
    setWriting(false);
    setWriteNote([
      done.length ? `${FACIES_MNEMONIC} written to ${done.join(', ')}.` : '',
      skipped.length ? `Skipped ${skipped.join(', ')}: shared with you read-only.` : '',
      failedNames.length ? `Not written: ${failedNames.join('; ')}.` : '',
    ].filter(Boolean).join(' '));
  };

  const select = 'bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text';

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-workbench">
      <div className="flex flex-wrap items-start gap-4 text-[12px] text-pl-text">
        <fieldset className="min-w-[200px]">
          <legend className="text-pl-muted mb-1">Wells</legend>
          <div className="max-h-28 overflow-y-auto space-y-0.5 pr-2" data-testid="rp-workbench-wells">
            {wells.map((w) => (
              <label key={w.id} className="flex items-center gap-1">
                <input type="checkbox" className="accent-pl-primary" checked={chosen.includes(w.id)} onChange={() => toggleWell(w.id)} data-testid={`rp-workbench-well-${w.id}`} />
                <span className="truncate">{w.name}</span>
                {loading.has(w.id) && <span className="text-pl-muted">loading</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1"><span className="text-pl-muted">X</span>
            <select data-testid="rp-workbench-x" value={x} onChange={(e) => setX(e.target.value)} className={select}>{vars.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select>
          </label>
          <label className="flex items-center gap-1"><span className="text-pl-muted">Y</span>
            <select data-testid="rp-workbench-y" value={y} onChange={(e) => setY(e.target.value)} className={select}>{vars.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select>
          </label>
          <label className="flex items-center gap-1"><span className="text-pl-muted">Colour</span>
            <select data-testid="rp-workbench-color" value={color} onChange={(e) => setColor(e.target.value)} className={select}>
              <option value="well">Well</option>
              <option value="fluid">Fluid (Sw)</option>
              <option value="lithology">Lithology (VSH)</option>
              {vars.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><span className="text-pl-muted">Interval</span>
            <select data-testid="rp-workbench-zone" value={zone} onChange={(e) => setZoneName(e.target.value)} className={select}>
              <option value={ALL_SAMPLES}>Every sample</option>
              {zonesShared.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><span className="text-pl-muted">EEI χ</span>
            <input data-testid="rp-workbench-chi" inputMode="decimal" value={chiText} onChange={(e) => setChiText(e.target.value)} className={`${select} w-14`} />
          </label>
        </div>
      </div>

      {!chosen.length && <p className="text-[12px] text-pl-muted">Tick one or more wells to plot them together.</p>}
      {failed.map((f) => <p key={f.well.id} className="text-[12px] text-pl-warning-text">{`${f.well.name}: ${f.error}`}</p>)}
      {data?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-workbench-error">{data.error}</p>}

      {plot && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-pl-text">
            <span className="text-pl-muted" data-testid="rp-workbench-summary">
              {`${plot.points.length} samples from ${ready.length} well${ready.length === 1 ? '' : 's'}${zone === ALL_SAMPLES ? '' : ` in ${zone}`}, every sample drawn.`}
              {data.eeiInfo ? ` EEI uses one K (${data.eeiInfo.K.toFixed(3)}) and one set of references across the wells.` : ''}
            </span>
            {draft ? (
              <>
                <input value={faciesName} onChange={(e) => setFaciesName(e.target.value)} placeholder="Facies name" className={`${select} w-32`} data-testid="rp-workbench-facies-name" />
                <button type="button" className="px-2 py-0.5 rounded border border-pl-border-strong hover:bg-pl-sunken" onClick={closeFacies} disabled={draft.length < 3} data-testid="rp-workbench-facies-close">Close polygon</button>
                <button type="button" className="px-2 py-0.5 rounded border border-pl-border-strong hover:bg-pl-sunken" onClick={() => setDraft(null)}>Cancel</button>
                <span className="text-pl-muted">Click the plot to add corners.</span>
              </>
            ) : (
              <button type="button" className="px-2 py-0.5 rounded border border-pl-border-strong hover:bg-pl-sunken" onClick={() => setDraft([])} data-testid="rp-workbench-facies-draw">Draw a facies polygon</button>
            )}
            {domains && <button type="button" className="px-2 py-0.5 rounded border border-pl-border-strong hover:bg-pl-sunken" onClick={() => setDomains(null)}>Reset zoom</button>}
          </div>
          <div style={{ height: 480 }} data-testid="rp-workbench-plot">
            <Crossplot
              points={plot.points}
              xLabel={axisLabel(data.x)}
              yLabel={axisLabel(data.y)}
              xDomain={domains?.x || plot.x}
              yDomain={domains?.y || plot.y}
              legend={legend}
              colorbar={colorbar}
              polygons={activeFacies}
              draftPolygon={draft}
              onPlotClick={draft ? ({ x: px, y: py }) => setDraft((d) => [...d, [px, py]]) : undefined}
              onDomainsChange={setDomains}
            />
          </div>
        </>
      )}

      {data && !data.error && data.stats.length > 0 && (
        <div className="space-y-1">
          <table className="text-[12px] text-pl-text" data-testid="rp-workbench-stats">
            <thead>
              <tr className="text-pl-muted text-left">
                <th className="px-2 py-1 font-normal">Well</th>
                <th className="px-2 py-1 font-normal">Samples</th>
                <th className="px-2 py-1 font-normal">{`Mean ${data.x.label}`}</th>
                <th className="px-2 py-1 font-normal">{`SD ${data.x.label}`}</th>
                <th className="px-2 py-1 font-normal">{`Mean ${data.y.label}`}</th>
                <th className="px-2 py-1 font-normal">{`SD ${data.y.label}`}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {data.stats.map((r) => (
                <tr key={r.wi}>
                  <td className="px-2 py-0.5 font-sans">{r.well}</td>
                  <td className="px-2 py-0.5">{r.n}</td>
                  <td className="px-2 py-0.5">{fmt(r.meanX)}</td>
                  <td className="px-2 py-0.5">{fmt(r.sdX)}</td>
                  <td className="px-2 py-0.5">{fmt(r.meanY)}</td>
                  <td className="px-2 py-0.5">{fmt(r.sdY)}</td>
                </tr>
              ))}
              {data.pooled && data.stats.length > 1 && (
                <tr className="border-t border-pl-border">
                  <td className="px-2 py-0.5 font-sans">All wells</td>
                  <td className="px-2 py-0.5">{data.pooled.n}</td>
                  <td className="px-2 py-0.5">{fmt(data.pooled.meanX)}</td>
                  <td className="px-2 py-0.5">{fmt(data.pooled.sdX)}</td>
                  <td className="px-2 py-0.5">{fmt(data.pooled.meanY)}</td>
                  <td className="px-2 py-0.5">{fmt(data.pooled.sdY)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {data.pooled && data.stats.length > 1 && <p className="text-[11px] text-pl-muted">The SD on the All wells row is the pooled within-well standard deviation.</p>}
          {data.warnings.map((w) => <p key={w} className="text-[12px] text-pl-warning-text" data-testid="rp-workbench-warning">{w}</p>)}
        </div>
      )}

      {counts && (
        <table className="text-[12px] text-pl-text" data-testid="rp-workbench-facies">
          <thead>
            <tr className="text-pl-muted text-left">
              <th className="px-2 py-1 font-normal">Facies</th>
              {ready.map((r) => <th key={r.well.id} className="px-2 py-1 font-normal">{r.well.name}</th>)}
              <th className="px-2 py-1 font-normal" />
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {activeFacies.map((f, k) => (
              <tr key={f.name}>
                <td className="px-2 py-0.5 font-sans"><span className="inline-block w-2.5 h-2.5 mr-1 rounded-sm" style={{ background: f.color }} />{f.name}</td>
                {counts.counts[k].map((n, wi) => <td key={ready[wi].well.id} className="px-2 py-0.5">{n}</td>)}
                <td className="px-2 py-0.5 font-sans"><button type="button" className="underline text-pl-muted hover:text-pl-text" onClick={() => setFacies((all) => all.filter((x2) => x2 !== f))}>Remove</button></td>
              </tr>
            ))}
            <tr><td className="px-2 py-0.5 font-sans text-pl-muted" colSpan={ready.length + 2}>{`${counts.untagged} samples outside every polygon. A sample in two polygons counts in the first.`}</td></tr>
          </tbody>
        </table>
      )}
      {counts && backend?.publishCurves && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <button
            type="button"
            data-testid="rp-workbench-facies-write"
            onClick={writeFacies}
            disabled={writing}
            title={`Writes ${FACIES_MNEMONIC} (1 to ${activeFacies.length} by polygon, 0 inside none) over each plotted well's whole depth, for the other apps to use`}
            className="px-2 py-1 rounded border border-pl-primary bg-pl-primary/10 text-pl-primary-text hover:bg-pl-primary/20 disabled:opacity-50"
          >
            {writing ? 'Writing' : 'Write facies to the wells'}
          </button>
          {writeNote && <span className="text-pl-muted" data-testid="rp-workbench-facies-note">{writeNote}</span>}
        </div>
      )}
      {facies.length > activeFacies.length && (
        <p className="text-[11px] text-pl-muted">{`${facies.length - activeFacies.length} polygon${facies.length - activeFacies.length === 1 ? ' was' : 's were'} drawn on other axes or units and ${facies.length - activeFacies.length === 1 ? 'is' : 'are'} hidden here.`}</p>
      )}
    </div>
  );
}
