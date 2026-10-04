// A starting model from a Waterflood Design Studio pattern (SIM-U2-007):
// the pattern read by id (wf-forecast-1 with the saved project), and the
// kr-1 and pvt-1 projects it holds taken by id as the builder's own cards
// take them. `?wfProject=<id>` (the send from Waterflood Design Studio)
// preselects it. What the pattern does not hold is listed.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { listWfForecasts, WF_BUILDERS } from '@/utils/waterflooddesign/wfForecastService';
import { buildWfForecastContract, WF_TABLE } from '@/utils/waterflooddesign/wfForecastContract';
import { readScalProjectKr } from '@/lib/krSource';
import { readFluidProjectPvt } from '@/lib/pvtSource';
import { readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import { formFromWf } from '@/utils/simstudio/wfDeckIntake';

const selectCls = 'h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text';
export const WF_PROJECT_PARAM = 'wfProject';

/** The pattern's contract and saved payload, by id. */
async function readWfPattern(projectId) {
  const { data, error } = await supabase.from(WF_TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) return { ok: false, reason: `The Waterflood Design Studio project could not be read: ${error.message}` };
  const row = data?.[0];
  if (!row) return { ok: false, reason: 'The Waterflood Design Studio project is not there (deleted, or not shared with you).' };
  const got = buildWfForecastContract({ projectId: row.id, projectName: row.project_name ?? row.inputs_data?.name ?? null, projectSavedAt: row.updated_at, payload: row.inputs_data }, WF_BUILDERS);
  return got.ok ? { ok: true, contract: got.contract, payload: row.inputs_data } : { ok: false, reason: got.reason };
}

export default function WfStartCard({ form, setForm, canWrite, addNotification }) {
  const [params] = useSearchParams();
  const named = params.get(WF_PROJECT_PARAM);
  const [list, setList] = useState(null);
  const [projectId, setProjectId] = useState(named || form.origin?.recordId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    listWfForecasts(supabase).then((rows) => { if (alive) setList(rows); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);

  const take = async () => {
    setBusy(true); setMessage('');
    try {
      const wf = await readWfPattern(projectId);
      if (!wf.ok) { setMessage(wf.reason); return; }
      const k = wf.contract.sources?.kr;
      const v = wf.contract.sources?.pvt;
      let krBlock = null;
      let pvtBlock = null;
      if (k?.recordId) {
        const r = await readScalProjectKr(k.recordId);
        if (!r.ok) { setMessage(`The pattern's SCAL Studio project: ${r.reason}`); return; }
        krBlock = { ...r.contract, project_id: r.contract.project_id ?? k.recordId, project_name: r.contract.project_name ?? r.projectName };
      }
      if (v?.recordId) {
        const r = await readFluidProjectBlock(readFluidProjectPvt, v.recordId);
        if (!r.ok) { setMessage(`The pattern's Fluid Systems Studio project: ${r.reason}`); return; }
        pvtBlock = r.block;
      }
      const res = formFromWf({ contract: wf.contract, payload: wf.payload, krBlock, pvtBlock }, form);
      if (!res.ok) { setMessage(res.reason); return; }
      setForm(res.form);
      addNotification(`Starting model taken from "${wf.contract.projectName}": the quarter five-spot element${krBlock ? ', kr-1 from SCAL Studio' : ''}${pvtBlock ? ', pvt-1 from Fluid Systems Studio' : ''}. Check what the pattern does not hold, listed on the card.`, 'success');
    } finally {
      setBusy(false);
    }
  };

  const o = form.origin?.app === 'Waterflood Design Studio' ? form.origin : null;
  return (
    <div className="space-y-2" data-testid="sim-wf-start">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[240px] flex-1">
          <Label htmlFor="sim-wf-project" className="text-[11px] text-pl-muted">Start from a Waterflood Design Studio pattern (five-spot)</Label>
          <select id="sim-wf-project" data-testid="sim-wf-project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setMessage(''); }} className={selectCls}>
            <option value="">{list == null ? 'Loading the projects' : (list.length ? 'Choose a project' : 'No saved Waterflood project')}</option>
            {projectId && named && !(list || []).some((p) => p.projectId === projectId) && <option value={projectId}>Project named in the address</option>}
            {(list || []).map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}{p.ok ? '' : ' (cannot be sent)'}</option>)}
          </select>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={!canWrite || !projectId || busy} onClick={take} data-testid="sim-wf-take">
          <Droplets className="w-3 h-3" /> Take the starting model
        </Button>
      </div>
      <p className="text-[11px] text-pl-muted">Replaces the grid, the wells, the schedule and, when the pattern holds them, the PVT and the curves. Structure, history and the aquifer are left off.</p>
      {message && <p className="text-[11px] text-pl-warning-text" data-testid="sim-wf-message">{message}</p>}
      {o && (
        <div className="rounded border border-pl-border bg-pl-sunken p-2 text-[11px] text-pl-muted space-y-1" data-testid="sim-wf-origin">
          <p>From Waterflood Design Studio project &quot;{o.recordName}&quot; (wf-forecast-1), pattern {o.pattern || 'unnamed'}, taken {String(o.at).slice(0, 10)}.</p>
          {(o.notes || []).map((n) => <p key={n}>{n}.</p>)}
          {(o.kept || []).length > 0 && <p className="text-pl-warning-text">Not in the pattern, kept from the builder: {o.kept.join('; ')}.</p>}
        </div>
      )}
    </div>
  );
}
