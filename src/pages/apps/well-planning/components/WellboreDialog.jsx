// Wellbore create/edit dialog (WD1): slot or explicit wellhead, datum
// block (KB / ground / water depth), depth unit, azimuth reference and
// sidetrack parent. Grid convergence at the wellhead is computed from
// the site CRS via the suite engine and cached on the row; magnetic
// declination (WD3) comes from WMM2025 at the wellhead lat/lon for
// today's date and is cached alongside it — together they close the
// magnetic -> true -> grid azimuth chain for MWD surveys.

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { convergenceAt, toLonLat } from '@/lib/crs';
import { isTransformableTag } from '@/lib/crs/tags';
import { declinationAt, decimalYearOf } from '../engine/magnetics';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const NONE = '__none__';

const WellboreDialog = ({ open, onOpenChange, site, wellbore, siblings = [], onSave }) => {
  const editing = Boolean(wellbore?.id);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: wellbore?.name || '',
      uwi: wellbore?.uwi || '',
      slot_name: wellbore?.slot_name || NONE,
      head_x: wellbore?.head_x ?? '',
      head_y: wellbore?.head_y ?? '',
      kb_elev_m: wellbore?.kb_elev_m ?? '',
      ground_elev_m: wellbore?.ground_elev_m ?? site?.default_ground_elev_m ?? '',
      water_depth_m: wellbore?.water_depth_m ?? '',
      depth_unit: wellbore?.depth_unit || 'm',
      azimuth_reference: wellbore?.azimuth_reference || site?.north_reference || 'grid',
      parent_wellbore_id: wellbore?.parent_wellbore_id || NONE,
      status: wellbore?.status || 'planning',
    });
  }, [open, wellbore, site]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const slots = Array.isArray(site?.slots) ? site.slots : [];

  // Effective wellhead: explicit XY wins; else slot offset from origin.
  const head = useMemo(() => {
    const hx = num(form.head_x);
    const hy = num(form.head_y);
    if (hx != null && hy != null) return { x: hx, y: hy };
    const slot = slots.find((s) => s.name === form.slot_name);
    if (slot && site?.origin_x != null && site?.origin_y != null) {
      return { x: site.origin_x + (slot.dx_m || 0), y: site.origin_y + (slot.dy_m || 0) };
    }
    return null;
  }, [form.head_x, form.head_y, form.slot_name, slots, site]);

  const convergence = useMemo(() => {
    if (!head || !site?.crs || !isTransformableTag(site.crs)) return null;
    try {
      const c = convergenceAt(site.crs, head.x, head.y);
      return Number.isFinite(c) ? c : null;
    } catch (e) { return null; }
  }, [head, site?.crs]);

  // WMM2025 declination at the wellhead for today's date (the survey
  // date belongs to each run; the cached value serves planning).
  const magnetics = useMemo(() => {
    if (!head || !site?.crs || !isTransformableTag(site.crs)) return null;
    try {
      const { lon, lat } = toLonLat(site.crs, head.x, head.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const now = new Date();
      const d = declinationAt({
        latDeg: lat,
        lonDeg: lon,
        decimalYear: decimalYearOf(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()),
      });
      return Number.isFinite(d.declinationDeg) ? d : null;
    } catch (e) { return null; }
  }, [head, site?.crs]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        uwi: form.uwi || null,
        slot_name: form.slot_name === NONE ? null : form.slot_name,
        head_x: head?.x ?? null,
        head_y: head?.y ?? null,
        kb_elev_m: num(form.kb_elev_m) || 0,
        ground_elev_m: num(form.ground_elev_m),
        water_depth_m: num(form.water_depth_m),
        depth_unit: form.depth_unit,
        azimuth_reference: form.azimuth_reference,
        grid_convergence_deg: convergence,
        mag_declination_deg: magnetics ? +magnetics.declinationDeg.toFixed(4) : null,
        parent_wellbore_id: form.parent_wellbore_id === NONE ? null : form.parent_wellbore_id,
        status: form.status,
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
          <DialogTitle>{editing ? 'Edit wellbore' : 'New wellbore'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Wellhead location comes from a slot on the pad or explicit coordinates in the site CRS. Depths reference the KB elevation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Wellbore name</Label>
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">UWI (optional)</Label>
              <Input value={form.uwi || ''} onChange={(e) => set('uwi', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Slot</Label>
              <Select value={form.slot_name} onValueChange={(v) => set('slot_name', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value={NONE}>No slot</SelectItem>
                  {slots.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Wellhead E (m)</Label>
              <Input type="number" value={form.head_x} onChange={(e) => set('head_x', e.target.value)} placeholder="from slot" className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">Wellhead N (m)</Label>
              <Input type="number" value={form.head_y} onChange={(e) => set('head_y', e.target.value)} placeholder="from slot" className="bg-slate-800 border-slate-700 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">KB elev (m MSL)</Label>
              <Input type="number" value={form.kb_elev_m} onChange={(e) => set('kb_elev_m', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">Ground elev (m MSL)</Label>
              <Input type="number" value={form.ground_elev_m} onChange={(e) => set('ground_elev_m', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
            <div>
              <Label className="text-xs">Water depth (m)</Label>
              <Input type="number" value={form.water_depth_m} onChange={(e) => set('water_depth_m', e.target.value)} className="bg-slate-800 border-slate-700 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Depth unit</Label>
              <Select value={form.depth_unit} onValueChange={(v) => set('depth_unit', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="m">Metres</SelectItem>
                  <SelectItem value="ft">Feet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Azimuth reference</Label>
              <Select value={form.azimuth_reference} onValueChange={(v) => set('azimuth_reference', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="grid">Grid north</SelectItem>
                  <SelectItem value="true">True north</SelectItem>
                  <SelectItem value="magnetic">Magnetic north</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sidetrack of</Label>
              <Select value={form.parent_wellbore_id} onValueChange={(v) => set('parent_wellbore_id', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value={NONE}>Not a sidetrack</SelectItem>
                  {siblings.filter((w) => w.id !== wellbore?.id).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-400">
            Grid convergence at wellhead: {convergence != null
              ? <span className="font-mono text-slate-200">{convergence.toFixed(4)} deg</span>
              : <span className="italic">needs a site CRS and a wellhead location</span>}
            <span className="mx-2 text-slate-600">|</span>
            Declination ({magnetics ? magnetics.model : 'WMM-2025'}): {magnetics
              ? (
                <span className="font-mono text-slate-200" data-testid="wellbore-declination">
                  {magnetics.declinationDeg.toFixed(4)} deg
                  {!magnetics.inModelRange && <span className="ml-1 text-amber-400">(outside model validity)</span>}
                </span>
              )
              : <span className="italic">needs a transformable site CRS</span>}
            {magnetics && (
              <span className="ml-2 text-slate-500">dip {magnetics.dipDeg.toFixed(2)} deg, field {(magnetics.totalFieldNt / 1000).toFixed(2)} uT</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name?.trim()} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">
            {editing ? 'Save changes' : 'Create wellbore'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WellboreDialog;
