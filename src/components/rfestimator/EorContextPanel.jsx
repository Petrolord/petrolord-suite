// The EOR screening of this reservoir beside the estimate: an EOR Screening
// project read BY ID as eor-screen-1 (src/lib/eorScreenSource.js), kept with
// the RF project, read again to say "source changed since". Context only:
// it changes no recovery factor. ?eorProject=<id> names a project to take.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { readEorScreenProject, EOR_SCREEN_PARAM, EOR_SCREEN_TABLE } from '@/lib/eorScreenSource';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { eorContextFrom, eorContextChanged, eorContextRows } from '@/utils/rfestimator/eorContext';

async function listEorProjects() {
  try {
    const { data, error } = await supabase.from(EOR_SCREEN_TABLE).select('id, project_name, updated_at').order('updated_at', { ascending: false });
    if (error) return { rows: [], error };
    return { rows: data || [], error: null };
  } catch (e) {
    return { rows: [], error: e };
  }
}

const EorContextPanel = () => {
  const { eorContext, setEorContext, canWrite, addNotification } = useRfEstimator();
  const [searchParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [pick, setPick] = useState(searchParams.get(EOR_SCREEN_PARAM) || eorContext?.projectId || '');
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState(null);

  useEffect(() => {
    let alive = true;
    listEorProjects().then(({ rows, error }) => { if (alive) { setList(rows); setListError(error); } });
    return () => { alive = false; };
  }, []);

  // "source changed since": read the taken project again by id
  useEffect(() => {
    let alive = true;
    setChanged(null);
    if (!eorContext?.projectId) return undefined;
    readEorScreenProject(supabase, eorContext.projectId).then((r) => { if (alive) setChanged(eorContextChanged(eorContext, r.ok ? r.record : null)); }).catch(() => {});
    return () => { alive = false; };
  }, [eorContext]);

  const take = async () => {
    setMessage('');
    const r = await readEorScreenProject(supabase, pick);
    if (!r.ok) { setMessage(r.reason); return; }
    const got = eorContextFrom(r.record);
    if (!got.ok) { setMessage(got.errors.join(' ')); return; }
    setEorContext(got.context);
    addNotification?.(`EOR screening taken from "${r.projectName || 'the project'}".`, 'success');
  };

  const rows = eorContextRows(eorContext);
  return (
    <div className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-eor-context">
      <span className="text-[11px] font-medium text-pl-text">Context: EOR screening of this reservoir</span>
      {rows ? (
        <div className="text-[11px] space-y-1">
          <ul className="space-y-0.5" data-testid="rf-eor-rows">
            {rows.rows.map((r) => <li key={r[0]} className="text-pl-text">{r[0]}: {r[1]}{r[2] ? ` (${r[2]})` : ''}</li>)}
          </ul>
          <p className="text-pl-muted">{rows.note}</p>
          {changed && <p className="text-pl-warning-text" data-testid="rf-eor-changed">{changed}</p>}
          {canWrite && <button type="button" className="underline text-pl-muted" onClick={() => setEorContext(null)}>Forget the screening</button>}
        </div>
      ) : (
        <p className="text-[10px] text-pl-muted">Take a saved EOR Screening project to print its method outcomes and CO2 miscibility check beside the estimate. It changes no number here.</p>
      )}
      <div className="flex gap-2 items-center">
        <select
          className="h-8 flex-1 min-w-0 rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          value={pick} disabled={!canWrite} onChange={(e) => { setPick(e.target.value); setMessage(''); }} data-testid="rf-eor-pick" aria-label="EOR Screening project"
        >
          <option value="">{list == null ? 'Loading the projects' : (list.length ? 'Choose a project' : (listError ? 'EOR Screening projects are not readable yet' : 'No saved EOR Screening project'))}</option>
          {pick && !(list || []).some((p) => p.id === pick) && <option value={pick}>Project named in the address</option>}
          {(list || []).map((p) => <option key={p.id} value={p.id}>{p.project_name || 'Untitled'}</option>)}
        </select>
        <Button size="sm" variant="outline" className="h-8" disabled={!pick || !canWrite} onClick={take} data-testid="rf-eor-take">Take</Button>
      </div>
      {message && <p className="text-[11px] text-pl-danger-text" data-testid="rf-eor-message">{message}</p>}
    </div>
  );
};

export default EorContextPanel;
