// Petroleum Economics Studio: "Import from Well Cost & Time" (EPE video
// programme, 2026-10-14). Lists the Well Cost & Time estimates the user may
// read, each read by id with its latest saved run, and writes the chosen one
// as a CAPEX file whose data ends with the wct-afe-1 contract
// (./epeWctIntake.js). The pattern is EpeWsImport.jsx. Replacing is scoped
// to earlier files from the SAME estimate, so a hook-up CSV beside it stays.
import React, { useState } from 'react';
import { Loader2, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { listWctAfes, getWctAfe } from '@/utils/wellcosttime/wctAfeService';
import { BASIS_LABEL, amountFor } from '@/utils/wellcosttime/wctAfeContract';
import { buildLabel } from '@/lib/platformBuild';
import { epeRowsFromWctContract, wctFileName, wctProvenanceOf } from './epeWctIntake';
import { epeNativeCheck, epeSelect } from './epeUi';

const usd = (v) => `${Math.round(v).toLocaleString('en-US')} USD`;

/** The CAPEX files that came from this estimate (the only ones Replace removes). */
export const filesFromEstimate = (capex, caseId) => (capex || []).filter((f) => wctProvenanceOf(f)?.caseId === caseId);

/**
 * @param {{caseId: string, userId: string, capex: Array, onDone: function(): void, toast: function, disabled?: boolean}} p
 */
export default function EpeWctImport({ caseId, userId, capex, onDone, toast, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [pick, setPick] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [category, setCategory] = useState('Drilling');
  const [basis, setBasis] = useState('afe');
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = async () => {
    setOpen(true);
    setList(null);
    setNote(null);
    try {
      setList(await listWctAfes(supabase, { build: buildLabel() }));
    } catch (e) {
      setList([]);
      setNote(e.message);
    }
  };

  const chosen = (list || []).find((f) => f.caseId === pick);
  const hasRisk = Boolean(chosen?.ok && chosen.contract.risk);
  const same = filesFromEstimate(capex, pick);

  const doImport = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      // read again by id at the moment of import: what is stored is what the source says now
      const got = await getWctAfe(supabase, { caseId: pick }, { build: buildLabel() });
      if (!got) throw new Error('The Well Cost & Time estimate could not be read.');
      if (!got.ok) throw new Error(got.reason);
      const data = epeRowsFromWctContract(got.contract, { year, category, basis, build: buildLabel() });
      const { data: newRow, error } = await supabase.from('epe_capex')
        .insert({ case_id: caseId, user_id: userId, file_name: wctFileName(got.contract), data })
        .select('id').single();
      if (error) throw new Error(error.message);
      let replaced = 0;
      if (replace && same.length) {
        const { error: delErr, count } = await supabase.from('epe_capex').delete({ count: 'exact' })
          .in('id', same.map((f) => f.id)).neq('id', newRow.id);
        if (delErr) toast({ variant: 'destructive', title: 'Could not remove the earlier file', description: `${delErr.message}. Delete it by hand or the engine will sum both.` });
        else replaced = count || 0;
      }
      toast({ title: 'Estimate imported', description: `${usd(data[0].cost_usd)} in ${data[0].year} from "${got.contract.caseName}" (${BASIS_LABEL[basis]}).${replaced ? ` Replaced ${replaced} earlier file${replaced > 1 ? 's' : ''} from this estimate.` : ''}` });
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
      <Button variant="outline" size="sm" onClick={load} className="w-full" disabled={disabled} data-testid="epe-from-wct">
        <Calculator className="w-4 h-4 mr-2" />Import from Well Cost & Time
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a Well Cost & Time estimate</DialogTitle>
            <DialogDescription>
              The cost of the well from the latest saved run of an estimate, booked as one capex row in the year the money is spent. The file keeps where it came from, and this page tells you when the estimate changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto py-1" data-testid="epe-wct-list">
            {list === null ? <p className="text-sm text-pl-muted"><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Reading your estimates...</p>
              : list.length === 0 ? <p className="text-sm text-pl-muted italic" data-testid="epe-wct-empty">{note || 'No Well Cost & Time estimates found. Build one for the wellbore there and press Save run on its Report tab.'}</p>
                : list.map((f) => (
                  <label key={f.caseId} className={`flex items-start gap-2 p-2 rounded border border-pl-border text-xs ${f.ok ? 'cursor-pointer' : 'opacity-60'}`}>
                    <input type="radio" name="epe-wct" className={`mt-0.5 ${epeNativeCheck}`} disabled={!f.ok} checked={pick === f.caseId} onChange={() => { setPick(f.caseId); if (!f.contract?.risk) setBasis('afe'); }} />
                    <span>
                      <span className="text-pl-text">{f.caseName}{f.wellboreName ? `, ${f.wellboreName}` : ''}</span>
                      <span className="block text-[10px] text-pl-muted">{f.ok ? `AFE ${usd(f.contract.afe.totalUsd)}, run saved ${String(f.contract.runSavedAt || '').slice(0, 10)}${f.contract.risk ? `; P50 ${usd(f.contract.risk.p50Usd)}, P90 ${usd(f.contract.risk.p90Usd)}` : ''}` : f.reason}</span>
                    </span>
                  </label>
                ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="epe-wct-year" className="text-xs">Year spent</Label>
              <Input id="epe-wct-year" type="number" step="1" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1" data-testid="epe-wct-year" />
            </div>
            <div>
              <Label htmlFor="epe-wct-category" className="text-xs">Category</Label>
              <Input id="epe-wct-category" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1" data-testid="epe-wct-category" />
            </div>
            <div>
              <Label htmlFor="epe-wct-basis" className="text-xs">Amount</Label>
              <select id="epe-wct-basis" value={basis} onChange={(e) => setBasis(e.target.value)} className={`${epeSelect} mt-1`} data-testid="epe-wct-basis">
                <option value="afe">AFE total</option>
                {hasRisk && <option value="p50">Monte Carlo P50</option>}
                {hasRisk && <option value="p90">Monte Carlo P90</option>}
              </select>
            </div>
          </div>
          {chosen?.ok && (
            <p className="text-xs text-pl-muted" data-testid="epe-wct-amount">
              Books {usd(amountFor(chosen.contract, basis))}: {BASIS_LABEL[basis]}.
            </p>
          )}
          {same.length > 0 && (
            <label className="flex items-start gap-2 text-xs text-pl-text cursor-pointer">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className={`mt-0.5 ${epeNativeCheck}`} />
              <span>Replace the earlier file from this estimate (recommended). Other capex files, such as a hook-up, stay as they are.</span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={doImport} disabled={busy || !pick || !chosen?.ok} data-testid="epe-wct-import">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
              Import estimate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
