// Target create/edit dialog (WD2): point, circle, ellipse and polygon
// kinds on wp_targets, coordinates in site-CRS metres at TVDSS.
// Polygons are entered as one "E,N" pair per line (absolute site CRS).
// 2026-10-13: TVDSS, radius and semi-axes show and take `depthUnit` (the
// unit profile's depth unit, from the Targets tab); stored in metres.

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fieldFromM, unitToM } from '../services/depthUnits';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const TargetDialog = ({ open, onOpenChange, target, onSave, depthUnit = 'm' }) => {
  const du = depthUnit === 'ft' ? 'ft' : 'm';
  const editing = Boolean(target?.id);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: target?.name || '',
      kind: target?.kind || 'point',
      category: target?.category || 'geological',
      center_x: target?.center_x ?? '',
      center_y: target?.center_y ?? '',
      // field strings in the depth unit; converted back to metres on save
      tvdss: fieldFromM(target?.tvdss_m, du),
      radius: fieldFromM(target?.geometry?.radius_m, du),
      semi_major: fieldFromM(target?.geometry?.semi_major_m, du),
      semi_minor: fieldFromM(target?.geometry?.semi_minor_m, du),
      rotation_deg: target?.geometry?.rotation_deg ?? 0,
      polygon: (target?.geometry?.points || []).map(([x, y]) => `${x}, ${y}`).join('\n'),
      dip_deg: target?.dip_deg ?? '',
      dip_azimuth_deg: target?.dip_azimuth_deg ?? '',
      color: target?.color || '#d97706',
      notes: target?.notes || '',
    });
  }, [open, target, du]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name?.trim() && num(form.center_x) != null && num(form.center_y) != null && num(form.tvdss) != null;
  const toM = (v) => unitToM(v, du);

  const parsePolygon = () => (form.polygon || '')
    .split('\n')
    .map((line) => line.split(',').map((v) => num(v)))
    .filter((pair) => pair.length >= 2 && pair[0] != null && pair[1] != null)
    .map(([x, y]) => [x, y]);

  const buildGeometry = () => {
    if (form.kind === 'circle' && num(form.radius)) return { radius_m: toM(form.radius) };
    if (form.kind === 'ellipse' && num(form.semi_major)) {
      return {
        semi_major_m: toM(form.semi_major),
        semi_minor_m: (num(form.semi_minor) ? toM(form.semi_minor) : null) || toM(form.semi_major),
        rotation_deg: num(form.rotation_deg) || 0,
      };
    }
    if (form.kind === 'polygon') {
      const points = parsePolygon();
      return points.length >= 3 ? { points } : null;
    }
    return null;
  };

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        kind: form.kind,
        category: form.category,
        center_x: num(form.center_x),
        center_y: num(form.center_y),
        tvdss_m: toM(form.tvdss),
        geometry: buildGeometry(),
        dip_deg: num(form.dip_deg),
        dip_azimuth_deg: num(form.dip_azimuth_deg),
        color: form.color || null,
        notes: form.notes || null,
      });
      onOpenChange(false);
    } catch (e) {
      // toast raised by the caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit target' : 'New target'}</DialogTitle>
          <DialogDescription className="text-pl-muted">
            Coordinates are in the site CRS (metres). Depth is subsea in {du === 'ft' ? 'feet' : 'metres'} (TVDSS, positive down below MSL).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label className="text-xs">Name</Label>
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Kind</Label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="point">Point</SelectItem>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="ellipse">Ellipse</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geological">Geological</SelectItem>
                  <SelectItem value="drillers">Driller's</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Easting (m)</Label>
              <Input type="number" value={form.center_x} onChange={(e) => set('center_x', e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Northing (m)</Label>
              <Input type="number" value={form.center_y} onChange={(e) => set('center_y', e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">TVDSS ({du})</Label>
              <Input type="number" value={form.tvdss} onChange={(e) => set('tvdss', e.target.value)} className="h-9" data-testid="wd-target-tvdss" />
            </div>
          </div>

          {form.kind === 'ellipse' && (
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Semi-major ({du})</Label><Input type="number" value={form.semi_major} onChange={(e) => set('semi_major', e.target.value)} className="h-9" /></div>
              <div><Label className="text-xs">Semi-minor ({du})</Label><Input type="number" value={form.semi_minor} onChange={(e) => set('semi_minor', e.target.value)} className="h-9" /></div>
              <div><Label className="text-xs">Rotation (deg)</Label><Input type="number" value={form.rotation_deg} onChange={(e) => set('rotation_deg', e.target.value)} className="h-9" /></div>
            </div>
          )}
          {form.kind === 'polygon' && (
            <div>
              <Label className="text-xs">Polygon vertices (one "E, N" per line, site CRS metres; at least 3)</Label>
              <textarea
                value={form.polygon}
                onChange={(e) => set('polygon', e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-pl-border-strong bg-pl-surface p-2 font-mono text-xs text-pl-text"
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {form.kind === 'circle' && (
              <div>
                <Label className="text-xs">Radius ({du})</Label>
                <Input type="number" value={form.radius} onChange={(e) => set('radius', e.target.value)} className="h-9" data-testid="wd-target-radius" />
              </div>
            )}
            <div>
              <Label className="text-xs">Dip (deg)</Label>
              <Input type="number" value={form.dip_deg} onChange={(e) => set('dip_deg', e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Dip azimuth (deg)</Label>
              <Input type="number" value={form.dip_azimuth_deg} onChange={(e) => set('dip_azimuth_deg', e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <Input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} className="h-9 p-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} className="h-9" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !valid}>
            {editing ? 'Save changes' : 'Create target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TargetDialog;
