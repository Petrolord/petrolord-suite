// Crossplot windows (Petrophysics Studio G2.4): density-neutron with
// chart-book lithology overlays + manual facies polygon tagging, and
// the Pickett plot with live iso-Sw lines + a depth-windowed
// water-line fit that writes m and Rw back to the parameter set (the
// classic workflow: pick the aquifer, fit, apply).

import React, { useMemo, useState } from 'react';
import Crossplot from './Crossplot';
import {
  crossplotSamples, ND_LITHOLOGY_LINES, pickettIsoSwLine, pickettFitDepthWindow, faciesCurve,
} from '../engine/crossplot';

const FACIES_COLORS = ['#d97706', '#059669', '#7c3aed', '#dc2626', '#2563eb', '#ca8a04'];
const ISO_SW = [1, 0.8, 0.6, 0.4, 0.2];
const POINT_COLOR = '#64748b';
const WINDOW_COLOR = '#0891b2';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';

export default function CrossplotPanel({
  curves, outputs, params, facies, onFaciesChange, onApplyParams, onStatus,
}) {
  const [plot, setPlot] = useState('nd');            // 'nd' | 'pickett'
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState([]);            // [[x, y]] in ND space
  const [faciesName, setFaciesName] = useState('');
  const [fitWin, setFitWin] = useState({ top: '', base: '' });
  const [fit, setFit] = useState(null);              // {m, aRw, nPoints}

  const ndSamples = useMemo(() => (curves.NPHI && curves.RHOB
    ? crossplotSamples(curves.NPHI, curves.RHOB, curves.DEPT) : []), [curves]);
  const pickettSamples = useMemo(() => (curves.RT && outputs?.PHIE
    ? crossplotSamples(curves.RT, outputs.PHIE, curves.DEPT) : []), [curves, outputs]);

  const ndTags = useMemo(() => (curves.NPHI && curves.RHOB && facies.length
    ? faciesCurve(curves.NPHI, curves.RHOB, facies) : null), [curves, facies]);

  const ndPoints = useMemo(() => ndSamples.map((s) => ({
    x: s.x,
    y: s.y,
    color: ndTags && !Number.isNaN(ndTags[s.i]) ? facies[ndTags[s.i]].color : POINT_COLOR,
  })), [ndSamples, ndTags, facies]);

  const pickettPoints = useMemo(() => {
    const top = Number(fitWin.top);
    const base = Number(fitWin.base);
    const winValid = Number.isFinite(top) && Number.isFinite(base) && base > top;
    return pickettSamples.map((s) => ({
      x: s.x,
      y: s.y,
      color: winValid && s.depthM >= top && s.depthM <= base ? WINDOW_COLOR : POINT_COLOR,
    }));
  }, [pickettSamples, fitWin]);

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

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="petro-crossplot">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 text-xs">
        <button
          type="button"
          data-testid="petro-plot-nd"
          className={`px-2 py-0.5 rounded border ${plot === 'nd' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setPlot('nd')}
        >
          Density–Neutron
        </button>
        <button
          type="button"
          data-testid="petro-plot-pickett"
          className={`px-2 py-0.5 rounded border ${plot === 'pickett' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setPlot('pickett')}
        >
          Pickett
        </button>

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
        {plot === 'nd' ? (
          ndSamples.length ? (
            <Crossplot
              points={ndPoints}
              xLabel="NPHI (v/v)"
              yLabel="RHOB (g/cc)"
              xDomain={[-0.05, 0.5]}
              yDomain={[1.9, 3.0]}
              yReverse
              overlays={ND_LITHOLOGY_LINES.map((l) => ({ ...l, color: '#94a3b8' }))}
              polygons={facies}
              draftPolygon={drawing ? draft : null}
              onPlotClick={drawing ? ({ x, y }) => setDraft((d) => [...d, [x, y]]) : undefined}
            />
          ) : <p className="p-4 text-xs text-slate-500">Needs NPHI and RHOB curves.</p>
        ) : (
          pickettSamples.length ? (
            <Crossplot
              points={pickettPoints}
              xLabel="RT (ohm·m)"
              yLabel="φe (v/v)"
              xDomain={[0.1, 1000]}
              yDomain={[0.01, 1]}
              xLog
              yLog
              overlays={pickettOverlays}
            />
          ) : <p className="p-4 text-xs text-slate-500">Needs RT and a computed φe.</p>
        )}
      </div>
    </div>
  );
}
