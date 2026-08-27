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
import { catalogForTubingSize, componentFromCatalog } from '../services/cdRun';

const TUBING_SIZES = [2.375, 2.875, 3.5, 4.5];

// Catalog picker: every row carries nominal planning dimensions (approx),
// editable after insertion. The custom row is for equipment outside the
// planning catalog (real vendor dims typed straight in).
const AddComponentDialog = ({ open, onOpenChange, onAdd }) => {
  const [sizeIn, setSizeIn] = useState(3.5);
  const [rowKey, setRowKey] = useState(null);
  const [custom, setCustom] = useState({ name: '', lengthM: 1, odIn: 4.5, idIn: 2.992 });
  const rows = useMemo(() => catalogForTubingSize(sizeIn), [sizeIn]);
  const selected = rows.find((r) => r.name === rowKey) || null;

  const handleAdd = () => {
    if (rowKey === '__custom') {
      if (!custom.name || !(parseFloat(custom.lengthM) > 0)) return;
      onAdd({
        id: `cmp-${Date.now()}`,
        type: 'custom',
        name: custom.name,
        lengthM: parseFloat(custom.lengthM),
        odIn: parseFloat(custom.odIn),
        idIn: parseFloat(custom.idIn),
        approx: false,
        notes: 'user-entered dimensions',
      });
    } else if (selected) {
      onAdd(componentFromCatalog(selected));
    } else {
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Completion Component</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3">
            <Label className="text-xs">Tubing size</Label>
            <Select value={String(sizeIn)} onValueChange={(v) => { setSizeIn(parseFloat(v)); setRowKey(null); }}>
              <SelectTrigger className="h-8 w-32 bg-slate-900 border-slate-700 text-xs" data-testid="cd-add-size"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {TUBING_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}&quot;</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-64 overflow-auto rounded border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Item</th>
                  <th className="px-2 py-1 text-right">OD (in)</th>
                  <th className="px-2 py-1 text-right">ID (in)</th>
                  <th className="px-2 py-1 text-right">Length (m)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}
                    className={`cursor-pointer border-t border-slate-800 ${rowKey === r.name ? 'bg-lime-500/10 text-lime-200' : 'text-slate-300 hover:bg-slate-800/60'}`}
                    onClick={() => setRowKey(r.name)} data-testid={`cd-add-row-${r.type}`}>
                    <td className="px-2 py-1">{r.name}{r.eccentric ? ' (eccentric)' : ''}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.odIn}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.idIn}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.lengthM}</td>
                  </tr>
                ))}
                <tr className={`cursor-pointer border-t border-slate-800 ${rowKey === '__custom' ? 'bg-lime-500/10 text-lime-200' : 'text-slate-400 hover:bg-slate-800/60'}`}
                  onClick={() => setRowKey('__custom')} data-testid="cd-add-row-custom">
                  <td className="px-2 py-1 italic" colSpan={4}>Custom component (enter vendor dimensions)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {rowKey === '__custom' && (
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })}
                  className="h-8 bg-slate-900 border-slate-700 text-xs" data-testid="cd-add-custom-name" />
              </div>
              {[['lengthM', 'Length (m)'], ['odIn', 'OD (in)'], ['idIn', 'ID (in)']].map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" step="0.01" value={custom[k]}
                    onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
                    className="h-8 bg-slate-900 border-slate-700 text-xs" />
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-500">
            Catalog dimensions are nominal planning values. Verify against the vendor data sheet for the exact model run.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!rowKey} className="bg-lime-600 hover:bg-lime-700 text-white" data-testid="cd-add-confirm">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddComponentDialog;
