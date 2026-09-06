// The Live Well workspace (spec section 8). WS0 carries the bit depth
// record and the pump state; WS2 adds the event bar and the sample
// readouts, WS3 the lag readouts. Every entry goes through DepthEntry.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import { toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth } from '../services/units';

export default function LiveWellView({ backend, well, ctx, bitDepths, pumpEvents, defaults, offsetMin, unit, onChanged, onStatus }) {
  const latest = bitDepths[bitDepths.length - 1] || null;
  const [entry, setEntry] = useState({ value: NaN, unit: defaults.unit, reference: defaults.reference, datum: defaults.datum });
  const [spm, setSpm] = useState('');
  const [note, setNote] = useState('');

  const recordBit = async () => {
    try {
      const { warnings } = await backend.addRecord(well.id, { kind: 'observation', subtype: 'bit_depth', depth: { ...entry, kind: 'bit_depth' }, payload: { source: 'manual' } });
      onStatus?.(warnings.length ? warnings[0] : 'Bit depth recorded.');
      setEntry({ ...entry, value: NaN });
      onChanged?.();
    } catch (e) { onStatus?.(e.message); }
  };
  const recordPump = async () => {
    const v = Number(spm);
    if (!Number.isFinite(v) || v < 0) { onStatus?.('Pump rate must be zero or more strokes per minute.'); return; }
    try {
      await backend.addRecord(well.id, { kind: 'observation', subtype: 'pump_rate', payload: { spm: v, note: note || null, source: 'manual' } });
      onStatus?.(v === 0 ? 'Pumps off recorded.' : `Pump rate ${v} spm recorded.`);
      setSpm(''); setNote('');
      onChanged?.();
    } catch (e) { onStatus?.(e.message); }
  };
  const lastPump = pumpEvents[pumpEvents.length - 1] || null;
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;
  const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';

  return (
    <div className="p-4 space-y-5" data-testid="ws-live">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Bit depth" testId="ws-live-bit" value={latest ? fmtDepth(latest.md_calc_m, unit) : 'not recorded'} sub={latest ? `${local(latest.occurred_at)} rig time, entered ${latest.depth_value} ${latest.depth_unit} ${latest.depth_ref} ${latest.depth_datum}` : ''} />
        <Card label="TVD" testId="ws-live-tvd" value={latest && Number.isFinite(latest.tvd_calc_m) ? fmtDepth(latest.tvd_calc_m, unit) : ''} sub={latest ? `${latest.calc_method.replace(/_/g, ' ')}${latest.survey_version ? `, survey ${latest.survey_version}` : ''}` : ''} />
        <Card label="Pumps" testId="ws-live-spm" value={lastPump ? (lastPump.payload.spm > 0 ? `${lastPump.payload.spm} spm` : 'off') : 'unknown'} sub={lastPump ? `since ${local(lastPump.occurred_at)}${lastPump.payload.note ? `, ${lastPump.payload.note}` : ''}` : ''} />
        <Card label="Lagged sample depth" testId="ws-live-lagged" value="lag engine arrives in WS3" sub="" />
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-200">Record bit depth</h3>
        <DepthEntry value={entry} onChange={(e) => setEntry(e)} kind="bit_depth" ctx={ctx} testIdPrefix="ws-bit" />
        <Button size="sm" onClick={recordBit} disabled={!Number.isFinite(entry.value)} data-testid="ws-bit-save">Record bit depth</Button>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-200">Pump rate change</h3>
        <div className="flex items-center gap-2">
          <input className={`${inp} w-24`} type="number" placeholder="spm" value={spm} onChange={(e) => setSpm(e.target.value)} data-testid="ws-pump-spm" />
          <input className={`${inp} w-60`} placeholder="note (connection, survey, wiper trip)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="ws-pump-note" />
          <Button size="sm" onClick={recordPump} data-testid="ws-pump-save">Record</Button>
          <Button size="sm" variant="outline" onClick={() => { setSpm('0'); }} data-testid="ws-pump-off">Pumps off</Button>
        </div>
      </section>
      <section>
        <h3 className="text-xs font-semibold text-slate-200 mb-1">Recent bit depths</h3>
        <table className="text-xs text-slate-300">
          <tbody>
            {[...bitDepths].reverse().slice(0, 8).map((b) => (
              <tr key={b.id} data-testid={`ws-bit-row-${b.id}`}><td className="pr-3">{local(b.occurred_at)}</td><td className="pr-3">{fmtDepth(b.md_calc_m, unit)}</td><td className="text-slate-500">{b.depth_value} {b.depth_unit} {b.depth_ref} {b.depth_datum}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value, sub, testId }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-100" data-testid={testId}>{value}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
