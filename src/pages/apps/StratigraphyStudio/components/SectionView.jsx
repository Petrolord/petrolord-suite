// Sequence-stratigraphic section and Wheeler views (Stratigraphy Studio
// ST2). Hosts the SAME shared section as Well Correlation (the
// useSectionWells hook over the saved geo_correlation_sections row, the
// shared CrossSection painter) and adds what a stratigrapher needs on top
// of it: typed surfaces drawn by type, systems-tract fills between typed
// surfaces (computed by the engine, recorded as shared intervals on
// request), motifs outlined beside the first track, a ghost curve, and
// stratigraphic flattening between two surfaces. The Wheeler view is the
// same wells re-plotted in time.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Loader2 } from 'lucide-react';
import CrossSection from '@/components/wells/section/CrossSection';
import WheelerChart from '@/components/wells/section/WheelerChart';
import { useSectionWells } from '@/components/wells/section/useSectionWells';
import { sequenceTracts } from '@/lib/stratigraphy/sequenceTracts';
import { SYSTEMS_TRACTS, displayLabel, normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { motif as motifOf } from '@/lib/stratigraphy/vocabulary';
import { appPath, mapNetHref, MAPPING_ID } from '@/components/wells/appLinks';
import { datumDefaultFor, DEPTH_REF_LABEL, COLUMN_WIDTHS } from '@/components/wells/section/sectionFrame';
import { useSectionHorizons } from '@/components/wells/section/useSectionHorizons';
import { wellStrips } from '@/components/wells/section/petroStrips';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';
import ChartExportButtons from '@/components/wells/section/ChartExportButtons';
import { chartHeaderLines } from '@/components/wells/section/chartExport';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

const TRACT_COLOUR = Object.fromEntries(SYSTEMS_TRACTS.map((t) => [t.code, t.colour]));
const selCls = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

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
export default function SectionView({ backend, mode, scheme, onStatus, appPaths = {}, saved = null, onSaveProject, report = null }) {
  const wheelerRef = useRef(null);
  const sec = useSectionWells(backend, { onStatus });
  const { wells, order, wellData, sectionWells, topNames, datum, setDatum, depthUnit, setDepthUnit, depthRef, setDepthRef, spacing } = sec;
  // STRAT-U1-009: Well Correlation keeps named sections (WC-U2-001); the studio
  // opens the one the user picks (remembered with Save view), else the newest
  const [sections, setSections] = useState([]);
  useEffect(() => {
    let live = true;
    if (backend.listSections) backend.listSections().then((l) => { if (live) setSections(l || []); }).catch(() => {});
    return () => { live = false; };
  }, [backend]);
  // STRAT-U1-018: spacing along a section line drawn in Well Correlation reads its saved distances
  const lineDistances = useMemo(() => {
    const along = sec.savedRow?.track_layout?.lineAlong;
    // over the wells drawn now (the section fills in well by well as their data loads)
    const ids = sectionWells.map((w) => w.id);
    if (spacing !== 'line' || !along || !ids.length || !ids.every((id) => Number.isFinite(along[id]))) return null;
    return ids.slice(1).map((id, i) => Math.abs(along[id] - along[ids[i]]));
  }, [spacing, sec.savedRow, sectionWells]);
  const [ghost, setGhost] = useState(null);
  // STRAT-U2-002: what Well Correlation U2 gave the shared section, in the
  // stratigrapher's section too: Seismolord horizons (flatten on one), the
  // Petrophysics pay and zone strips and the unit strip, the column width
  const hz = useSectionHorizons(backend, sectionWells, topNames, onStatus);
  const { viewWells, datumNames, horizonPicks } = hz;
  const [stripsOn, setStripsOn] = useState({ pay: false, zones: false, units: false });
  const [units, setUnits] = useState([]);
  useEffect(() => {
    if (!stripsOn.units || typeof backend.listUnits !== 'function') return undefined;
    let live = true;
    backend.listUnits().then((u) => { if (live) setUnits(u || []); }).catch((e) => { if (live) onStatus(`The stratigraphic column could not be read: ${e.message}`); });
    return () => { live = false; };
  }, [backend, stripsOn.units]); // eslint-disable-line react-hooks/exhaustive-deps
  const stripsByWell = useMemo(() => {
    if (!stripsOn.pay && !stripsOn.zones && !stripsOn.units) return null;
    const out = {};
    for (const w of sectionWells) {
      const d = wellData[w.id] || {};
      out[w.id] = wellStrips({ depth: d.curves?.DEPT || null, curves: { PAY: d.logs?.PAY || d.curves?.PAY || null }, zones: d.zones || [], tops: w.tops }, stripsOn, { units, unit: depthUnit });
    }
    return out;
  }, [stripsOn, sectionWells, wellData, units, depthUnit]);
  const [showTracts, setShowTracts] = useState(true);
  const [showMotifs, setShowMotifs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoreCheck, setRestoreCheck] = useState(false);

  // restore the studio's own view state once, after the shared section has loaded
  // (a remembered named section opens first, then the studio's datum and view)
  useEffect(() => {
    if (restored || !saved || !sec.sectionLoaded) return;
    setRestored(true);
    (async () => {
      // strat_projects.section_id (FK, on delete set null; remapped by the .pld import)
      const id = saved.section_id || null;
      if (id && id !== sec.sectionId && sections.some((x) => x.id === id)) await sec.openSection(id);
      if (saved.flatten?.mode) setDatum(saved.flatten);
      if (saved.view?.ghost) setGhost(saved.view.ghost);
      if (['md', 'tvd', 'tvdss', 'twt'].includes(saved.view?.depthRef)) setDepthRef(saved.view.depthRef);
      if (saved.view?.depthUnit === 'm' || saved.view?.depthUnit === 'ft') setDepthUnit(saved.view.depthUnit);
      // STRAT-U2-002: horizons, strips and column width ride in the view (jsonb, no schema change)
      if (Array.isArray(saved.view?.horizons)) hz.setHzOn(saved.view.horizons.filter((x) => typeof x === 'string'));
      if (saved.view?.strips) setStripsOn({ pay: !!saved.view.strips.pay, zones: !!saved.view.strips.zones, units: !!saved.view.strips.units });
      const cw = saved.view?.columnWidth;
      if (cw === 'auto' || cw === 'fit' || (Number(cw) >= 40 && Number(cw) <= 600)) sec.setColumnWidth(cw === 'auto' || cw === 'fit' ? cw : Number(cw));
      setRestoreCheck(true);
    })();
  }, [saved, restored, sec.sectionLoaded, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  // STRAT-U1-020 (PL5): a view saved by an earlier release may name a well or
  // a top the section no longer has; say so once the section wells are in
  useEffect(() => {
    if (!restoreCheck || sectionWells.length < order.length) return;
    setRestoreCheck(false);
    const ids = new Set(sectionWells.map((w) => w.id));
    const notes = [];
    if (ghost && (!ids.has(ghost.sourceWellId) || !ids.has(ghost.targetWellId))) { setGhost(null); notes.push('its ghost curve names a well no longer in the section, so the ghost is off'); }
    const need = datum.mode === 'flatten' ? [datum.topName] : datum.mode === 'stretch' ? [datum.upperName, datum.lowerName] : [];
    // a datum on a seismic horizon ("H: ...") is checked once its grid is drawn, not here
    const gone = need.filter((n) => n && !topNames.includes(n) && !String(n).startsWith('H: '));
    if (gone.length) notes.push(`no section well carries ${gone.map((n) => `"${n}"`).join(' or ')}, so the datum cannot hang`);
    if (notes.length) onStatus(`Saved stratigraphy view restored; ${notes.join('; ')}.`);
  }, [restoreCheck, sectionWells, order]); // eslint-disable-line react-hooks/exhaustive-deps

  // every well's intervals for the tract and motif overlays
  const intervalsByWell = useMemo(() => Object.fromEntries(order.map((id) => [id, wellData[id]?.intervals || []])), [order, wellData]);

  // systems tracts the typed surfaces imply, per well (engine), coloured by tract.
  // STRAT-U1-001: paired across formation tops, which carry no sequence meaning
  const impliedTracts = useMemo(() => Object.fromEntries(sectionWells.map((w) => [w.id, sequenceTracts(w.tops, intervalsByWell[w.id])])), [sectionWells, intervalsByWell]);
  // the tract rows each well shows: recorded ones win once written (the Wheeler reads the same rows)
  const tractRows = useMemo(() => Object.fromEntries(sectionWells.map((w) => {
    const recorded = (intervalsByWell[w.id] || []).filter((r) => r.kind === 'systems_tract');
    return [w.id, recorded.length ? recorded : impliedTracts[w.id] || []];
  })), [sectionWells, intervalsByWell, impliedTracts]);

  const bands = useMemo(() => {
    const out = [];
    if (showTracts) {
      for (const w of sectionWells) {
        const recorded = (intervalsByWell[w.id] || []).some((r) => r.kind === 'systems_tract');
        for (const r of tractRows[w.id] || []) {
          const d = displayLabel(r.code, scheme, { kind: 'tract', short: true });
          out.push({ wellId: w.id, top_md_m: r.top_md_m, base_md_m: r.base_md_m, colour: TRACT_COLOUR[r.code] || '#94a3b8', label: `${d.label}${r.properties?.certain === false ? ' ?' : ''}${recorded ? '' : ' (implied)'}`, hatched: r.properties?.certain === false });
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
  }, [sectionWells, intervalsByWell, tractRows, showTracts, showMotifs, scheme]);

  // the distinct (upper, lower) surface pairs the tracts run between, for the Mapping launcher
  const tractPairs = useMemo(() => {
    const seen = new Map();
    for (const w of sectionWells) {
      for (const r of tractRows[w.id] || []) {
        const up = r.properties?.upper_surface; const lo = r.properties?.lower_surface;
        if (!up || !lo) continue;
        const key = `${up}|${lo}`;
        if (!seen.has(key)) seen.set(key, { key, upper: up, lower: lo, label: displayLabel(r.code, scheme, { kind: 'tract', short: true }).label, href: mapNetHref(up, lo, order, { path: appPath(MAPPING_ID, appPaths) }) });
      }
    }
    return Array.from(seen.values());
  }, [sectionWells, tractRows, order, scheme, appPaths]);

  const recordTracts = async () => {
    setBusy(true);
    let n = 0; let wellsDone = 0;
    const kept = [];
    try {
      for (const w of sectionWells) {
        if (!w.is_own) continue;
        const rows = impliedTracts[w.id] || [];
        // STRAT-U1-002: a well with nothing implied keeps what it has; writing an
        // empty set used to delete its recorded (or hand-edited) tracts
        if (!rows.length) {
          const had = (intervalsByWell[w.id] || []).filter((r) => r.kind === 'systems_tract').length;
          kept.push(had ? `${w.name} kept its ${had} recorded tract${had === 1 ? '' : 's'} (nothing implied)` : `${w.name} has no pair of sequence surfaces that bounds a tract`);
          continue;
        }
        await backend.replaceIntervals(w.id, 'systems_tract', rows);
        const fresh = await backend.listIntervals(w.id);
        sec.setWellData((m) => ({ ...m, [w.id]: { ...(m[w.id] || {}), intervals: fresh } }));
        n += rows.length; wellsDone += 1;
      }
      onStatus(`Recorded ${n} systems tract${n === 1 ? '' : 's'} on ${wellsDone} well${wellsDone === 1 ? '' : 's'}${kept.length ? `; ${kept.join('; ')}` : ''}.`);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveView = async () => {
    if (!onSaveProject) return;
    try {
      await onSaveProject({ section_id: sec.sectionId || null, flatten: datum, view: { ghost, showTracts, showMotifs, depthRef, depthUnit, horizons: hz.hzOn, strips: stripsOn, columnWidth: sec.columnWidth } });
      onStatus('Stratigraphy view saved.');
    } catch (e) { onStatus(e.message); }
  };

  // Wheeler input: the section's dated surfaces per well, positioned along the section by order
  const wheelerWells = useMemo(() => sectionWells.map((w, i) => ({
    id: w.id, name: w.name, position: i,
    surfaces: (w.tops || []).map((t) => ({ name: t.name, md_m: t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })),
  })), [sectionWells]);

  // the ghost shift in the display unit (ms on a TWT section)
  const ru = depthRef === 'twt' ? 'ms' : depthUnit;
  const typedCount = sectionWells.reduce((s, w) => s + (w.tops || []).filter((t) => normalizeSurfaceType(t.surface_type) !== 'formation_top').length, 0);
  const tractCount = sectionWells.reduce((s, w) => s + (tractRows[w.id] || []).length, 0);

  if (!wells) return <div className="h-full flex items-center justify-center text-pl-muted text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…</div>;
  if (!order.length) {
    return (
      <div className="h-full flex items-center justify-center text-pl-muted text-sm p-6 text-center" data-testid="strat-section-empty">
        No section yet. Build one in <Link className="text-pl-primary-text mx-1" to={appPath('well-correlation', appPaths)}>Well Correlation</Link> and save it; it opens here.
      </div>
    );
  }

  // STRAT-U1-009 named sections; STRAT-U2-002: the Wheeler has the picker too
  const sectionPicker = sections.length > 0 && (
    <label className="flex items-center gap-1 text-pl-muted" title="Named sections saved in Well Correlation">Section
      <select className={selCls} value={sec.sectionId || ''} data-testid={`strat-${mode === 'wheeler' ? 'wheeler-' : ''}section-pick`}
        onChange={(e) => { if (e.target.value) sec.openSection(e.target.value); }}>
        {!sec.sectionId && <option value="">(unsaved)</option>}
        {sections.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.wellCount} wells)</option>)}
      </select>
    </label>
  );

  const controls = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-pl-border text-xs flex-wrap" data-testid="strat-section-controls" data-tract-links={tractPairs.map((x) => x.href).join(' ')} data-datum={JSON.stringify(datum)} data-section-id={sec.sectionId || ''}>
      {sectionPicker}
      <label className="flex items-center gap-1 text-pl-muted" title="Depth reference of the section: MD, TVD or TVDSS through each survey and KB, or TWT through the checkshots">Depth
        <select className={selCls} value={depthRef} data-testid="strat-depth-ref" onChange={(e) => setDepthRef(e.target.value)}>
          {['md', 'tvd', 'tvdss', 'twt'].map((r) => <option key={r} value={r}>{DEPTH_REF_LABEL[r] || r.toUpperCase()}</option>)}
        </select>
        {depthRef !== 'twt' && (
          <select className={selCls} value={depthUnit} data-testid="strat-depth-unit" onChange={(e) => setDepthUnit(e.target.value)}>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        )}
      </label>
      <label className="flex items-center gap-1 text-pl-muted">Datum
        <select className={selCls} value={datum.mode} data-testid="strat-datum-mode"
          onChange={(e) => {
            const m = e.target.value;
            if (m === 'structural') setDatum({ mode: 'structural' });
            // STRAT-U1-012 (carried from WC-U1-009): the datum sits at the chosen top's depth, never a fixed 1,500 m
            else if (m === 'flatten') { const n = datum.topName || datumNames[0]; setDatum({ mode: 'flatten', topName: n, datumM: datum.datumM ?? datumDefaultFor(viewWells, n, depthRef) ?? 0 }); }
            else setDatum({ mode: 'stretch', upperName: datum.upperName || datumNames[0], lowerName: datum.lowerName || datumNames[datumNames.length - 1] });
          }}>
          <option value="structural">Structural</option>
          <option value="flatten">Flatten on a surface</option>
          <option value="stretch">Stretch between two surfaces</option>
        </select>
      </label>
      {datum.mode === 'flatten' && (
        <select className={selCls} value={datum.topName} data-testid="strat-datum-top" onChange={(e) => setDatum({ ...datum, topName: e.target.value, datumM: datumDefaultFor(viewWells, e.target.value, depthRef) ?? datum.datumM })}>
          {datumNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {datum.mode === 'stretch' && (
        <>
          <select className={selCls} value={datum.upperName} data-testid="strat-datum-upper" onChange={(e) => setDatum({ ...datum, upperName: e.target.value })}>
            {datumNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-pl-muted">to</span>
          <select className={selCls} value={datum.lowerName} data-testid="strat-datum-lower" onChange={(e) => setDatum({ ...datum, lowerName: e.target.value })}>
            {datumNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </>
      )}
      <label className="flex items-center gap-1 text-pl-muted" title="Column width: fit the window, or a fixed width with a horizontal scroll (auto fixes it once fitted columns get narrower than 90 px)">Columns
        <select className={selCls} value={String(sec.columnWidth)} data-testid="strat-col-width"
          onChange={(e) => sec.setColumnWidth(e.target.value === 'auto' || e.target.value === 'fit' ? e.target.value : Number(e.target.value))}>
          {COLUMN_WIDTHS.map((c) => <option key={c} value={String(c)}>{typeof c === 'number' ? `${c} px` : c}</option>)}
        </select>
      </label>
      {hz.canHorizons && (
        <details className="relative" data-testid="strat-horizons">
          <summary className="cursor-pointer text-pl-muted select-none" title="Seismic horizons from the surface registry (Seismolord converts its horizons there), read only">Horizons ({hz.hzOn.length}/{hz.hzList.length})</summary>
          <div className="absolute z-20 mt-1 w-80 p-2 rounded border border-pl-border bg-pl-surface shadow space-y-1">
            {!hz.hzList.length && <p className="text-pl-muted">No time or depth structure surfaces in the registry. Convert a Seismolord horizon to a surface to see it here.</p>}
            {hz.hzList.map((h) => {
              const on = hz.hzOn.includes(h.id);
              const drawn = Object.values(horizonPicks.byWell || {}).flat().filter((t) => t.id.startsWith(`hz:${h.id}:`)).length;
              const probs = horizonPicks.problems?.[h.id] || [];
              return (
                <div key={h.id}>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={on} data-testid={`strat-hz-${h.id}`} onChange={() => hz.toggleHorizon(h.id)} />
                    <span className="text-pl-text truncate" title={`${h.name} (${h.source})`}>{h.horizonName}</span>
                    <span className="text-pl-muted text-[10px] whitespace-nowrap">{h.domain === 'time' ? 'TWT ms' : `depth ${h.zUnit}`} · {h.source}</span>
                  </label>
                  {on && hz.hzGrids[h.id] && <p className="pl-5 text-[10px] text-pl-muted" data-testid={`strat-hz-note-${h.id}`}>drawn on {drawn} well{drawn === 1 ? '' : 's'}{probs.length ? `; not on ${probs.join(', ')}` : ''}</p>}
                </div>
              );
            })}
            <p className="text-[10px] text-pl-muted">Each horizon is sampled where the wellbore crosses it (time horizons through the checkshots), drawn dotted and offered to Datum. Nothing is written.</p>
          </div>
        </details>
      )}
      <details className="relative" data-testid="strat-strips">
        <summary className="cursor-pointer text-pl-muted select-none" title="Pay and zones Petrophysics Studio published, and the units of this column, as narrow strips beside each well">Strips ({['pay', 'zones', 'units'].filter((k) => stripsOn[k]).length})</summary>
        <div className="absolute z-20 mt-1 w-72 p-2 rounded border border-pl-border bg-pl-surface shadow space-y-1">
          {[['pay', 'Pay flag (published PAY curve)', true], ['zones', 'Zones with their published net, PHIE, Sw', typeof backend.listZones === 'function'], ['units', 'Stratigraphic units (tops linked to the column)', typeof backend.listUnits === 'function']]
            .filter(([, , ok]) => ok).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!stripsOn[k]} data-testid={`strat-strip-${k}`} onChange={(e) => setStripsOn({ ...stripsOn, [k]: e.target.checked })} />
                <span className="text-pl-text">{label}</span>
              </label>
            ))}
          <p className="text-[10px] text-pl-muted">Drawn at the left of each well; a well without the data says so in its header.</p>
        </div>
      </details>
      <label className="flex items-center gap-1 text-pl-muted ml-2"><input type="checkbox" checked={showTracts} onChange={(e) => setShowTracts(e.target.checked)} data-testid="strat-show-tracts" /> Tracts</label>
      <label className="flex items-center gap-1 text-pl-muted"><input type="checkbox" checked={showMotifs} onChange={(e) => setShowMotifs(e.target.checked)} data-testid="strat-show-motifs" /> Motifs</label>
      <button type="button" className={btnCls} disabled={busy || !sectionWells.some((w) => w.is_own)} onClick={recordTracts} data-testid="strat-record-tracts" title="Write the implied systems tracts to the shared intervals of every own well in the section">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Record tracts
      </button>
      <label className="flex items-center gap-1 text-pl-muted ml-2">Ghost
        <select className={selCls} value={ghost?.sourceWellId || ''} data-testid="strat-ghost-source" onChange={(e) => setGhost(e.target.value ? { sourceWellId: e.target.value, targetWellId: ghost?.targetWellId || sectionWells.find((w) => w.id !== e.target.value)?.id, shiftM: ghost?.shiftM || 0 } : null)}>
          <option value="">off</option>
          {sectionWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {ghost && (
        <>
          <span className="text-pl-muted">on</span>
          <select className={selCls} value={ghost.targetWellId || ''} data-testid="strat-ghost-target" onChange={(e) => setGhost({ ...ghost, targetWellId: e.target.value })}>
            {sectionWells.filter((w) => w.id !== ghost.sourceWellId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {/* STRAT-U2-002 (U1-030): the shift reads and moves in the display unit (ms on TWT), as in Well Correlation */}
          <input type="range" min={Math.round(toDisplay(-200, ru))} max={Math.round(toDisplay(200, ru))} step={1} value={Math.round(toDisplay(ghost.shiftM || 0, ru))} data-testid="strat-ghost-shift"
            onChange={(e) => setGhost({ ...ghost, shiftM: fromDisplay(Number(e.target.value), ru) })} />
          <span className="text-pl-muted w-14" data-testid="strat-ghost-shift-value">{(ghost.shiftM || 0) >= 0 ? '+' : ''}{Math.round(toDisplay(ghost.shiftM || 0, ru))} {ru}</span>
          <select className={selCls} value={ghost.tracks === 'all' ? 'all' : 'first'} data-testid="strat-ghost-tracks" title="Lay every track of the source well, or only its first" onChange={(e) => setGhost({ ...ghost, tracks: e.target.value })}>
            <option value="first">first track</option>
            <option value="all">all tracks</option>
          </select>
          <label className="flex items-center gap-1 text-pl-muted" title="Stretch (above 1) or squeeze (below 1) the ghost about the middle of its log">stretch
            <input type="range" min={50} max={200} step={1} value={Math.round((ghost.stretch || 1) * 100)} data-testid="strat-ghost-stretch" onChange={(e) => setGhost({ ...ghost, stretch: Number(e.target.value) / 100 })} />
            <span data-testid="strat-ghost-stretch-value">x{(ghost.stretch || 1).toFixed(2)}</span>
          </label>
        </>
      )}
      {tractPairs.length > 0 && (
        <label className="flex items-center gap-1 text-pl-muted ml-2">Map net sand
          <select className={selCls} value="" data-testid="strat-map-tract" title="Open Mapping & Surface Studio on the net sand between a tract's surfaces across the section wells"
            onChange={(e) => { const pair = tractPairs.find((x) => x.key === e.target.value); if (pair) window.location.assign(mapNetHref(pair.upper, pair.lower, order, { path: appPath(MAPPING_ID, appPaths) })); }}>
            <option value="">choose a tract</option>
            {tractPairs.map((x) => <option key={x.key} value={x.key}>{x.label}: {x.upper} to {x.lower}</option>)}
          </select>
        </label>
      )}
      <span className="ml-auto text-pl-muted" data-testid="strat-section-summary">{sectionWells.length} wells · {typedCount} typed surfaces · {tractCount} tract{tractCount === 1 ? '' : 's'}</span>
      <button type="button" className={btnCls} onClick={saveView} data-testid="strat-save-view" title="Save the datum and ghost with your stratigraphy project"><Save className="w-3.5 h-3.5" /> Save view</button>
    </div>
  );

  if (mode === 'wheeler') {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <div className="px-3 py-1.5 border-b border-pl-border text-xs text-pl-muted flex items-center gap-2 flex-wrap">
          {sectionPicker}
          Wheeler chart of the section at its wells, time down (not interpolated between wells). Dated surfaces come from the Tops view; an unconformity needs a hiatus end.
          <span className="ml-auto text-pl-muted">{typedCount} typed surfaces · {tractCount} tract{tractCount === 1 ? '' : 's'}</span>
          <ChartExportButtons targetRef={wheelerRef} fileBase={`${sec.sectionName || 'Section'} Wheeler`} onStatus={onStatus} testIdPrefix="strat-wheeler"
            headerLines={() => chartHeaderLines({ title: `Wheeler chart: ${sec.sectionName || 'section'}`, wells: sectionWells.map((w) => w.name), section: sec.sectionName, scheme, timescale: TIMESCALE_VERSION, basis: 'ages from dated surfaces; columns in section order', field: report?.field || sec.savedRow?.track_layout?.report?.field, analyst: report?.analyst || sec.savedRow?.track_layout?.report?.analyst })} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3" ref={wheelerRef}>
          <WheelerChart wells={wheelerWells} tractRows={tractRows} scheme={scheme} width={Math.max(480, 160 * sectionWells.length + 80)} height={440} testIdPrefix="strat-wheeler" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {controls}
      <div className="flex-1 min-h-0">
        <CrossSection
          wells={viewWells}
          datum={datum}
          depthUnit={depthUnit}
          depthRef={depthRef}
          spacing={spacing}
          lineDistances={lineDistances}
          columnWidth={sec.columnWidth}
          zoneMode="none"
          shownTops={horizonPicks.names.length ? [...topNames, ...horizonPicks.names] : topNames}
          topNames={topNames}
          bands={bands}
          ghost={ghost}
          strips={stripsByWell}
          onNotice={onStatus}
        />
      </div>
    </div>
  );
}
