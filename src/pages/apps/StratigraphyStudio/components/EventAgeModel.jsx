// Event-based age model (AppUpgrade STRAT-U2-010): the dated events of a
// well fitted by least squares, age on vertical depth, restarting below
// every unconformity (engines biostrat.eventAgeModel, gated on the NIST
// StRD Norris certified regression). The rate of each segment, the
// residual of every event and the events more than two residual standard
// deviations off the line (caving or reworking candidates) are shown;
// nothing is dropped. The model can date the well's undated tops: the
// preview lists every age it would write, and nothing is written until
// Apply.

import React, { useMemo, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { eventAgeModel, parseEventName } from '@/lib/stratigraphy/biostrat';
import { normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { verticalDepthOf } from '@/lib/basinHandoff';
import { fmtDepth, toDisp } from '@/pages/apps/WellDataManager/engine/displayUnits';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const r3 = (v) => Number(v.toFixed(3));

/** The model of a well from its tops: dated events (vertical), breaks at dated unconformities. */
export function wellEventModel(well, tops) {
  const v = verticalDepthOf(well);
  const pts = (tops || []).filter((t) => parseEventName(t.name)).map((t) => ({ name: t.name, id: t.id, md: Number(t.md_m), md_m: v.tvd(Number(t.md_m)), age_ma: t.age_ma }));
  const breaks = (tops || []).filter((t) => ['SU', 'unconformity'].includes(normalizeSurfaceType(t.surface_type))).map((t) => v.tvd(Number(t.md_m)));
  return { model: eventAgeModel(pts, { breaks }), basis: v.basis, tvd: v.tvd, breaks };
}

export default function EventAgeModel({ well, tops, backend, onStatus, onTopsChanged, onAgesEntered = null, unit = 'm' }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const { model, basis, tvd, breaks } = useMemo(() => wellEventModel(well, tops), [well, tops]);
  const canEdit = !!well?.is_own;
  const basisText = basis === 'tvd' ? 'TVD' : 'MD';
  // what the model would write: undated tops that are not events, inside a fitted segment
  const plan = useMemo(() => (tops || []).filter((t) => !parseEventName(t.name) && !Number.isFinite(t.age_ma)).map((t) => {
    const d = tvd(Number(t.md_m));
    const age = model.ageAt(d);
    // beyond the events of its segment the line is extrapolated, and says so
    const seg = model.segments.findIndex((g) => d > g.from_md_m && d <= g.to_md_m);
    const ds = model.points.filter((p) => p.segment === seg).map((p) => p.md_m);
    const extrapolated = seg >= 0 && ds.length > 0 && (d < Math.min(...ds) || d > Math.max(...ds));
    return { top: t, age: Number.isFinite(age) && age >= 0 ? r3(age) : null, extrapolated };
  }), [tops, model, tvd]);
  const writable = plan.filter((p) => p.age != null);

  const apply = async () => {
    setBusy(true);
    try {
      const entered = [];
      for (const p of writable) {
        await backend.updateTop(p.top.id, { age_ma: p.age, notes: `${p.top.notes ? `${p.top.notes}; ` : ''}age from the event age model (${model.points.length} events)` });
        entered.push({ kind: 'tops', id: p.top.id, field: 'age_ma' });
      }
      await onAgesEntered?.(entered);
      await onTopsChanged?.();
      setPreview(false);
      const out = plan.length - writable.length;
      onStatus(`Dated ${writable.length} top${writable.length === 1 ? '' : 's'} from the event age model${out ? `; ${out} outside every fitted segment left undated` : ''}.`);
    } catch (e) { onStatus(e.message); } finally { setBusy(false); }
  };

  // a small plot: events and the fitted lines, depth down
  const plot = useMemo(() => {
    if (!model.points.length) return null;
    const W = 420; const H = 260; const L = 56; const T = 14; const B = 28; const R = 12;
    const ds = model.points.map((p) => p.md_m); const as = model.points.map((p) => p.age_ma);
    const dMin = Math.min(...ds); const dMax = Math.max(...ds); const aMax = Math.max(...as, ...model.points.map((p) => p.model_ma)); const aMin = Math.min(0, ...as);
    const x = (a) => L + ((a - aMin) / Math.max(1e-9, aMax - aMin)) * (W - L - R);
    const y = (d) => T + ((d - dMin) / Math.max(1e-9, dMax - dMin)) * (H - T - B);
    return { W, H, L, T, B, x, y, dMin, dMax, aMin, aMax };
  }, [model]);

  return (
    <section className="space-y-2" data-testid="strat-agemodel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-pl-text font-medium">Age model from the events</span>
        <span className="text-pl-muted">least squares, age on {basisText}{breaks.length ? `, restarting below ${breaks.length} unconformit${breaks.length === 1 ? 'y' : 'ies'}` : ''}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btnCls} disabled={!canEdit || !model.segments.length || !plan.length} onClick={() => setPreview((v) => !v)} data-testid="strat-agemodel-preview"
            title="List the age the model gives each undated top of the well; nothing is written until Apply">Date undated tops ({writable.length})</button>
        </div>
      </div>
      {!model.segments.length ? (
        <p className="text-pl-muted" data-testid="strat-agemodel-none">Two dated events at different depths are needed for a line{model.skipped.length ? ` (${model.skipped.map((s) => `${s.name}: ${s.reason}`).join('; ')})` : ''}.</p>
      ) : (
        <>
          <table className="text-xs" data-testid="strat-agemodel-segments">
            <thead><tr>{['Segment', `${basisText} (${unit})`, 'Events', `Rate (${unit}/Ma)`, 'R²', 'Residual SD (Myr)'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
            <tbody>
              {model.segments.map((g, i) => (
                <tr key={i} data-testid={`strat-agemodel-seg-${i}`}>
                  <td className="pr-3 py-0.5 text-pl-text">{i + 1}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{Number.isFinite(g.from_md_m) ? fmtDepth(g.from_md_m, unit) : 'top'} to {Number.isFinite(g.to_md_m) ? fmtDepth(g.to_md_m, unit) : 'TD'}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{g.n}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{g.inverted ? 'ages fall with depth: check the events' : toDisp(g.rate_m_per_ma, unit).toFixed(1)}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{g.n > 2 ? g.r2.toFixed(4) : 'exact (2 events)'}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{g.n > 2 ? g.sd.toFixed(3) : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="text-xs" data-testid="strat-agemodel-events">
            <thead><tr>{['Event', `${basisText} (${unit})`, 'Age (Ma)', 'Model (Ma)', 'Residual (Myr)', ''].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
            <tbody>
              {model.points.map((p) => (
                <tr key={p.name} data-testid={`strat-agemodel-event-${p.name}`} data-flagged={p.flagged ? '1' : '0'}>
                  <td className="pr-3 py-0.5 text-pl-text">{p.name}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{fmtDepth(p.md_m, unit)}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{p.age_ma}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{p.model_ma.toFixed(3)}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{p.residual_ma >= 0 ? '+' : ''}{p.residual_ma.toFixed(3)}</td>
                  <td className="pr-3 py-0.5 text-pl-warning-text">{p.flagged ? 'more than 2 SD off the line: caved or reworked?' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model.skipped.length > 0 && <p className="text-pl-muted" data-testid="strat-agemodel-skipped">Not in the fit: {model.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.</p>}
          {plot && (
            <div className="relative inline-block rounded border border-slate-200 bg-white pb-9" data-canvas="chart" data-testid="strat-agemodel-plot">
              <svg width={plot.W} height={plot.H} xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
                <rect x="0" y="0" width={plot.W} height={plot.H} fill={CHART_COLORS.background} />
                <rect x={plot.L} y={plot.T} width={plot.W - plot.L - 12} height={plot.H - plot.T - plot.B} fill="none" stroke={CHART_COLORS.axisLine} />
                <text x={plot.L} y={plot.H - 6} fontSize="9" fill={CHART_COLORS.axisText}>{Number(plot.aMin.toFixed(2))} Ma</text>
                <text x={plot.W - 12} y={plot.H - 6} fontSize="9" fill={CHART_COLORS.axisText} textAnchor="end">{Number(plot.aMax.toFixed(2))} Ma</text>
                <text x={plot.L - 4} y={plot.T + 8} fontSize="9" fill={CHART_COLORS.axisText} textAnchor="end">{fmtDepth(plot.dMin, unit, 0)}</text>
                <text x={plot.L - 4} y={plot.H - plot.B} fontSize="9" fill={CHART_COLORS.axisText} textAnchor="end">{fmtDepth(plot.dMax, unit, 0)}</text>
                {model.segments.map((g, i) => {
                  const pts = model.points.filter((p) => p.segment === i);
                  const d0 = Math.min(...pts.map((p) => p.md_m)); const d1 = Math.max(...pts.map((p) => p.md_m));
                  return <line key={i} x1={plot.x(g.a + g.b * d0)} y1={plot.y(d0)} x2={plot.x(g.a + g.b * d1)} y2={plot.y(d1)} stroke="#2563eb" strokeWidth="2" />;
                })}
                {model.points.map((p) => <circle key={p.name} cx={plot.x(p.age_ma)} cy={plot.y(p.md_m)} r="3.5" fill={p.flagged ? '#b45309' : '#0f172a'}><title>{`${p.name}: ${p.age_ma} Ma`}</title></circle>)}
              </svg>
              <ChartLogo style={{ height: '24px' }} />
            </div>
          )}
        </>
      )}
      {preview && (
        <div className="p-2 rounded border border-pl-border space-y-1" data-testid="strat-agemodel-plan">
          <p className="text-pl-text">The model would write these ages (nothing is written until Apply):</p>
          <ul>{plan.map((p) => <li key={p.top.id} data-testid={`strat-agemodel-plan-${p.top.name}`}>{p.top.name} at {fmtDepth(p.top.md_m, unit)} {unit} MD: {p.age == null ? 'outside every fitted segment, left undated' : `${p.age} Ma${p.extrapolated ? ' (extrapolated beyond the events of its segment)' : ''}`}</li>)}</ul>
          <button type="button" className={`${btnCls} border-pl-primary text-pl-primary-text`} disabled={busy || !writable.length} onClick={apply} data-testid="strat-agemodel-apply">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Apply {writable.length} age{writable.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </section>
  );
}
