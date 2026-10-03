// The shared PVT intake card (FLUID-U2-005): any app that takes its PVT
// from Fluid Systems Studio mounts it beside the values it took. It reads
// the source project again by id (readLatest) to say "source changed
// since", and compares the received values with the app's own to say
// "edited after intake". Nothing is changed by the card: the block stays as
// it was sent until the user takes it again.
import React, { useEffect, useMemo, useState } from 'react';
import { pvtIntakeCardModel } from './pvtIntakeCard.js';

const STATUS_CLASS = {
  'As received': 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
};

/**
 * @param {{intake: ?object, current?: object, fields: object[], readLatest?: function(string): Promise<object>,
 *   onReread?: function(): void, title?: string}} props
 */
export default function PvtIntakeCard({ intake, current = {}, fields, readLatest = null, onReread = null, title = 'PVT taken from Fluid Systems Studio' }) {
  const [latest, setLatest] = useState(null);
  const recordId = intake?.from?.recordId || null;
  useEffect(() => {
    let alive = true;
    if (recordId && readLatest) readLatest(recordId).then((res) => { if (alive) setLatest(res); }).catch(() => {});
    return () => { alive = false; };
  }, [recordId, readLatest]);
  const m = useMemo(() => pvtIntakeCardModel({ intake, current, fields, latest }), [intake, current, fields, latest]);
  if (!m) return null;
  return (
    <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid="pvt-intake-card" data-status={m.status}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold">{title}</span>
        <span className={`rounded-full border px-2 py-0.5 ${STATUS_CLASS[m.status] || 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`} data-testid="pvt-intake-status">{m.status}</span>
      </div>
      <p data-testid="pvt-intake-source">{m.source}{m.at ? `, ${m.at}` : ''}{m.build ? `, ${m.build}` : ''}</p>
      <p>Fluid model: {m.model}. Bubble point: {m.bubblePoint}. Lab tuning: {m.tuning}.</p>
      <table className="w-full" data-testid="pvt-intake-rows">
        <thead><tr className="text-pl-muted"><th className="text-left">Value</th><th className="text-left">Received</th><th className="text-left">Now</th><th className="text-left">Method</th></tr></thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.key} className={r.edited ? 'text-pl-warning-text' : ''}>
              <td>{r.label}</td><td>{r.received ?? 'n/a'}</td><td>{r.current ?? 'n/a'}{r.edited ? ' (edited after intake)' : ''}</td><td>{r.method}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.rangeFlags.length > 0 && (
        <ul className="list-disc list-inside text-pl-warning-text" data-testid="pvt-intake-flags">{m.rangeFlags.map((f) => <li key={f}>{f}</li>)}</ul>
      )}
      {m.changedSince && (
        <p className="text-pl-warning-text" data-testid="pvt-intake-changed">
          {m.changedSince.text}
          {onReread && <button type="button" className="ml-2 underline" onClick={onReread}>Read it again</button>}
        </p>
      )}
      {m.unreadable && <p className="text-pl-muted">{m.unreadable}</p>}
    </div>
  );
}
