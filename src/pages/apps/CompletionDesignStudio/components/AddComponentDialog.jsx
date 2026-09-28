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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Completion Component</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3">
            <Label className="text-xs">Tubing size</Label>
            <Select value={String(sizeIn)} onValueChange={(v) => { setSizeIn(parseFloat(v)); setRowKey(null); }}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="cd-add-size"><SelectValue /></SelectTrigger>
              <SelectContent className="">
                {TUBING_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}&quot;</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-64 overflow-auto rounded border border-pl-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-pl-sunken text-pl-muted">
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
                    className={`cursor-pointer border-t border-pl-border ${rowKey === r.name ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}
                    onClick={() => setRowKey(r.name)} data-testid={`cd-add-row-${r.type}`}>
                    <td className="px-2 py-1">{r.name}{r.eccentric ? ' (eccentric)' : ''}</td>
                    <td className="px-2 py-1 text-right font-pl-mono">{Number.isFinite(r.odIn) ? String(Number(r.odIn.toFixed(3))) : ''}</td>
                    <td className="px-2 py-1 text-right font-pl-mono">{Number.isFinite(r.idIn) ? String(Number(r.idIn.toFixed(3))) : ''}</td>
                    <td className="px-2 py-1 text-right font-pl-mono">{r.lengthM}</td>
                  </tr>
                ))}
                <tr className={`cursor-pointer border-t border-pl-border ${rowKey === '__custom' ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-muted hover:bg-pl-sunken'}`}
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
                  className="h-8 text-xs" data-testid="cd-add-custom-name" />
              </div>
              {[['lengthM', 'Length (m)'], ['odIn', 'OD (in)'], ['idIn', 'ID (in)']].map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" step="0.01" value={custom[k]}
                    onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
                    className="h-8 text-xs" />
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-pl-muted">
            Catalog dimensions are nominal planning values. Verify against the vendor data sheet for the exact model run.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-pl-border-strong text-pl-text hover:text-pl-text hover:bg-pl-sunken">
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!rowKey} data-testid="cd-add-confirm">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddComponentDialog;
