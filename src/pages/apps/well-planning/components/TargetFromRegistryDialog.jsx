// Target pickers from the shared geoscience registries (WD2) — the
// integration Compass cannot offer. Two modes:
//   tops:    pick a well + formation top from geo_wells; the target
//            lands at the wellbore position of that top MD (position
//            via the validated minimum-curvature engine) at its TVDSS.
//   surface: pick a geo_surfaces grid and sample its depth at a typed
//            E/N location (bilinear interpolation on the f32 grid).
// Both stamp provenance so a target always says where it came from.

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { listWellsWithTops } from '@/lib/wellsRegistry';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { computeWellPath, positionAtMd } from '../engine/surveyMath';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Bilinear sample of a row-major nx*ny float32 grid; null outside. */
export function sampleGrid(surface, grid, x, y) {
  const { origin_x, origin_y, dx, dy, nx, ny } = surface;
  const fx = (x - origin_x) / dx;
  const fy = (y - origin_y) / dy;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const c1 = Math.min(nx - 1, c0 + 1);
  const r1 = Math.min(ny - 1, r0 + 1);
  const tx = fx - c0;
  const ty = fy - r0;
  const z00 = grid[r0 * nx + c0];
  const z01 = grid[r0 * nx + c1];
  const z10 = grid[r1 * nx + c0];
  const z11 = grid[r1 * nx + c1];
  if (![z00, z01, z10, z11].every(Number.isFinite)) return null;
  return z00 * (1 - tx) * (1 - ty) + z01 * tx * (1 - ty)
    + z10 * (1 - tx) * ty + z11 * tx * ty;
}

const TargetFromRegistryDialog = ({ open, onOpenChange, mode, onPick }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [wells, setWells] = useState([]);
  const [surfaces, setSurfaces] = useState([]);
  const [wellId, setWellId] = useState('');
  const [topId, setTopId] = useState('');
  const [surfaceId, setSurfaceId] = useState('');
  const [sx, setSx] = useState('');
  const [sy, setSy] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (mode === 'tops' ? listWellsWithTops() : listSurfaces())
      .then((rows) => (mode === 'tops'
        ? setWells(rows.filter((w) => w.tops?.length))
        : setSurfaces(rows.filter((s) => (s.z_domain || s.zDomain || 'depth') !== 'time'))))
      .catch((e) => toast({ variant: 'destructive', title: 'Registry load failed', description: e.message }))
      .finally(() => setLoading(false));
  }, [open, mode, toast]);

  const well = wells.find((w) => w.id === wellId);
  const top = well?.tops?.find((t) => t.id === topId);
  const surface = surfaces.find((s) => s.id === surfaceId);

  const handlePick = async () => {
    try {
      if (mode === 'tops') {
        if (!well || !top) throw new Error('Pick a well and a top.');
        const deviation = Array.isArray(well.deviation) && well.deviation.length >= 2
          ? well.deviation : [{ md: 0, inc: 0, azi: 0 }, { md: Math.max(top.md_m + 1, well.td_md_m || top.md_m + 1), inc: 0, azi: 0 }];
        const path = computeWellPath(deviation, {
          surfaceX: well.surface_x, surfaceY: well.surface_y, kb: well.kb_m || 0,
        });
        const pos = positionAtMd(deviation, path, Math.min(top.md_m, deviation[deviation.length - 1].md));
        if (!pos) throw new Error(`Top MD ${top.md_m} m is outside the well's surveyed range.`);
        onPick({
          name: name || `${top.name} @ ${well.name}`,
          kind: 'point',
          category: 'geological',
          center_x: pos.x,
          center_y: pos.y,
          tvdss_m: pos.tvdss,
          provenance: {
            source: 'geo_top', geo_well_id: well.id, well_name: well.name,
            top_id: top.id, top_name: top.name, top_md_m: top.md_m,
          },
        });
      } else {
        if (!surface) throw new Error('Pick a surface.');
        const x = num(sx);
        const y = num(sy);
        if (x == null || y == null) throw new Error('Enter the target E/N location to sample.');
        const grid = await downloadSurfaceGrid(surface);
        const z = sampleGrid(surface, grid, x, y);
        if (z == null) throw new Error('The location is outside the surface grid (or on a null node).');
        onPick({
          name: name || `${surface.name} pick`,
          kind: 'point',
          category: 'geological',
          center_x: x,
          center_y: y,
          tvdss_m: Math.abs(z),
          provenance: {
            source: 'geo_surface', surface_id: surface.id, surface_name: surface.name,
            sampled_z: z, note: 'tvdss stored positive down; surface z sign normalized with abs',
          },
        });
      }
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Pick failed', description: e.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>{mode === 'tops' ? 'Target from a formation top' : 'Target from a surface'}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {mode === 'tops'
              ? 'Uses the shared well registry: the target lands where the chosen well crosses the chosen top.'
              : 'Samples a shared depth surface at a location to set the target depth.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading registry...</div>
        ) : (
          <div className="space-y-3">
            {mode === 'tops' ? (
              <>
                <div>
                  <Label className="text-xs">Well</Label>
                  <Select value={wellId} onValueChange={(v) => { setWellId(v); setTopId(''); }}>
                    <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue placeholder="Select well..." /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.tops.length} tops)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Top</Label>
                  <Select value={topId} onValueChange={setTopId} disabled={!well}>
                    <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue placeholder="Select top..." /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {(well?.tops || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.md_m.toFixed(0)} m MD)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Surface</Label>
                  <Select value={surfaceId} onValueChange={setSurfaceId}>
                    <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue placeholder="Select surface..." /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {surfaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Easting (m)</Label><Input type="number" value={sx} onChange={(e) => setSx(e.target.value)} className="h-9 bg-slate-800 border-slate-700" /></div>
                  <div><Label className="text-xs">Northing (m)</Label><Input type="number" value={sy} onChange={(e) => setSy(e.target.value)} className="h-9 bg-slate-800 border-slate-700" /></div>
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Target name (optional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 bg-slate-800 border-slate-700" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600 text-slate-300">Cancel</Button>
          <Button onClick={handlePick} disabled={loading} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">Create target</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TargetFromRegistryDialog;
