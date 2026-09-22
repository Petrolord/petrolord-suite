// Site (pad) create/edit dialog (WD1): name, CRS via the suite
// CrsPicker, pad origin in site CRS, north reference, ground elevation,
// and a slot-template editor (name + dx/dy offsets from the origin).
//
// Datum transformation (tester feedback 2026-09-22): a CRS on a datum with
// several published EPSG transformations to WGS 84 (Minna) shows the one in
// use, its published accuracy and area of use, and lets the site choose
// another; the choice is saved in crs_provenance.datum_transform and every
// lon/lat conversion of this site uses it (services/siteCrs.js).

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import CrsPicker from '@/components/crs/CrsPicker';
import { catalogGet, datumTransformInfo, insideTransformArea, toLonLat } from '@/lib/crs';
import { withDatumTransform } from '../services/siteCrs';

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
      datum_transform: site?.crs_provenance?.datum_transform || null,
      origin_x: site?.origin_x ?? '',
      origin_y: site?.origin_y ?? '',
      north_reference: site?.north_reference || 'grid',
      default_ground_elev_m: site?.default_ground_elev_m ?? '',
    });
    setSlots(Array.isArray(site?.slots) ? site.slots : []);
  }, [open, site]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // The transformation in effect for the picked CRS (null when the CRS has
  // no named choice), and where the origin falls against its area of use.
  const dtInfo = useMemo(() => datumTransformInfo(form.crs, form.datum_transform), [form.crs, form.datum_transform]);
  const crsEntry = form.crs ? catalogGet(form.crs) : null;
  const originCheck = useMemo(() => {
    const ox = num(form.origin_x);
    const oy = num(form.origin_y);
    if (!dtInfo || ox == null || oy == null) return null;
    try {
      const { lon, lat } = toLonLat(form.crs, ox, oy, {}, { datumTransform: dtInfo.transform.code });
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      return {
        lon,
        lat,
        inside: insideTransformArea(dtInfo.transform, lon, lat),
        covering: dtInfo.options.filter((t) => insideTransformArea(t, lon, lat)),
      };
    } catch (e) { return null; }
  }, [dtInfo, form.crs, form.origin_x, form.origin_y]);

  const setSlot = (i, k, v) => setSlots((s) => s.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description || null,
        crs: form.crs || null,
        crs_provenance: withDatumTransform(
          site?.crs_provenance,
          dtInfo && !dtInfo.isDefault ? dtInfo.transform.code : null,
        ),
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
              <CrsPicker
                value={form.crs}
                onChange={(tag) => setForm((f) => ({ ...f, crs: tag, datum_transform: null }))}
                customDefs={customDefs}
              />
            </div>
            {dtInfo && (
              <div className="mt-2 space-y-1" data-testid="site-datum-transform">
                <Label className="text-xs">Datum transformation to WGS 84</Label>
                <Select
                  value={dtInfo.transform.code}
                  onValueChange={(v) => set('datum_transform', v === crsEntry?.datumTransform ? null : v)}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {dtInfo.options.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.name}, {t.code}, {t.accuracyM} m{t.code === crsEntry?.datumTransform ? ' (default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400" data-testid="site-datum-accuracy">
                  {dtInfo.transform.name} ({dtInfo.transform.code}), {dtInfo.transform.method}.
                  {' '}Published accuracy {dtInfo.transform.accuracyM} m. Area of use: {dtInfo.transform.areaName}.
                </p>
                {dtInfo.overrideIgnored && (
                  <p className="text-xs text-amber-300">
                    The saved transformation does not apply to this CRS, so the default is used.
                  </p>
                )}
                {originCheck && !originCheck.inside && (
                  <p className="text-xs text-amber-300" data-testid="site-datum-outside">
                    The site origin ({originCheck.lat.toFixed(4)}°, {originCheck.lon.toFixed(4)}°) lies outside this
                    transformation&apos;s published area of use.
                    {' '}{originCheck.covering.length
                      ? `Published for this location: ${originCheck.covering.map((t) => `${t.name} (${t.code}, ${t.accuracyM} m)`).join('; ')}.`
                      : 'No published transformation for this CRS covers this location.'}
                  </p>
                )}
              </div>
            )}
            {!dtInfo && crsEntry?.datumAccuracyM && (
              <p className="mt-2 text-xs text-slate-400" data-testid="site-datum-accuracy">
                The datum shift to WGS 84 is approximate, about {crsEntry.datumAccuracyM} m.
              </p>
            )}
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
