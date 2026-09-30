// Ages view (Stratigraphy Studio ST3): the selected well in time. The
// age-depth plot with the accumulation rate of each segment and the
// hiatus at every dated unconformity, the ICS stage of each dated
// surface, biozone ranges turned into dated datum tops, and the handoff
// to Basin & Charge Modeling (a model row built by the engine from the
// dated tops and the lithology log, written through Basin's own door).

import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Flame, Tags } from 'lucide-react';
import AgeDepthPlot from '@/components/wells/section/AgeDepthPlot';
import { ageDepthModel, validateAgeDepth, sortDated } from '@/lib/stratigraphy/ageDepth';
import { unitAt, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { buildBasinModelRow, verticalDepthOf } from '@/lib/basinHandoff';
import ChartExportButtons from '@/components/wells/section/ChartExportButtons';
import { chartHeaderLines } from '@/components/wells/section/chartExport';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { appPath } from '@/components/wells/appLinks';

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
export default function AgesView({ well, tops, intervals, backend, onStatus, onTopsChanged, onAgesEntered = null, appPaths = {}, report = null }) {
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

  const sendToBasin = async () => {
    setBusy(true);
    try {
      const userId = backend.currentUserId ? await backend.currentUserId() : null;
      const { row, problems: notes, layerCount, datedCount, erosionCount } = buildBasinModelRow({ well, tops, intervals, userId });
      await backend.createBasinModel(row);
      onStatus(`Basin model "${row.name}" created: ${layerCount} layers, ${datedCount} dated, ${erosionCount} erosion event${erosionCount === 1 ? '' : 's'}${notes.length ? `. ${notes[0]}` : '.'}`);
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
          <Link to={appPath('basinflow-genesis', appPaths)} className="text-pl-primary-text hover:text-pl-primary-text-hover px-1" data-testid="strat-open-basin">Open Basin</Link>
          <ChartExportButtons targetRef={plotRef} fileBase={`${well.name} age-depth`} onStatus={onStatus} testIdPrefix="strat-ages" disabled={dated.length < 2}
            headerLines={() => chartHeaderLines({ title: `Age-depth plot: ${well.name}`, wells: [well.name], timescale: TIMESCALE_VERSION, basis: vertical.basis === 'tvd' ? 'TVD below KB through the survey (m); rates vertical' : 'MD (m), the well has no survey', field: report?.field, analyst: report?.analyst })} />
        </div>
      </div>
      <div ref={plotRef}><AgeDepthPlot surfaces={surfaces} depthLabel={basis} testIdPrefix="strat-agedepth" /></div>
      {vertical.basis === 'tvd' && <p className="text-pl-muted" data-testid="strat-ages-basis">Depths and rates are vertical (TVD below KB) through {well.name}&apos;s survey; the MD of each top is in the table below.</p>}
      {problems.length > 0 && <ul className="text-pl-danger-text" data-testid="strat-ages-problems">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
      {model && (
        <table className="text-xs" data-testid="strat-rates">
          <thead><tr>{['From', 'To', `${basis} (m)`, 'Ages (Ma)', 'Rate (m/Ma)'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {model.segments.map((s, i) => (
              <tr key={i} data-testid={`strat-rate-${i}`}>
                <td className="pr-3 py-0.5 text-pl-text">{s.upper}</td>
                <td className="pr-3 py-0.5 text-pl-text">{s.lower}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{Number(s.top_md_m.toFixed(1))} to {Number(s.base_md_m.toFixed(1))}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{s.age_top_ma} to {s.age_base_ma}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{s.rate_m_per_ma == null ? 'event' : s.rate_m_per_ma.toFixed(1)}</td>
              </tr>
            ))}
            {model.hiatuses.map((h, i) => (
              <tr key={`h${i}`} data-testid={`strat-hiatus-${i}`}>
                <td className="pr-3 py-0.5 text-pl-warning-text" colSpan={2}>hiatus at {h.name}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{Number(h.md_m.toFixed(1))}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-warning-text">{h.from_ma} to {h.to_ma}</td>
                <td className="pr-3 py-0.5 text-pl-muted">no deposition</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="text-xs" data-testid="strat-stages">
        <thead><tr>{['Surface', 'Type', 'MD (m)', 'Age (Ma)', 'ICS stage', 'Notes'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
        <tbody>
          {(tops || []).map((t) => {
            const u = Number.isFinite(t.age_ma) ? unitAt(t.age_ma) : null;
            return (
              <tr key={t.id} data-testid={`strat-stage-${t.name}`}>
                <td className="pr-3 py-0.5 text-pl-text">{t.name}</td>
                <td className="pr-3 py-0.5 text-pl-muted">{normalizeSurfaceType(t.surface_type)}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{t.md_m}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{t.age_ma ?? EMPTY_VALUE}</td>
                <td className="pr-3 py-0.5 text-pl-text">{u ? u.name : (Number.isFinite(t.age_ma) ? 'outside the chart' : 'undated')}</td>
                <td className="pr-3 py-0.5 text-pl-muted">{t.notes || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-pl-muted">Rates are constant between dated surfaces. A hiatus needs the unconformity's "Hiatus to" age in the Tops view. Biozone ranges come from the Intervals view (kind Biozone) with their scheme and ages; the datums button turns each range into two typed tops.</p>
    </div>
  );
}
