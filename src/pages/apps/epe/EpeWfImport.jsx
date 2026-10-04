// Petroleum Economics Studio: "Import from Waterflood Design Studio"
// (WF-U2-001). Lists the pattern forecasts the user may read, read by id
// from the saved Waterflood projects, and writes the chosen one as a
// production file whose data ends with the wf-forecast-1 contract
// (./epeWfIntake.js). The pattern is EpeDcaImport.jsx.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { listWfForecasts, getWfForecast } from '@/utils/waterflooddesign/wfForecastService';
import { wfEndWords } from '@/utils/waterflooddesign/wfForecastContract';
import { buildLabel } from '@/lib/platformBuild';
import { epeRowsFromWfContract, wfFileName } from './epeWfIntake';
import { epeNativeCheck } from './epeUi';

/**
 * @param {{caseId: string, userId: string, productionVolumes: Array, onDone: function(): void, toast: function, disabled?: boolean}} p
 */
export default function EpeWfImport({ caseId, userId, productionVolumes, onDone, toast, disabled = false }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [pick, setPick] = useState('');
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async (preselect = null) => {
    setOpen(true);
    setList(null);
    try {
      const all = await listWfForecasts(supabase, { build: buildLabel() });
      setList(all);
      if (preselect) {
        const hit = all.find((f) => f.projectId === preselect.projectId);
        if (hit) setPick(hit.projectId);
      }
    } catch (e) {
      setList([]);
      toast({ variant: 'destructive', title: 'Could not list forecasts', description: e.message });
    }
  };

  // a deep link from Waterflood Design Studio opens the dialog with the forecast chosen
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const projectId = q.get('wfProject');
    if (projectId && !disabled) load({ projectId });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async () => {
    const projectId = pick;
    if (!projectId) return;
    setBusy(true);
    try {
      // read again by id at the moment of import: what is stored is what the source says now
      const got = await getWfForecast(supabase, { projectId }, { build: buildLabel() });
      if (!got) throw new Error('The Waterflood Design Studio project could not be read.');
      if (!got.ok) throw new Error(got.reason);
      const data = epeRowsFromWfContract(got.contract, { build: buildLabel() });
      const { data: newRow, error } = await supabase.from('epe_production_volumes')
        .insert({ case_id: caseId, user_id: userId, file_name: wfFileName(got.contract), data })
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
      toast({ title: 'Forecast imported', description: `${years} calendar years from ${got.contract.source.pattern || got.contract.projectName}, oil and water.${replaced ? ` Replaced ${replaced} previous file${replaced > 1 ? 's' : ''}.` : ''}` });
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
      <Button variant="outline" size="sm" onClick={() => load()} className="w-full" disabled={disabled} data-testid="epe-from-wf">
        <Droplets className="w-4 h-4 mr-2" />Import from Waterflood Design Studio
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a Waterflood Design Studio forecast</DialogTitle>
            <DialogDescription>
              The pattern forecast from the flood start, as calendar-year oil and water in stock-tank barrels. The file keeps where it came from (the project, the pattern, the sweep model, the kr and PVT sources) and this page tells you when the source changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto py-1" data-testid="epe-wf-list">
            {list === null ? <p className="text-sm text-pl-muted"><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Reading your projects...</p>
              : list.length === 0 ? <p className="text-sm text-pl-muted italic">No Waterflood Design Studio forecasts found.</p>
                : list.map((f) => {
                  const key = f.projectId;
                  return (
                    <label key={key} className={`flex items-start gap-2 p-2 rounded border border-pl-border text-xs ${f.ok ? 'cursor-pointer' : 'opacity-60'}`}>
                      <input type="radio" name="epe-wf" className={`mt-0.5 ${epeNativeCheck}`} disabled={!f.ok} checked={pick === key} onChange={() => setPick(key)} />
                      <span>
                        <span className="text-pl-text">{f.projectName}</span>
                        <span className="block text-[10px] text-pl-muted">{f.ok ? `Np ${Math.round(f.contract.forecast.Np).toLocaleString('en-US')} STB from ${f.contract.forecast.start} to ${wfEndWords(f.contract.forecast.endReason)}` : f.reason}</span>
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
            <Button onClick={doImport} disabled={busy || !pick} data-testid="epe-wf-import">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Droplets className="w-4 h-4 mr-2" />}
              Import forecast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
