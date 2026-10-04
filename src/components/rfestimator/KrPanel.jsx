// The kr-1 oil-water set for the displacement x sweep method (RF-U2-009):
// choose a saved SCAL Studio project (or arrive with ?scalProject=<id>) and
// take its Corey set by id; the set is read again and a change is said.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { readScalProjectKr, SCAL_PROJECTS_TABLE, KR_PROJECT_PARAM } from '@/lib/krSource';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { rfKrIntake, krChangedSince } from '@/utils/rfestimator/krIntake';

const g = (v) => String(parseFloat(Number(v).toPrecision(4)));

const KrPanel = () => {
  const { inputs, derived, krIntake, setKrIntake, canWrite, addNotification } = useRfEstimator();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get(KR_PROJECT_PARAM) || krIntake?.recordId || '');
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState(null);
  const show = inputs.method === 'displacement_sweep';

  useEffect(() => {
    if (!show || projects) return undefined;
    let alive = true;
    supabase.from(SCAL_PROJECTS_TABLE).select('id, project_name, updated_at').order('updated_at', { ascending: false })
      .then(({ data }) => { if (alive) setProjects(data || []); }, () => { if (alive) setProjects([]); });
    return () => { alive = false; };
  }, [show, projects]);

  useEffect(() => {
    let alive = true;
    setChanged(null);
    if (!krIntake?.recordId) return undefined;
    readScalProjectKr(krIntake.recordId).then((r) => { if (alive && r.ok) setChanged(krChangedSince(krIntake, r.contract)); }).catch(() => {});
    return () => { alive = false; };
  }, [krIntake]);

  if (!show) return null;
  const take = async () => {
    setMessage('');
    const r = await readScalProjectKr(projectId);
    if (!r.ok) { setMessage(r.reason); return; }
    const got = rfKrIntake(r.contract, { projectId, projectName: r.projectName });
    if (!got.ok) { setMessage(got.error); return; }
    setKrIntake(got.intake);
    addNotification?.(`Oil-water relative permeability taken from "${got.intake.recordName}".`, 'success');
  };
  const d = derived.result.detail;
  return (
    <div className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-kr">
      <span className="text-[11px] font-medium text-pl-text">Relative permeability (kr-1, SCAL Studio)</span>
      {krIntake && (
        <div className="text-[11px] text-pl-muted space-y-1" data-testid="rf-kr-record">
          <p>{krIntake.source}</p>
          <p>Swc {g(krIntake.params.Swc)}, Sor {g(krIntake.params.Sor)}, krw at Sor {g(krIntake.params.krwMax)}, kro at Swc {g(krIntake.params.kroMax)}, nw {g(krIntake.params.nw)}, no {g(krIntake.params.no)}.</p>
          {d && Number.isFinite(d.ed) && <p className="text-pl-text" data-testid="rf-kr-ed">ED {g(d.ed)} ({d.at}{d.qi != null ? ` at Qi ${g(d.qi)} PV` : ''}); at breakthrough {g(d.edBt)}, end point {g(d.edMax)}; end-point mobility ratio {g(d.mobilityRatio)}.</p>}
          {changed && <p className="text-pl-warning-text" data-testid="rf-kr-changed">{changed}</p>}
        </div>
      )}
      {canWrite && (
        <div className="flex gap-2">
          <select aria-label="SCAL Studio project" className="h-9 flex-1 rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text" value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="rf-kr-project">
            <option value="">{projects == null ? 'Reading your SCAL projects' : (projects.length ? 'Choose a SCAL project' : 'No SCAL Studio project is readable from this account')}</option>
            {projectId && !(projects || []).some((p) => p.id === projectId) && <option value={projectId}>Project named in the address</option>}
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-9 text-xs" disabled={!projectId} onClick={take} data-testid="rf-kr-take">Take</Button>
        </div>
      )}
      {message && <p className="text-[11px] text-pl-danger-text">{message}</p>}
    </div>
  );
};

export default KrPanel;
