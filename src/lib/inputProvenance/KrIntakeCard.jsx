// The shared kr intake card (SCAL-U1, RL11): any app that takes relative
// permeability from SCAL Studio mounts it beside the values it took. It
// reads the source project again by id (readLatest) to say "source changed
// since", and compares the received values with the app's own to say
// "edited after intake". Nothing is changed by the card. The pattern of
// PvtIntakeCard.jsx.
import React, { useEffect, useMemo, useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { krIntakeCardModel } from './krIntakeCard.js';

const STATUS_CLASS = { 'As received': 'border-pl-success/40 bg-pl-success-bg text-pl-success-text' };

/**
 * @param {{intake: ?object, current?: object, fields: object[], readLatest?: function(string): Promise<object>,
 *   title?: string}} props
 */
export default function KrIntakeCard({ intake, current = {}, fields, readLatest = null, title = 'Relative permeability taken from SCAL Studio' }) {
  const [latest, setLatest] = useState(null);
  const recordId = intake?.from?.recordId || null;
  useEffect(() => {
    let alive = true;
    if (recordId && readLatest) readLatest(recordId).then((res) => { if (alive) setLatest(res); }).catch(() => {});
    return () => { alive = false; };
  }, [recordId, readLatest]);
  const m = useMemo(() => krIntakeCardModel({ intake, current, fields, latest }), [intake, current, fields, latest]);
  if (!m) return null;
  return (
    <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid="kr-intake-card" data-status={m.status}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold">{title}</span>
        <span className={`rounded-full border px-2 py-0.5 ${STATUS_CLASS[m.status] || 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`} data-testid="kr-intake-status">{m.status}</span>
      </div>
      <p data-testid="kr-intake-source">{m.source}{m.at ? `, ${m.at}` : ''}{m.build ? `, ${m.build}` : ''}</p>
      <p data-testid="kr-intake-origin">{m.setText}.{m.pedigree ? ` Sample: ${m.pedigree}.` : ''}</p>
      <table className="w-full" data-testid="kr-intake-rows">
        <thead><tr className="text-pl-muted"><th className="text-left">Value</th><th className="text-left">Received</th><th className="text-left">Now</th></tr></thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.key} className={r.edited ? 'text-pl-warning-text' : ''}>
              <td>{r.label}</td><td>{r.received ?? EMPTY_VALUE}</td><td>{r.current ?? EMPTY_VALUE}{r.edited ? ' (edited after intake)' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.changedSince && <p className="text-pl-warning-text" data-testid="kr-intake-changed">{m.changedSince.text}</p>}
      {m.unreadable && <p className="text-pl-muted">{m.unreadable}</p>}
    </div>
  );
}
