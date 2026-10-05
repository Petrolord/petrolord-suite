// Petroleum Economics Studio: "Import from Well Spacing Optimizer"
// (WS-U2-004). Lists the spacing cases the user may read, read by id from
// the saved Well Spacing projects, and writes the chosen one as a
// production file whose data ends with the ws-case-1 contract
// (./epeWsIntake.js). The pattern is EpeWfImport.jsx.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { listWsCases, getWsCase } from '@/utils/wellspacing/wsCaseService';
import { buildLabel } from '@/lib/platformBuild';
import { epeRowsFromWsContract, wsFileName } from './epeWsIntake';
import { epeNativeCheck } from './epeUi';

/**
 * @param {{caseId: string, userId: string, productionVolumes: Array, onDone: function(): void, toast: function, disabled?: boolean}} p
 */
export default function EpeWsImport({ caseId, userId, productionVolumes, onDone, toast, disabled = false }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [pick, setPick] = useState('');
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = async (preselect = null) => {
    setOpen(true);
    setList(null);
    setNote(null);
    try {
      const all = await listWsCases(supabase, { build: buildLabel() });
      setList(all);
      if (preselect) {
        const hit = all.find((f) => f.projectId === preselect.projectId);
        if (hit) setPick(hit.projectId);
      }
    } catch (e) {
      setList([]);
      setNote(e.message);
    }
  };

  // a deep link from Well Spacing Optimizer opens the dialog with the case chosen
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const projectId = q.get('wsProject');
    if (projectId && !disabled) load({ projectId });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async () => {
    const projectId = pick;
    if (!projectId) return;
    setBusy(true);
    try {
      // read again by id at the moment of import: what is stored is what the source says now
      const got = await getWsCase(supabase, { projectId }, { build: buildLabel() });
      if (!got) throw new Error('The Well Spacing Optimizer project could not be read.');
      if (!got.ok) throw new Error(got.reason);
      const data = epeRowsFromWsContract(got.contract, { build: buildLabel() });
      const { data: newRow, error } = await supabase.from('epe_production_volumes')
        .insert({ case_id: caseId, user_id: userId, file_name: wsFileName(got.contract), data })
        .select('id').single();
      if (error) throw new Error(error.message);
      let replaced = 0;
      const baseFiles = (productionVolumes || []).filter((f) => (f.scenario_label ?? null) === null);
      if (replace && baseFiles.length > 0) {
        const { error: delErr, count } = await supabase.from('epe_production_volumes').delete({ count: 'exact' })
          .eq('case_id', caseId).is('scenario_label', null).neq('id', newRow.id);
        if (delErr) toast({ variant: 'destructive', title: 'Could not remove the previous file(s)', description: `${delErr.message}. Delete them by hand or the engine will sum both.` });
        else replaced = count || 0;
      }
      const years = data.length - 1;
      toast({ title: 'Spacing case imported', description: `${years} calendar years from ${got.contract.projectName}, ${Number(got.contract.source.spacingAcres)} acres, oil and solution gas. Enter the drilling capex of the case here.${replaced ? ` Replaced ${replaced} previous file${replaced > 1 ? 's' : ''}.` : ''}` });
      setOpen(false);
      onDone();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Import failed', description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => load()} className="w-full" disabled={disabled} data-testid="epe-from-ws">
        <Target className="w-4 h-4 mr-2" />Import from Well Spacing Optimizer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a Well Spacing Optimizer case</DialogTitle>
            <DialogDescription>
              The field profile of the spacing case chosen in a saved project, from its first production date, as calendar-year oil in stock-tank barrels and solution gas in Mscf. The capex and opex stay yours to enter here; the file card prints the drilling schedule. The file keeps where it came from and this page tells you when the source changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto py-1" data-testid="epe-ws-list">
            {list === null ? <p className="text-sm text-pl-muted"><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Reading your projects...</p>
              : list.length === 0 ? <p className="text-sm text-pl-muted italic" data-testid="epe-ws-empty">{note || 'No Well Spacing Optimizer cases found. Choose a case and its first production date under "Send a case" there, and save the project.'}</p>
                : list.map((f) => {
                  const key = f.projectId;
                  return (
                    <label key={key} className={`flex items-start gap-2 p-2 rounded border border-pl-border text-xs ${f.ok ? 'cursor-pointer' : 'opacity-60'}`}>
                      <input type="radio" name="epe-ws" className={`mt-0.5 ${epeNativeCheck}`} disabled={!f.ok} checked={pick === key} onChange={() => setPick(key)} />
                      <span>
                        <span className="text-pl-text">{f.projectName}</span>
                        <span className="block text-[10px] text-pl-muted">{f.ok ? `${Number(f.contract.source.spacingAcres)} acres, ${f.contract.source.wells} wells; Np ${Math.round(f.contract.forecast.Np).toLocaleString('en-US')} STB from ${f.contract.forecast.start} to ${f.contract.forecast.end}` : f.reason}</span>
                      </span>
                    </label>
                  );
                })}
          </div>
          {(productionVolumes || []).length > 0 && (
            <label className="flex items-start gap-2 text-xs text-pl-text cursor-pointer">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className={`mt-0.5 ${epeNativeCheck}`} />
              <span>Replace the existing base production file(s) (recommended). The engine sums every file in the slot.</span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={doImport} disabled={busy || !pick} data-testid="epe-ws-import">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Target className="w-4 h-4 mr-2" />}
              Import case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
