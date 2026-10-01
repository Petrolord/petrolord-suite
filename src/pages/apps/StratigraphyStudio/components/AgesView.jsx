// Ages view (Stratigraphy Studio ST3): the selected well in time. The
// age-depth plot with the accumulation rate of each segment and the
// hiatus at every dated unconformity, the ICS stage of each dated
// surface, biozone ranges turned into dated datum tops, and the handoff
// to Basin & Charge Modeling (a model row built by the engine from the
// dated tops and the lithology log, written through Basin's own door).

import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Flame, Tags, FileText } from 'lucide-react';
import AgeDepthPlot from '@/components/wells/section/AgeDepthPlot';
import { ageDepthModel, validateAgeDepth, sortDated } from '@/lib/stratigraphy/ageDepth';
import { unitAt, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { buildBasinModelRow, verticalDepthOf, mergeBasinUpdate } from '@/lib/basinHandoff';
import ChartExportButtons from '@/components/wells/section/ChartExportButtons';
import { chartHeaderLines } from '@/components/wells/section/chartExport';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { fmtDepth, toDisp } from '@/pages/apps/WellDataManager/engine/displayUnits';
import { appPath } from '@/components/wells/appLinks';
import { decompactedRates, DECOMPACTION_LITHOLOGIES } from '@/lib/basinDecompaction';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

/**
 * @param {Object} p
 * @param {Object} p.well
 * @param {Array} p.tops
 * @param {Array} p.intervals
 * @param {Object} p.backend needs saveTop and createBasinModel (+ currentUserId)
 * @param {(msg: string) => void} p.onStatus
 * @param {() => Promise<void>} p.onTopsChanged
 * @param {Object} [p.appPaths]
 */
export default function AgesView({ well, tops, intervals, backend, onStatus, onTopsChanged, onAgesEntered = null, appPaths = {}, report = null, units = [], scheme = 'catuneanu', ageCharts = {}, unit = 'm', section = null }) {
  const [busy, setBusy] = useState(false);
  const plotRef = useRef(null);
  // STRAT-U1-015: accumulation rates are vertical; on a deviated well the dated
  // surfaces go through the survey to TVD (MD differences overstated every rate
  // below the kick-off). A well with no survey stays MD and says so.
  const vertical = useMemo(() => verticalDepthOf(well), [well]);
  const basis = vertical.basis === 'tvd' ? 'TVD' : 'MD';
  const surfaces = useMemo(() => (tops || []).map((t) => ({ name: t.name, md_m: Number.isFinite(t.md_m) ? vertical.tvd(t.md_m) : t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })), [tops, vertical]);
  const dated = useMemo(() => sortDated(surfaces), [surfaces]);
  const model = useMemo(() => ageDepthModel(dated), [dated]);
  const problems = useMemo(() => validateAgeDepth(dated), [dated]);
  // STRAT-U2-020 / BF-U2-016: decompacted rates on Basin's engine (src/lib/basinDecompaction.js)
  const [decompLith, setDecompLith] = useState('shale');
  const [seabedM, setSeabedM] = useState(0);
  const decomp = useMemo(() => (model ? decompactedRates(model.segments.map((s) => ({ ...s, top_m: s.top_md_m, base_m: s.base_md_m })), { lithology: decompLith, datumM: seabedM }) : null), [model, decompLith, seabedM]);
  const biozones = useMemo(() => (intervals || []).filter((r) => r.kind === 'biozone_interval'), [intervals]);
  const canEdit = !!well?.is_own;

  if (!well) return <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="strat-ages-empty">Pick a well on the left.</div>;

  const createDatums = async () => {
    setBusy(true);
    let n = 0;
    const entered = [];
    try {
      const existing = new Set((tops || []).map((t) => t.name));
      for (const z of biozones) {
        const scheme = z.properties?.scheme ? `${z.properties.scheme}: ` : '';
        const pairs = [[`${z.code} top`, z.top_md_m, z.properties?.age_top_ma], [`${z.code} base`, z.base_md_m, z.properties?.age_base_ma]];
        for (const [name, md, age] of pairs) {
          if (existing.has(name)) continue;
          const row = await backend.saveTop(well.id, { name, mdM: md, surface_type: 'biozone', age_ma: Number.isFinite(Number(age)) && age !== '' && age != null ? Number(age) : null, confidence: null, notes: `${scheme}${z.label || z.code}` });
          if (row?.id && row.age_ma != null) entered.push({ kind: 'tops', id: row.id, field: 'age_ma' }); // STRAT-U2-003 stamp
          n += 1;
        }
      }
      await onAgesEntered?.(entered);
      await onTopsChanged?.();
      onStatus(`${n} biozone datum${n === 1 ? '' : 's'} added as typed tops on ${well.name}.`);
    } catch (e) { onStatus(e.message); } finally { setBusy(false); }
  };

  // STRAT-U2-006: the one-page-per-topic summary a reviewer signs
  const exportSummary = async () => {
    setBusy(true);
    try {
      const { buildStratSummary } = await import('../services/stratSummaryPdf');
      const { doc, fileName } = await buildStratSummary({ well, tops, intervals, units, unit, scheme, report: report || {}, section, ageCharts });
      doc.save(fileName);
      onStatus(`Exported ${fileName}: header, typed tops, age-depth, Wheeler cells and the column, with a reviewer line.`);
    } catch (e) { onStatus(`The summary PDF was not made: ${e.message}`); } finally { setBusy(false); }
  };

  const sendToBasin = async () => {
    setBusy(true);
    try {
      const userId = backend.currentUserId ? await backend.currentUserId() : null;
      const { row, problems: notes, layerCount, datedCount, erosionCount } = buildBasinModelRow({ well, tops, intervals, userId, ageCharts });
      // STRAT-U2-018 (U1-032): the model this studio made for the well before is
      // updated in place (layers, erosion, location); what the modeller set in
      // Basin (name, heat flow, calibration, scenarios) is kept
      const existing = backend.listBasinModels
        ? (await backend.listBasinModels()).find((m) => m.settings?.registryWellId === well.id && m.settings?.fromStratigraphyStudio)
        : null;
      const counts = `${layerCount} layers, ${datedCount} dated, ${erosionCount} erosion event${erosionCount === 1 ? '' : 's'}`;
      if (existing && backend.updateBasinModel) {
        // BF-U1-005: the modeller's source rock, layer properties and typed erosion amounts survive the re-send
        const merged = mergeBasinUpdate(existing, row);
        await backend.updateBasinModel(existing.id, {
          stratigraphy: merged.stratigraphy, erosion_events: merged.erosion_events, location_coords: row.location_coords,
          settings: { ...(existing.settings || {}), registryWellName: row.settings.registryWellName, registryKbM: row.settings.registryKbM, fromStratigraphyStudio: row.settings.fromStratigraphyStudio, timescale: row.settings.timescale },
          thermal_history: null, updated_at: row.updated_at,
        });
        const k = merged.kept;
        const keptWords = [k.sources ? `${k.sources} source rock${k.sources === 1 ? '' : 's'}` : null, k.properties ? `layer properties on ${k.properties}` : null, k.erosion ? `${k.erosion} typed erosion amount${k.erosion === 1 ? '' : 's'}` : null].filter(Boolean);
        onStatus(`Basin model "${existing.name}" updated in place: ${counts}; its heat flow, calibration and scenarios${keptWords.length ? `, ${keptWords.join(', ')}` : ''} were kept, and its thermal history cleared until you run it again in Basin${notes.length ? `. ${notes[0]}` : '.'}`);
      } else {
        await backend.createBasinModel(row);
        onStatus(`Basin model "${row.name}" created: ${counts}${notes.length ? `. ${notes[0]}` : '.'}`);
      }
    } catch (e) { onStatus(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="p-3 space-y-3 text-xs" data-testid="strat-ages-view">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-pl-text font-medium">{well.name} in time</span>
        <span className="text-pl-muted">{dated.length} dated surface{dated.length === 1 ? '' : 's'} · timescale {TIMESCALE_VERSION}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btnCls} disabled={!canEdit || busy || !biozones.length} onClick={createDatums} data-testid="strat-biozone-datums" title="Create typed biozone tops at each biozone range's top and base with its ages">
            <Tags className="w-3.5 h-3.5" /> Biozone datums ({biozones.length})
          </button>
          <button type="button" className={btnCls} disabled={busy || !backend.createBasinModel} onClick={sendToBasin} data-testid="strat-send-basin" title="Create a Basin & Charge Modeling model with layers, ages and erosion events from this well">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />} Send to Basin
          </button>
          <button type="button" className={btnCls} disabled={busy} onClick={exportSummary} data-testid="strat-summary-pdf" title="A PDF of this well's stratigraphy for a reviewer: header, tops with ages and stages, age-depth plot and rates, Wheeler cells, the column">
            <FileText className="w-3.5 h-3.5" /> Summary PDF
          </button>
          <Link to={appPath('basinflow-genesis', appPaths)} className="text-pl-primary-text hover:text-pl-primary-text-hover px-1" data-testid="strat-open-basin">Open Basin</Link>
          <ChartExportButtons targetRef={plotRef} fileBase={`${well.name} age-depth`} onStatus={onStatus} testIdPrefix="strat-ages" disabled={dated.length < 2}
            headerLines={() => chartHeaderLines({ title: `Age-depth plot: ${well.name}`, wells: [well.name], timescale: TIMESCALE_VERSION, basis: vertical.basis === 'tvd' ? `TVD below KB through the survey (${unit}); rates vertical` : `MD (${unit}), the well has no survey`, field: report?.field, analyst: report?.analyst })} />
        </div>
      </div>
      {/* STRAT-U2-004: the plot and tables read in the display unit (the model runs in metres; the plot converts its own axis and rates) */}
      <div ref={plotRef}><AgeDepthPlot surfaces={surfaces} depthLabel={basis} depthUnit={unit} testIdPrefix="strat-agedepth" /></div>
      {vertical.basis === 'tvd' && <p className="text-pl-muted" data-testid="strat-ages-basis">Depths and rates are vertical (TVD below KB) through {well.name}&apos;s survey; the MD of each top is in the table below.</p>}
      {problems.length > 0 && <ul className="text-pl-danger-text" data-testid="strat-ages-problems">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
      {model && (
        <table className="text-xs" data-testid="strat-rates">
          <thead><tr>{['From', 'To', `${basis} (${unit})`, 'Ages (Ma)', `Decompacted (${unit}/Ma)`, `Rate (${unit}/Ma)`].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {model.segments.map((s, i) => (
              <tr key={i} data-testid={`strat-rate-${i}`}>
                <td className="pr-3 py-0.5 text-pl-text">{s.upper}</td>
                <td className="pr-3 py-0.5 text-pl-text">{s.lower}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{Number(fmtDepth(s.top_md_m, unit))} to {Number(fmtDepth(s.base_md_m, unit))}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{s.age_top_ma} to {s.age_base_ma}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text" data-testid={`strat-decomp-rate-${i}`}>{decomp?.rows[i]?.decompactedRate == null ? (s.rate_m_per_ma == null ? 'event' : EMPTY_VALUE) : toDisp(decomp.rows[i].decompactedRate, unit).toFixed(1)}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{s.rate_m_per_ma == null ? 'event' : toDisp(s.rate_m_per_ma, unit).toFixed(1)}</td>
              </tr>
            ))}
            {model.hiatuses.map((h, i) => (
              <tr key={`h${i}`} data-testid={`strat-hiatus-${i}`}>
                <td className="pr-3 py-0.5 text-pl-warning-text" colSpan={2}>hiatus at {h.name}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{Number(fmtDepth(h.md_m, unit))}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-warning-text">{h.from_ma} to {h.to_ma}</td>
                <td />
                <td className="pr-3 py-0.5 text-pl-muted">no deposition</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="text-xs" data-testid="strat-stages">
        <thead><tr>{['Surface', 'Type', `MD (${unit})`, 'Age (Ma)', 'ICS stage', 'Notes'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
        <tbody>
          {(tops || []).map((t) => {
            const u = Number.isFinite(t.age_ma) ? unitAt(t.age_ma) : null;
            return (
              <tr key={t.id} data-testid={`strat-stage-${t.name}`}>
                <td className="pr-3 py-0.5 text-pl-text">{t.name}</td>
                <td className="pr-3 py-0.5 text-pl-muted">{normalizeSurfaceType(t.surface_type)}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text" data-testid={`strat-stage-md-${t.name}`}>{fmtDepth(t.md_m, unit)}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{t.age_ma ?? EMPTY_VALUE}</td>
                <td className="pr-3 py-0.5 text-pl-text">{u ? u.name : (Number.isFinite(t.age_ma) ? 'outside the chart' : 'undated')}</td>
                <td className="pr-3 py-0.5 text-pl-muted">{t.notes || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {decomp && (
        <div className="flex flex-wrap items-center gap-2 text-pl-muted" data-testid="strat-decomp-basis">
          <span>{decomp.basis}</span>
          <label className="flex items-center gap-1">as
            <select value={decompLith} onChange={(e) => setDecompLith(e.target.value)} data-testid="strat-decomp-lith" className="bg-pl-surface border border-pl-border rounded px-1 text-pl-text">
              {DECOMPACTION_LITHOLOGIES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">sediment surface (seabed offshore) at
            <input type="number" min="0" step="any" value={seabedM} onChange={(e) => { const v = parseFloat(e.target.value); setSeabedM(Number.isFinite(v) && v >= 0 ? v : 0); }} data-testid="strat-decomp-datum" className="w-16 bg-pl-surface border border-pl-border rounded px-1 text-pl-text" /> m below KB
          </label>
        </div>
      )}
      <p className="text-pl-muted">Rates are constant between dated surfaces. A hiatus needs the unconformity's "Hiatus to" age in the Tops view. Biozone ranges come from the Intervals view (kind Biozone) with their scheme and ages; the datums button turns each range into two typed tops.</p>
    </div>
  );
}
