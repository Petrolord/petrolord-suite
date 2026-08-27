import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import {
  CASING_CATALOG, CASING_GRADES, CONNECTION_EFFICIENCIES,
  findCatalogRow, catalogRatings, paToPsi, depthDisp, depthStore, depthLabel,
} from '../../services/ctRun';

// Catalog-driven: OD -> real per-weight rows -> engine-computed ratings
// preview. No hand-typed ratings anywhere.
const AddCasingStringDialog = ({ open, onOpenChange }) => {
  const { setStrings, addLog, depthUnit, stations } = useCasingTubingDesign();
  const unit = depthLabel(depthUnit);
  const tdM = stations.length ? stations[stations.length - 1].md : 3000;

  const [form, setForm] = useState({
    name: 'Production Casing',
    topDisp: 0,
    bottomDisp: null, // filled from TD on open
    odIn: 9.625,
    weightLbFt: 47,
    grade: 'L-80',
    connection: 'BTC',
  });

  const odOptions = useMemo(
    () => [...new Set(CASING_CATALOG.map((r) => r.odIn))].sort((a, b) => b - a), [],
  );
  const weightOptions = useMemo(
    () => CASING_CATALOG.filter((r) => r.odIn === form.odIn).map((r) => r.weightLbFt), [form.odIn],
  );

  const row = findCatalogRow('casing', form.odIn, form.weightLbFt);
  const ratings = row ? catalogRatings(row, form.grade, form.connection) : null;

  const handleSubmit = () => {
    const topMdM = depthStore(parseFloat(form.topDisp) || 0, depthUnit);
    const bottomMdM = depthStore(parseFloat(form.bottomDisp ?? depthDisp(tdM, depthUnit)), depthUnit);
    if (!(bottomMdM > topMdM)) return;
    const id = `cs-${Date.now()}`;
    setStrings((prev) => ({
      ...prev,
      casingStrings: [...prev.casingStrings, {
        id,
        name: form.name,
        sections: [{
          id: `sec-${Date.now()}`,
          name: `${form.name} - Sec 1`,
          topMdM,
          bottomMdM,
          odIn: form.odIn,
          weightLbFt: form.weightLbFt,
          grade: form.grade,
          connection: form.connection,
          kind: 'casing',
        }],
      }],
    }));
    addLog(`Added casing string ${form.name} (${form.odIn}" ${form.weightLbFt}# ${form.grade}).`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Casing String</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 space-y-2">
            <Label>String Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-slate-900 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label>Hanger MD ({unit})</Label>
            <Input
              type="number"
              value={form.topDisp}
              onChange={(e) => setForm({ ...form, topDisp: e.target.value })}
              className="bg-slate-900 border-slate-700"
            />
          </div>
          <div className="space-y-2">
            <Label>Shoe MD ({unit})</Label>
            <Input
              type="number"
              value={form.bottomDisp ?? Math.round(depthDisp(tdM, depthUnit))}
              onChange={(e) => setForm({ ...form, bottomDisp: e.target.value })}
              className="bg-slate-900 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label>OD</Label>
            <Select
              value={String(form.odIn)}
              onValueChange={(v) => {
                const odIn = parseFloat(v);
                const first = CASING_CATALOG.find((r) => r.odIn === odIn);
                setForm({ ...form, odIn, weightLbFt: first.weightLbFt });
              }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {odOptions.map((od) => (
                  <SelectItem key={od} value={String(od)}>{od}&quot;</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Weight (lb/ft)</Label>
            <Select
              value={String(form.weightLbFt)}
              onValueChange={(v) => setForm({ ...form, weightLbFt: parseFloat(v) })}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {weightOptions.map((w) => (
                  <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Grade</Label>
            <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
              <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CASING_GRADES.map((g) => (
                  <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Connection</Label>
            <Select value={form.connection} onValueChange={(v) => setForm({ ...form, connection: v })}>
              <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CONNECTION_EFFICIENCIES.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name} ({Math.round(c.efficiency * 100)}%)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ratings && (
            <div className="col-span-2 grid grid-cols-3 gap-2 bg-slate-900/50 border border-slate-800 rounded p-3">
              <div>
                <span className="text-[10px] text-slate-500 block">API Burst</span>
                <span className="text-xs font-mono text-emerald-400">{Math.round(paToPsi(ratings.burstPa)).toLocaleString()} psi</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">5C3 Collapse ({ratings.collapseRegime})</span>
                <span className="text-xs font-mono text-amber-400">{Math.round(paToPsi(ratings.collapsePa)).toLocaleString()} psi</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Joint Strength</span>
                <span className="text-xs font-mono text-blue-400">{Math.round(ratings.jointStrengthN / 4448.22 / 1000).toLocaleString()} klbf</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!row} className="bg-lime-600 hover:bg-lime-700 text-white">
            Add String
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCasingStringDialog;
