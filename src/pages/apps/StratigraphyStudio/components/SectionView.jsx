// Sequence-stratigraphic section and Wheeler views (Stratigraphy Studio
// ST2). Hosts the SAME shared section as Well Correlation (the
// useSectionWells hook over the saved geo_correlation_sections row, the
// shared CrossSection painter) and adds what a stratigrapher needs on top
// of it: typed surfaces drawn by type, systems-tract fills between typed
// surfaces (computed by the engine, recorded as shared intervals on
// request), motifs outlined beside the first track, a ghost curve, and
// stratigraphic flattening between two surfaces. The Wheeler view is the
// same wells re-plotted in time.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Loader2 } from 'lucide-react';
import CrossSection from '@/components/wells/section/CrossSection';
import WheelerChart from '@/components/wells/section/WheelerChart';
import { useSectionWells } from '@/components/wells/section/useSectionWells';
import { tractsWithStacking } from '@/lib/stratigraphy/sequence';
import { SYSTEMS_TRACTS, displayLabel, normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { motif as motifOf } from '@/lib/stratigraphy/vocabulary';
import { appPath } from '@/components/wells/appLinks';

const TRACT_COLOUR = Object.fromEntries(SYSTEMS_TRACTS.map((t) => [t.code, t.colour]));
const selCls = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

/**
 * @param {Object} p
 * @param {Object} p.backend
 * @param {'section'|'wheeler'} p.mode
 * @param {'catuneanu'|'exxon'} p.scheme
 * @param {(msg: string) => void} p.onStatus
 * @param {Object} [p.appPaths]
 * @param {Object} [p.saved] the strat project row (flatten, view) to restore
 * @param {(patch: Object) => Promise<void>} [p.onSaveProject]
 */
export default function SectionView({ backend, mode, scheme, onStatus, appPaths = {}, saved = null, onSaveProject }) {
  const sec = useSectionWells(backend, { onStatus });
  const { wells, order, wellData, sectionWells, topNames, datum, setDatum, depthUnit, depthRef, spacing, layouts, template } = sec;
  const [ghost, setGhost] = useState(null);
  const [showTracts, setShowTracts] = useState(true);
  const [showMotifs, setShowMotifs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  // restore the studio's own view state once
  useEffect(() => {
    if (restored || !saved) return;
    setRestored(true);
    if (saved.flatten?.mode) setDatum(saved.flatten);
    if (saved.view?.ghost) setGhost(saved.view.ghost);
  }, [saved, restored, setDatum]);

  // every well's intervals for the tract and motif overlays
  const intervalsByWell = useMemo(() => Object.fromEntries(order.map((id) => [id, wellData[id]?.intervals || []])), [order, wellData]);

  // systems tracts the typed surfaces imply, per well (engine), coloured by tract
  const impliedTracts = useMemo(() => Object.fromEntries(sectionWells.map((w) => [w.id, tractsWithStacking(w.tops, intervalsByWell[w.id])])), [sectionWells, intervalsByWell]);

  const bands = useMemo(() => {
    const out = [];
    if (showTracts) {
      for (const w of sectionWells) {
        const recorded = (intervalsByWell[w.id] || []).filter((r) => r.kind === 'systems_tract');
        const rows = recorded.length ? recorded : impliedTracts[w.id] || [];
        for (const r of rows) {
          const d = displayLabel(r.code, scheme, { kind: 'tract', short: true });
          out.push({ wellId: w.id, top_md_m: r.top_md_m, base_md_m: r.base_md_m, colour: TRACT_COLOUR[r.code] || '#94a3b8', label: `${d.label}${r.properties?.certain === false ? ' ?' : ''}${recorded.length ? '' : ' (implied)'}`, hatched: r.properties?.certain === false });
        }
      }
    }
    if (showMotifs) {
      for (const w of sectionWells) {
        for (const r of (intervalsByWell[w.id] || []).filter((x) => x.kind === 'motif')) {
          out.push({ wellId: w.id, top_md_m: r.top_md_m, base_md_m: r.base_md_m, colour: '#f472b6', label: motifOf(r.code)?.name?.split(' ')[0] || r.code, outline: true });
        }
      }
    }
    return out;
  }, [sectionWells, intervalsByWell, impliedTracts, showTracts, showMotifs, scheme]);

  const recordTracts = async () => {
    setBusy(true);
    let n = 0; let wellsDone = 0;
    try {
      for (const w of sectionWells) {
        if (!w.is_own) continue;
        const rows = impliedTracts[w.id] || [];
        await backend.replaceIntervals(w.id, 'systems_tract', rows);
        const fresh = await backend.listIntervals(w.id);
        sec.setWellData((m) => ({ ...m, [w.id]: { ...(m[w.id] || {}), intervals: fresh } }));
        n += rows.length; wellsDone += 1;
      }
      onStatus(`Recorded ${n} systems tract${n === 1 ? '' : 's'} on ${wellsDone} well${wellsDone === 1 ? '' : 's'}.`);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveView = async () => {
    if (!onSaveProject) return;
    try {
      await onSaveProject({ flatten: datum, view: { ghost, showTracts, showMotifs } });
      onStatus('Stratigraphy view saved.');
    } catch (e) { onStatus(e.message); }
  };

  // Wheeler input: the section's dated surfaces per well, positioned along the section by order
  const wheelerWells = useMemo(() => sectionWells.map((w, i) => ({
    id: w.id, name: w.name, position: i,
    surfaces: (w.tops || []).map((t) => ({ name: t.name, md_m: t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })),
  })), [sectionWells]);

  const typedCount = sectionWells.reduce((s, w) => s + (w.tops || []).filter((t) => normalizeSurfaceType(t.surface_type) !== 'formation_top').length, 0);

  if (!wells) return <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…</div>;
  if (!order.length) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm p-6 text-center" data-testid="strat-section-empty">
        No section yet. Build one in <Link className="text-cyan-300 mx-1" to={appPath('well-correlation', appPaths)}>Well Correlation</Link> and save it; it opens here.
      </div>
    );
  }

  const controls = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 text-xs flex-wrap" data-testid="strat-section-controls">
      <label className="flex items-center gap-1 text-slate-400">Datum
        <select className={selCls} value={datum.mode} data-testid="strat-datum-mode"
          onChange={(e) => {
            const m = e.target.value;
            if (m === 'structural') setDatum({ mode: 'structural' });
            else if (m === 'flatten') setDatum({ mode: 'flatten', topName: datum.topName || topNames[0], datumM: datum.datumM ?? 1500 });
            else setDatum({ mode: 'stretch', upperName: datum.upperName || topNames[0], lowerName: datum.lowerName || topNames[topNames.length - 1] });
          }}>
          <option value="structural">Structural</option>
          <option value="flatten">Flatten on a surface</option>
          <option value="stretch">Stretch between two surfaces</option>
        </select>
      </label>
      {datum.mode === 'flatten' && (
        <select className={selCls} value={datum.topName} data-testid="strat-datum-top" onChange={(e) => setDatum({ ...datum, topName: e.target.value })}>
          {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {datum.mode === 'stretch' && (
        <>
          <select className={selCls} value={datum.upperName} data-testid="strat-datum-upper" onChange={(e) => setDatum({ ...datum, upperName: e.target.value })}>
            {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-slate-500">to</span>
          <select className={selCls} value={datum.lowerName} data-testid="strat-datum-lower" onChange={(e) => setDatum({ ...datum, lowerName: e.target.value })}>
            {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </>
      )}
      <label className="flex items-center gap-1 text-slate-400 ml-2"><input type="checkbox" checked={showTracts} onChange={(e) => setShowTracts(e.target.checked)} data-testid="strat-show-tracts" /> Tracts</label>
      <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={showMotifs} onChange={(e) => setShowMotifs(e.target.checked)} data-testid="strat-show-motifs" /> Motifs</label>
      <button type="button" className={btnCls} disabled={busy || !sectionWells.some((w) => w.is_own)} onClick={recordTracts} data-testid="strat-record-tracts" title="Write the implied systems tracts to the shared intervals of every own well in the section">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Record tracts
      </button>
      <label className="flex items-center gap-1 text-slate-400 ml-2">Ghost
        <select className={selCls} value={ghost?.sourceWellId || ''} data-testid="strat-ghost-source" onChange={(e) => setGhost(e.target.value ? { sourceWellId: e.target.value, targetWellId: ghost?.targetWellId || sectionWells.find((w) => w.id !== e.target.value)?.id, shiftM: ghost?.shiftM || 0 } : null)}>
          <option value="">off</option>
          {sectionWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {ghost && (
        <>
          <span className="text-slate-500">on</span>
          <select className={selCls} value={ghost.targetWellId || ''} data-testid="strat-ghost-target" onChange={(e) => setGhost({ ...ghost, targetWellId: e.target.value })}>
            {sectionWells.filter((w) => w.id !== ghost.sourceWellId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input type="range" min={-200} max={200} step={1} value={ghost.shiftM || 0} data-testid="strat-ghost-shift" onChange={(e) => setGhost({ ...ghost, shiftM: Number(e.target.value) })} />
          <span className="text-slate-400 w-12" data-testid="strat-ghost-shift-value">{ghost.shiftM >= 0 ? '+' : ''}{ghost.shiftM || 0} m</span>
        </>
      )}
      <span className="ml-auto text-slate-500" data-testid="strat-section-summary">{sectionWells.length} wells · {typedCount} typed surfaces</span>
      <button type="button" className={btnCls} onClick={saveView} data-testid="strat-save-view" title="Save the datum and ghost with your stratigraphy project"><Save className="w-3.5 h-3.5" /> Save view</button>
    </div>
  );

  if (mode === 'wheeler') {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <div className="px-3 py-1.5 border-b border-slate-800 text-xs text-slate-400 flex items-center gap-2">
          Wheeler chart of the section, time down. Dated surfaces come from the Tops view; an unconformity needs a hiatus end.
          <span className="ml-auto text-slate-500">{typedCount} typed surfaces</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <WheelerChart wells={wheelerWells} scheme={scheme} width={Math.max(480, 160 * sectionWells.length + 80)} height={440} testIdPrefix="strat-wheeler" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {controls}
      <div className="flex-1 min-h-0">
        <CrossSection
          wells={sectionWells}
          datum={datum}
          depthUnit={depthUnit}
          depthRef={depthRef}
          spacing={spacing}
          zoneMode="none"
          shownTops={topNames}
          topNames={topNames}
          bands={bands}
          ghost={ghost}
          onNotice={onStatus}
        />
      </div>
    </div>
  );
}
