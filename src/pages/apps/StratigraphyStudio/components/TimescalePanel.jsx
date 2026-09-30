// Timescale view (AppUpgrade STRAT-U2-003, 2026-09-30): the chart the studio
// draws on (ICS 2026/06), what moved since the chart the app shipped before,
// and every age of this project that reads differently now, with the update
// the user accepts for the whole project in one step. Nothing changes until
// Accept; each age then carries the current chart in the project payload.

import React, { useMemo, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { TIMESCALE_VERSION, TIMESCALE_CITATION, TIMESCALE_ERRATA, boundaryChanges } from '@/lib/stratigraphy/timescale';
import { LEGACY_CHART, flagText } from '@/lib/stratigraphy/ageCharts';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const fmtD = (d) => `${d > 0 ? '+' : ''}${d}`;

/**
 * @param {Object} p
 * @param {?Array} p.flags flagAges() for this project (null while loading)
 * @param {() => Promise<void>} p.onAccept writes the updates and stamps
 * @param {boolean} [p.busy]
 */
export default function TimescalePanel({ flags, onAccept, busy = false }) {
  const [showAll, setShowAll] = useState(false);
  const changes = useMemo(() => boundaryChanges(LEGACY_CHART, TIMESCALE_VERSION), []);
  const shown = showAll ? changes : changes.filter((c) => Math.abs(c.delta_ma) >= 0.1);
  const numeric = (flags || []).filter((f) => f.update);
  const editable = (flags || []).filter((f) => f.canEdit && !f.unreadable);

  return (
    <div className="p-3 space-y-3 text-xs" data-testid="strat-timescale">
      <div>
        <div className="text-pl-text font-medium">Chart: {TIMESCALE_VERSION}</div>
        <p className="text-pl-muted">{TIMESCALE_CITATION[TIMESCALE_VERSION]} Every lookup, stage fill and export uses it. Each age you type or fill is stamped with the chart it was entered under, in your stratigraphy project.</p>
      </div>

      <section data-testid="strat-timescale-flags">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-pl-text font-medium">Ages entered under an older chart</span>
          {flags == null ? <Loader2 className="w-3 h-3 animate-spin text-pl-muted" /> : <span className="text-pl-muted" data-testid="strat-timescale-count">{flags.length} age{flags.length === 1 ? '' : 's'}, {numeric.length} on a moved boundary</span>}
          <button type="button" className={`${btnCls} ml-auto ${editable.length ? 'border-pl-primary text-pl-primary-text' : ''}`} disabled={busy || !editable.length} onClick={onAccept} data-testid="strat-timescale-accept"
            title={`Move every age on a moved boundary to its ${TIMESCALE_VERSION} value and stamp every listed age with ${TIMESCALE_VERSION}; ages on shared wells stay for their owner`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept the {TIMESCALE_VERSION} updates for this project
          </button>
        </div>
        {flags && !flags.length && <p className="text-pl-muted" data-testid="strat-timescale-none">Every dated top and unit reads the same on {TIMESCALE_VERSION}.</p>}
        {flags && flags.length > 0 && (
          <table className="text-xs">
            <thead><tr>{['Age', 'Entered', 'Now', 'What changed'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
            <tbody>
              {flags.map((f) => (
                <tr key={`${f.kind}:${f.id}:${f.field}`} data-testid={`strat-timescale-flag-${f.where}`}>
                  <td className="pr-3 py-0.5 text-pl-text">{f.where}{f.canEdit ? '' : <span className="text-pl-muted"> (shared)</span>}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{f.value} Ma</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-warning-text">{f.update ? `${f.update.to_ma} Ma (${fmtD(f.update.delta_ma)})` : `${f.value} Ma`}</td>
                  <td className="pr-3 py-0.5 text-pl-muted">{flagText(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section data-testid="strat-timescale-changes">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-pl-text font-medium">Boundaries moved from {LEGACY_CHART} to {TIMESCALE_VERSION}</span>
          <label className="flex items-center gap-1 text-pl-muted ml-auto"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="strat-timescale-all" /> include moves under 0.1 Myr</label>
        </div>
        <table className="text-xs">
          <thead><tr>{['Boundary', LEGACY_CHART, TIMESCALE_VERSION, 'Change (Myr)'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.name} data-testid={`strat-timescale-change-${c.name}`}>
                <td className="pr-3 py-0.5 text-pl-text">{c.label}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{c.from_ma}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{c.to_ma}</td>
                <td className="pr-3 py-0.5 font-mono text-pl-text">{fmtD(c.delta_ma)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-pl-muted mt-1">{shown.length} of {changes.length} moved boundaries shown. The {LEGACY_CHART} column is the table this app shipped; it differs from the printed {LEGACY_CHART} chart at {TIMESCALE_ERRATA.map((e) => `${e.name} (${e.table_ma}; chart ${e.chart_ma})`).join(', ')}, so ages filled from it are recognised as entered.</p>
      </section>
    </div>
  );
}
