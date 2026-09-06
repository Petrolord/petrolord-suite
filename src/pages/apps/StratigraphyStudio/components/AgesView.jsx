// Ages view (Stratigraphy Studio ST3): the selected well in time. The
// age-depth plot with the accumulation rate of each segment and the
// hiatus at every dated unconformity, the ICS stage of each dated
// surface, biozone ranges turned into dated datum tops, and the handoff
// to Basin & Charge Modeling (a model row built by the engine from the
// dated tops and the lithology log, written through Basin's own door).

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Flame, Tags } from 'lucide-react';
import AgeDepthPlot from '@/components/wells/section/AgeDepthPlot';
import { ageDepthModel, validateAgeDepth, sortDated } from '@/lib/stratigraphy/ageDepth';
import { unitAt, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { buildBasinModelRow } from '@/lib/basinHandoff';
import { appPath } from '@/components/wells/appLinks';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

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
export default function AgesView({ well, tops, intervals, backend, onStatus, onTopsChanged, appPaths = {} }) {
  const [busy, setBusy] = useState(false);
  const surfaces = useMemo(() => (tops || []).map((t) => ({ name: t.name, md_m: t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })), [tops]);
  const dated = useMemo(() => sortDated(surfaces), [surfaces]);
  const model = useMemo(() => ageDepthModel(dated), [dated]);
  const problems = useMemo(() => validateAgeDepth(dated), [dated]);
  const biozones = useMemo(() => (intervals || []).filter((r) => r.kind === 'biozone_interval'), [intervals]);
  const canEdit = !!well?.is_own;

  if (!well) return <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="strat-ages-empty">Pick a well on the left.</div>;

  const createDatums = async () => {
    setBusy(true);
    let n = 0;
    try {
      const existing = new Set((tops || []).map((t) => t.name));
      for (const z of biozones) {
        const scheme = z.properties?.scheme ? `${z.properties.scheme}: ` : '';
        const pairs = [[`${z.code} top`, z.top_md_m, z.properties?.age_top_ma], [`${z.code} base`, z.base_md_m, z.properties?.age_base_ma]];
        for (const [name, md, age] of pairs) {
          if (existing.has(name)) continue;
          await backend.saveTop(well.id, { name, mdM: md, surface_type: 'biozone', age_ma: Number.isFinite(Number(age)) && age !== '' && age != null ? Number(age) : null, confidence: null, notes: `${scheme}${z.label || z.code}` });
          n += 1;
        }
      }
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
        <span className="text-slate-300 font-medium">{well.name} in time</span>
        <span className="text-slate-500">{dated.length} dated surface{dated.length === 1 ? '' : 's'} · timescale {TIMESCALE_VERSION}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btnCls} disabled={!canEdit || busy || !biozones.length} onClick={createDatums} data-testid="strat-biozone-datums" title="Create typed biozone tops at each biozone range's top and base with its ages">
            <Tags className="w-3.5 h-3.5" /> Biozone datums ({biozones.length})
          </button>
          <button type="button" className={btnCls} disabled={busy || !backend.createBasinModel} onClick={sendToBasin} data-testid="strat-send-basin" title="Create a Basin & Charge Modeling model with layers, ages and erosion events from this well">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />} Send to Basin
          </button>
          <Link to={appPath('basinflow-genesis', appPaths)} className="text-cyan-300 hover:text-amber-300 px-1" data-testid="strat-open-basin">Open Basin</Link>
        </div>
      </div>
      <AgeDepthPlot surfaces={surfaces} testIdPrefix="strat-agedepth" />
      {problems.length > 0 && <ul className="text-red-300" data-testid="strat-ages-problems">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
      {model && (
        <table className="text-xs" data-testid="strat-rates">
          <thead><tr>{['From', 'To', 'Depth (m)', 'Ages (Ma)', 'Rate (m/Ma)'].map((h) => <th key={h} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {model.segments.map((s, i) => (
              <tr key={i} data-testid={`strat-rate-${i}`}>
                <td className="pr-3 py-0.5 text-slate-100">{s.upper}</td>
                <td className="pr-3 py-0.5 text-slate-100">{s.lower}</td>
                <td className="pr-3 py-0.5 font-mono text-slate-300">{s.top_md_m} to {s.base_md_m}</td>
                <td className="pr-3 py-0.5 font-mono text-slate-300">{s.age_top_ma} to {s.age_base_ma}</td>
                <td className="pr-3 py-0.5 font-mono text-cyan-200">{s.rate_m_per_ma == null ? 'event' : s.rate_m_per_ma.toFixed(1)}</td>
              </tr>
            ))}
            {model.hiatuses.map((h, i) => (
              <tr key={`h${i}`} data-testid={`strat-hiatus-${i}`}>
                <td className="pr-3 py-0.5 text-amber-300" colSpan={2}>hiatus at {h.name}</td>
                <td className="pr-3 py-0.5 font-mono text-slate-300">{h.md_m}</td>
                <td className="pr-3 py-0.5 font-mono text-amber-200">{h.from_ma} to {h.to_ma}</td>
                <td className="pr-3 py-0.5 text-slate-500">no deposition</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="text-xs" data-testid="strat-stages">
        <thead><tr>{['Surface', 'Type', 'MD (m)', 'Age (Ma)', 'ICS stage', 'Notes'].map((h) => <th key={h} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>)}</tr></thead>
        <tbody>
          {(tops || []).map((t) => {
            const u = Number.isFinite(t.age_ma) ? unitAt(t.age_ma) : null;
            return (
              <tr key={t.id} data-testid={`strat-stage-${t.name}`}>
                <td className="pr-3 py-0.5 text-slate-100">{t.name}</td>
                <td className="pr-3 py-0.5 text-slate-400">{normalizeSurfaceType(t.surface_type)}</td>
                <td className="pr-3 py-0.5 font-mono text-slate-300">{t.md_m}</td>
                <td className="pr-3 py-0.5 font-mono text-slate-300">{t.age_ma ?? ''}</td>
                <td className="pr-3 py-0.5 text-slate-300">{u ? u.name : (Number.isFinite(t.age_ma) ? 'outside the chart' : 'undated')}</td>
                <td className="pr-3 py-0.5 text-slate-500">{t.notes || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-slate-500">Rates are constant between dated surfaces. A hiatus needs the unconformity's "Hiatus to" age in the Tops view. Biozone ranges come from the Intervals view (kind Biozone) with their scheme and ages; the datums button turns each range into two typed tops.</p>
    </div>
  );
}
