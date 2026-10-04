// The surveillance history from a Voidage Replacement Monitor project, read
// by id (WF-U2-004, the vrr-1 contract, VRR-U2-001): lists the VRR projects the
// user may read, takes the ledger of the chosen one, and on every visit reads
// it again by id to say when it changed. A link from VRR Monitor arrives as
// ?vrrProject=<id> and opens the list with that project chosen.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { listVrrLedgers, getVrrLedger, compareVrrWithSource } from '@/utils/vrr/vrrLedgerContract';
import { surveillanceFromVrrLedger, isVrrIntakeSource } from '@/utils/waterflooddesign/vrrIntake';

export default function VrrIntakePanel() {
  const { setSurveillanceRows, setSurveillanceImport, surveillanceImport, addNotification, canWrite, setSurveillanceField } = useWaterfloodDesign();
  const location = useLocation();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const from = isVrrIntakeSource(surveillanceImport?.source) ? surveillanceImport.from : null;

  const take = (contract) => {
    const got = surveillanceFromVrrLedger(contract);
    if (!got.ok) { addNotification(got.reason, 'error'); return; }
    setSurveillanceRows(got.rows);
    setSurveillanceImport(got.intake);
    if (got.pressureSurveys.length) setSurveillanceField('pressure_surveys', got.pressureSurveys);
    setOpen(false);
    addNotification(`History taken from VRR Monitor project "${contract.projectName}": ${got.intake.months.count} months, ${got.rows.length} rows.`, 'success');
  };

  const load = async (preselect = null) => {
    setOpen(true);
    setList(null);
    try {
      const all = await listVrrLedgers(supabase);
      setList(all);
      if (preselect) {
        const hit = all.find((x) => x.projectId === preselect);
        if (hit?.ok) take(hit.contract);
        else if (hit) addNotification(hit.reason, 'error');
      }
    } catch (e) {
      setList([]);
      addNotification(e.message, 'error');
    }
  };

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('vrrProject');
    if (id && canWrite !== false) load(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "source changed since": read the VRR project again by id
  useEffect(() => {
    if (!from?.recordId) { setState(null); return undefined; }
    let alive = true;
    getVrrLedger(supabase, { projectId: from.recordId })
      .then((now) => { if (alive) setState(compareVrrWithSource(from.fingerprint, now)); })
      .catch((e) => { if (alive) setState({ state: 'unreadable', text: `The source could not be read: ${e.message}` }); });
    return () => { alive = false; };
  }, [from?.recordId, from?.fingerprint]);

  return (
    <div className="space-y-2" data-testid="wds-vrr-intake">
      <Button variant="outline" size="sm" className="w-full" onClick={() => (open ? setOpen(false) : load())} disabled={canWrite === false} data-testid="wds-from-vrr">
        <Activity className="w-4 h-4 mr-1" /> From VRR Monitor
      </Button>
      {from && state && (
        <p className={`text-[11px] ${state.state === 'unchanged' ? 'text-pl-muted' : 'text-pl-warning-text'}`} data-testid="wds-vrr-state">
          {state.text}
          {state.state === 'changed' && (
            <Button size="sm" variant="outline" className="h-6 ml-2 text-[10px] gap-1" onClick={() => take(state.now)} disabled={canWrite === false} data-testid="wds-vrr-refresh">
              <RefreshCw size={10} /> Take again
            </Button>
          )}
        </p>
      )}
      {open && (
        <div className="rounded-md border border-pl-border bg-pl-sunken p-2 space-y-2 max-h-64 overflow-y-auto" data-testid="wds-vrr-list">
          <p className="text-[11px] text-pl-muted">The per-well ledger of a saved VRR Monitor project, read by its id: monthly volumes per well, so the totals and the VRR here are those of VRR Monitor. The ledger holds no injection pressure (no Hall plot from it).</p>
          {list === null ? <p className="text-xs text-pl-muted">Reading your projects...</p>
            : list.length === 0 ? <p className="text-xs text-pl-muted italic">No VRR Monitor projects found.</p>
              : list.map((f) => (
                <div key={f.projectId} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="text-pl-text truncate">{f.projectName}</div>
                    <div className="text-[10px] text-pl-muted">{f.ok ? `${f.contract.months.length} months, ${f.contract.wells.injectors.length} injectors, ${f.contract.wells.producers.length} producers` : f.reason}</div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!f.ok} onClick={() => take(f.contract)}>Use</Button>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
