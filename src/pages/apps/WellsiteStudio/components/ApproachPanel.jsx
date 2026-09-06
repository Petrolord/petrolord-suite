// The top approach panel (spec section 24), dock resident: the next
// prognosed top ahead of the bit with its uncertainty window, the
// distance in MD and TVD, the offset wells, the current interpretation
// and call, and the recent evidence. Presented for a person to weigh.

import React from 'react';
import { fmtDepth } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';
import { observationLabel } from '../services/observations';

export default function ApproachPanel({ next, evidence = [], unit, offsetMin, onOpenTops }) {
  if (!next) return <div className="p-3 text-xs text-slate-500" data-testid="ws-approach-none">No prognosed top ahead of the bit.</div>;
  const p = next.panel;
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;
  return (
    <div className="p-3 space-y-2 text-xs" data-testid="ws-approach" data-formation={next.key} data-in-window={p.inWindow ? '1' : '0'}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">Approaching</div>
      <div className="text-sm text-slate-100">{next.name}</div>
      <div className="text-slate-300" data-testid="ws-approach-text">{p.text.replace(/(\d+\.\d{2})\d+/g, '$1')}</div>
      <table className="w-full"><tbody>
        <Row label="Prognosis" value={fmtDepth(p.prognosisMdM, unit)} testId="ws-approach-prognosis" />
        <Row label="Uncertainty" value={`${fmtDepth(p.window ? p.window.fromMdM : NaN, unit)} to ${fmtDepth(p.window ? p.window.toMdM : NaN, unit)}`} />
        <Row label="Bit" value={Number.isFinite(p.bitMdM) ? fmtDepth(p.bitMdM, unit) : 'n/a'} />
        <Row label="Distance MD" value={Number.isFinite(p.distanceMdM) ? fmtDepth(p.distanceMdM, unit) : 'n/a'} testId="ws-approach-distance" />
        <Row label="Distance TVD" value={Number.isFinite(p.distanceTvdM) ? fmtDepth(p.distanceTvdM, unit) : 'n/a'} testId="ws-approach-distance-tvd" />
        <Row label="Offsets (subsea)" value={p.offset && p.offset.n ? `${p.offset.n} wells, ${fmtDepth(p.offset.minTvdssM, unit)} to ${fmtDepth(p.offset.maxTvdssM, unit)}` : 'none'} testId="ws-approach-offsets" />
        <Row label="Interpretation" value={next.interpretation ? `${fmtDepth(next.interpretation.range_top_md_m, unit)} to ${fmtDepth(next.interpretation.range_base_md_m, unit)}, ${next.interpretation.confidence}` : 'none'} testId="ws-approach-interp" />
        <Row label="Call" value={next.call ? `${fmtDepth(next.call.md_calc_m, unit)} (${next.call.status})` : 'not called'} testId="ws-approach-call" />
      </tbody></table>
      {next.conflicts.length > 0 && <div className="text-amber-300" data-testid="ws-approach-conflict">Competing versions await an approver.</div>}
      <div className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">Recent evidence</div>
      <ul className="space-y-0.5 text-slate-400" data-testid="ws-approach-evidence">
        {evidence.slice(0, 6).map((r) => <li key={r.id}>{local(r.occurred_at)} {Number.isFinite(r.md_calc_m) ? fmtDepth(r.md_calc_m, unit) : ''} {r.subtype === 'cuttings_description' ? 'description' : observationLabel(r)}</li>)}
        {evidence.length === 0 && <li>No observations near the window yet.</li>}
      </ul>
      {onOpenTops && <button type="button" onClick={onOpenTops} data-testid="ws-approach-open" className="text-cyan-300 hover:underline">Open Tops</button>}
    </div>
  );
}

function Row({ label, value, testId }) {
  return <tr><td className="text-slate-500 pr-2">{label}</td><td className="text-slate-100" data-testid={testId}>{value}</td></tr>;
}
