// The sample scheduler (spec sections 13 and 16): the authorised
// programme, the schedule ahead of the bit, predicted arrivals, catch
// confirmation and the stage chain, samples in transit, and samples
// past their predicted arrival highlighted for review (overdue, never
// missed: the app cannot know).

import React, { useMemo, useState } from 'react';
import RowGridEditor from '@/components/wells/RowGridEditor';
import { Button } from '@/components/ui/button';
import { validateProgramme, SAMPLE_STAGES } from '../services/samples';
import { fmtDepth, depthToDisplay, depthFromDisplay } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';

const STAGE_LABEL = { caught: 'Catch', washed: 'Washed', dried: 'Dried', described: 'Described', photographed: 'Photographed', bagged: 'Bagged' };
const STATE_LABEL = { scheduled: 'scheduled', in_transit: 'in transit', due: 'due at surface', overdue: 'overdue for review', caught: 'caught' };

export default function SamplesView({ board, programme, onProgrammeSave, onStage, onDescribe, onSchedule, unit, offsetMin, nowMs, onStatus }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [reason, setReason] = useState('');
  const local = (ms) => (ms ? toRigLocal(ms, offsetMin).hhmm : '');
  const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';

  const startEdit = () => {
    setRows((programme ? programme.rows : [{ fromMdM: 0, toMdM: null, intervalM: depthFromDisplay(10, unit) }]).map((r) => ({
      from: String(Math.round(depthToDisplay(r.fromMdM, unit))), to: r.toMdM == null ? '' : String(Math.round(depthToDisplay(r.toMdM, unit))), interval: String(depthToDisplay(r.intervalM, unit)),
    })));
    setEditing(true);
  };
  const save = async () => {
    const engineRows = rows.map((r) => ({ fromMdM: depthFromDisplay(Number(r.from), unit), toMdM: r.to === '' ? null : depthFromDisplay(Number(r.to), unit), intervalM: depthFromDisplay(Number(r.interval), unit) }));
    const errors = validateProgramme({ rows: engineRows });
    if (errors.length) { onStatus?.(errors[0]); return; }
    try {
      await onProgrammeSave(engineRows, { authorisedBy, reason });
      setEditing(false); setAuthorisedBy(''); setReason('');
    } catch (e) { onStatus?.(e.message); }
  };
  const counts = useMemo(() => ({ inTransit: board.inTransit.length, overdue: board.overdue.length, caught: board.rows.filter((r) => r.status !== 'scheduled').length }), [board]);

  return (
    <div className="p-4 space-y-4" data-testid="ws-samples">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-100">Samples</h2>
        <span className="text-[11px] text-slate-400" data-testid="ws-samples-summary">{board.rows.length} scheduled, {counts.inTransit} in transit, {counts.overdue} overdue for review, {counts.caught} caught</span>
        <Button size="sm" variant="outline" onClick={onSchedule} data-testid="ws-samples-schedule" disabled={!programme}>Schedule ahead of the bit</Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-200">Sampling programme</h3>
          <span className="text-[11px] text-slate-500" data-testid="ws-programme-version">{programme ? `version ${programme.version}, authorised by ${programme.authorisedBy}` : 'none yet'}</span>
          {!editing && <Button size="sm" variant="ghost" onClick={startEdit} data-testid="ws-programme-edit">{programme ? 'Change' : 'Set programme'}</Button>}
        </div>
        {!editing && programme && (
          <table className="text-xs text-slate-300"><tbody>
            {programme.rows.map((r, i) => <tr key={i}><td className="pr-3">{fmtDepth(r.fromMdM, unit)} to {r.toMdM == null ? 'TD' : fmtDepth(r.toMdM, unit)}</td><td>every {fmtDepth(r.intervalM, unit)}</td></tr>)}
          </tbody></table>
        )}
        {editing && (
          <div className="space-y-2" data-testid="ws-programme-editor">
            <RowGridEditor testIdPrefix="ws-programme" rows={rows} onChange={setRows} columns={[
              { key: 'from', label: `From (${unit})`, type: 'number', width: 90 }, { key: 'to', label: `To (${unit}, empty for TD)`, type: 'number', width: 120 }, { key: 'interval', label: `Every (${unit})`, type: 'number', width: 90 },
            ]} />
            <div className="flex items-center gap-2 flex-wrap">
              <input className={`${inp} w-48`} placeholder="authorised by" value={authorisedBy} onChange={(e) => setAuthorisedBy(e.target.value)} data-testid="ws-programme-authoriser" />
              <input className={`${inp} w-64`} placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="ws-programme-reason" />
              <Button size="sm" onClick={save} data-testid="ws-programme-save">Record programme</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

      <section>
        <table className="text-xs text-slate-300 w-full">
          <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left pr-3">No</th><th className="text-left pr-3">Depth</th><th className="text-left pr-3">Cut</th><th className="text-left pr-3">Arrival</th><th className="text-left pr-3">State</th><th className="text-left pr-3">Stages</th><th className="text-left">Next</th></tr></thead>
          <tbody>
            {board.rows.map((r) => (
              <tr key={r.sample.id} data-testid={`ws-sample-row-${r.sample.sample_no}`} data-state={r.state}
                className={r.state === 'overdue' ? 'bg-amber-500/10 text-amber-200' : r.state === 'due' ? 'bg-cyan-500/10' : ''}>
                <td className="pr-3">{r.sample.sample_no}</td>
                <td className="pr-3 whitespace-nowrap">{fmtDepth(r.sample.md_calc_m, unit)}</td>
                <td className="pr-3 whitespace-nowrap">{r.arrival && r.arrival.cutUtcMs ? local(r.arrival.cutUtcMs) : ''}</td>
                <td className="pr-3 whitespace-nowrap" data-testid={`ws-sample-arrival-${r.sample.sample_no}`}>{r.arrival && r.arrival.arrivalUtcMs ? local(r.arrival.arrivalUtcMs) : (r.arrival && r.arrival.note ? r.arrival.note : '')}</td>
                <td className="pr-3 whitespace-nowrap" data-testid={`ws-sample-state-${r.sample.sample_no}`}>{STATE_LABEL[r.state] || r.state}{r.state === 'overdue' ? ` (${Math.round(r.minutesPastArrival)} min past arrival)` : ''}</td>
                <td className="pr-3 whitespace-nowrap text-slate-500">{r.stages.map((s) => s.stage).filter((s) => SAMPLE_STAGES.includes(s)).join(', ')}</td>
                <td className="whitespace-nowrap">
                  {r.nextStages.slice(0, 3).map((st) => (
                    <button key={st} type="button" data-testid={`ws-sample-${st}-${r.sample.sample_no}`} onClick={() => onStage(r.sample, st)}
                      className="mr-1 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">{STAGE_LABEL[st] || st}</button>
                  ))}
                  {r.status !== 'scheduled' && onDescribe && (
                    <button type="button" data-testid={`ws-sample-describe-${r.sample.sample_no}`} onClick={() => onDescribe(r.sample)} className="px-1.5 py-0.5 rounded border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10">Describe</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {board.rows.length === 0 && <div className="text-xs text-slate-500" data-testid="ws-samples-empty">No samples scheduled. Set the programme, then schedule ahead of the bit.</div>}
      </section>
    </div>
  );
}
