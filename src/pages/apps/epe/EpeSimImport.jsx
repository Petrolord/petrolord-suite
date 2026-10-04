// Petroleum Economics Studio: "Import from Reservoir Simulation Studio"
// (SIM-U2-002). Lists the completed runs the user may read, read by id from
// the cases and their summaries, and writes the chosen one as a production
// file whose data ends with the sim-forecast-1 contract (./epeSimIntake.js).
// The pattern is EpeWfImport.jsx.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Cuboid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { listSimForecasts, getSimForecast } from '@/utils/simstudio/simForecastService';
import { SIM_PHASES } from '@/utils/simstudio/simForecastContract';
import { buildLabel } from '@/lib/platformBuild';
import { epeRowsFromSimContract, simFileName } from './epeSimIntake';
import { epeNativeCheck } from './epeUi';

const keyOf = (f) => `${f.runId}|${f.phase}`;

/**
 * @param {{caseId: string, userId: string, productionVolumes: Array, onDone: function(): void, toast: function, disabled?: boolean}} p
 */
export default function EpeSimImport({ caseId, userId, productionVolumes, onDone, toast, disabled = false }) {
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
      const all = await listSimForecasts(supabase, { build: buildLabel() });
      setList(all);
      if (preselect) {
        const hit = all.find((f) => f.runId === preselect.runId && f.phase === preselect.phase);
        if (hit) setPick(keyOf(hit));
      }
    } catch (e) {
      setList([]);
      toast({ variant: 'destructive', title: 'Could not list runs', description: e.message });
    }
  };

  // a deep link from Reservoir Simulation Studio opens the dialog with the run chosen
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const runId = q.get('simRun');
    if (runId && !disabled) load({ runId, phase: q.get('simPhase') === 'prediction' ? 'prediction' : 'run' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async () => {
    const chosen = (list || []).find((f) => keyOf(f) === pick);
    if (!chosen) return;
    setBusy(true);
    try {
      // read again by id at the moment of import: what is stored is what the source says now
      const got = await getSimForecast(supabase, { caseId: chosen.caseId, runId: chosen.runId, phase: chosen.phase }, { build: buildLabel() });
      if (!got) throw new Error('The simulation run could not be read.');
      if (!got.ok) throw new Error(got.reason);
      const data = epeRowsFromSimContract(got.contract, { build: buildLabel() });
      const { data: newRow, error } = await supabase.from('epe_production_volumes')
        .insert({ case_id: caseId, user_id: userId, file_name: simFileName(got.contract), data })
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
      toast({ title: 'Run imported', description: `${years} calendar years from ${got.contract.projectName}, run ${String(got.contract.run.id).slice(0, 8)}.${replaced ? ` Replaced ${replaced} previous file${replaced > 1 ? 's' : ''}.` : ''}` });
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
      <Button variant="outline" size="sm" onClick={() => load()} className="w-full" disabled={disabled} data-testid="epe-from-sim">
        <Cuboid className="w-4 h-4 mr-2" />Import from Reservoir Simulation Studio
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a Reservoir Simulation Studio run</DialogTitle>
            <DialogDescription>
              The field profile of one completed OPM Flow run, as calendar-year oil, gas and water at stock-tank and standard conditions; a history-matched run can be taken as its prediction alone. The file keeps where it came from (the case, the run, the deck SHA-256) and this page tells you when the case gains a newer run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto py-1" data-testid="epe-sim-list">
            {list === null ? <p className="text-sm text-pl-muted"><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Reading your runs...</p>
              : list.length === 0 ? <p className="text-sm text-pl-muted italic">No completed Reservoir Simulation Studio runs found.</p>
                : list.map((f) => {
                  const key = keyOf(f);
                  return (
                    <label key={key} className={`flex items-start gap-2 p-2 rounded border border-pl-border text-xs ${f.ok ? 'cursor-pointer' : 'opacity-60'}`}>
                      <input type="radio" name="epe-sim" className={`mt-0.5 ${epeNativeCheck}`} disabled={!f.ok} checked={pick === key} onChange={() => setPick(key)} data-testid={`epe-sim-pick-${f.phase}`} />
                      <span>
                        <span className="text-pl-text">{f.caseName}, run {String(f.runId).slice(0, 8)} ({SIM_PHASES[f.phase]})</span>
                        <span className="block text-[10px] text-pl-muted">{f.ok ? `Np ${Math.round(f.contract.forecast.Np).toLocaleString('en-US')} STB from ${f.contract.forecast.start} to ${f.contract.forecast.end}` : f.reason}</span>
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
            <Button onClick={doImport} disabled={busy || !pick} data-testid="epe-sim-import">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cuboid className="w-4 h-4 mr-2" />}
              Import run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
