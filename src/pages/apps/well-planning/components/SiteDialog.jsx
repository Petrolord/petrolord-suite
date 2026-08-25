// Site (pad) create/edit dialog (WD1): name, CRS via the suite
// CrsPicker, pad origin in site CRS, north reference, ground elevation,
// and a slot-template editor (name + dx/dy offsets from the origin).

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import CrsPicker from '@/components/crs/CrsPicker';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const SiteDialog = ({ open, onOpenChange, site, onSave, customDefs = {} }) => {
  const editing = Boolean(site?.id);
  const [form, setForm] = useState({});
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: site?.name || '',
      description: site?.description || '',
      crs: site?.crs || null,
      origin_x: site?.origin_x ?? '',
      origin_y: site?.origin_y ?? '',
      north_reference: site?.north_reference || 'grid',
      default_ground_elev_m: site?.default_ground_elev_m ?? '',
    });
    setSlots(Array.isArray(site?.slots) ? site.slots : []);
  }, [open, site]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setSlot = (i, k, v) => setSlots((s) => s.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description || null,
        crs: form.crs || null,
        origin_x: num(form.origin_x),
        origin_y: num(form.origin_y),
        north_reference: form.north_reference,
        default_ground_elev_m: num(form.default_ground_elev_m),
        slots: slots
          .filter((s) => s.name)
          .map((s) => ({ name: s.name, dx_m: num(s.dx_m) || 0, dy_m: num(s.dy_m) || 0 })),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit site' : 'New site'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            A site is the pad: it carries the coordinate system, the pad origin, and the slot template every wellbore on it uses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Site name</Label>
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">North reference</Label>
              <Select value={form.north_reference} onValueChange={(v) => set('north_reference', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="grid">Grid north</SelectItem>
                  <SelectItem value="true">True north</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Coordinate reference system</Label>
            <div className="mt-1 rounded-md border border-slate-700 bg-slate-800 p-2">
              <CrsPicker value={form.crs} onChange={(tag) => set('crs', tag)} customDefs={customDefs} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Origin Easting (m)</Label>
              <Input type="number" value={form.origin_x} onChange={(e) => set('origin_x', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">Origin Northing (m)</Label>
              <Input type="number" value={form.origin_y} onChange={(e) => set('origin_y', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">Ground elev (m MSL)</Label>
              <Input type="number" value={form.default_ground_elev_m} onChange={(e) => set('default_ground_elev_m', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Slot template (offsets from origin, m)</Label>
              <Button variant="ghost" size="sm" className="h-6 text-lime-400" onClick={() => setSlots((s) => [...s, { name: `S${s.length + 1}`, dx_m: 0, dy_m: 0 }])}>
                <Plus className="mr-1 h-3 w-3" /> Slot
              </Button>
            </div>
            {slots.length > 0 && (
              <div className="mt-1 space-y-1">
                {slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={s.name} onChange={(e) => setSlot(i, 'name', e.target.value)} placeholder="Name" className="h-7 w-20 bg-slate-800 border-slate-700 text-xs" />
                    <Input type="number" value={s.dx_m} onChange={(e) => setSlot(i, 'dx_m', e.target.value)} placeholder="dE" className="h-7 w-24 bg-slate-800 border-slate-700 text-xs" />
                    <Input type="number" value={s.dy_m} onChange={(e) => setSlot(i, 'dy_m', e.target.value)} placeholder="dN" className="h-7 w-24 bg-slate-800 border-slate-700 text-xs" />
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => setSlots((rows) => rows.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name?.trim()} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">
            {editing ? 'Save changes' : 'Create site'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SiteDialog;
