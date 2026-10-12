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
import { surfaceDomainOf } from '@/lib/readDepthSurface';
import { targetFromTop, targetFromSurfacePick } from '../services/targetSources';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// The picks themselves (and their source references for "Source changed")
// live in services/targetSources.js; re-exported for the existing tests.
export { sampleGrid, targetDepthFromSurface } from '../services/targetSources';

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
        : setSurfaces(rows.filter((s) => surfaceDomainOf(s) === 'elevation'))))
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
        onPick(targetFromTop(well, top, name));
      } else {
        if (!surface) throw new Error('Pick a surface.');
        const x = num(sx);
        const y = num(sy);
        if (x == null || y == null) throw new Error('Enter the target E/N location to sample.');
        const grid = await downloadSurfaceGrid(surface);
        onPick(targetFromSurfacePick(surface, grid, x, y, name));
      }
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Pick failed', description: e.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'tops' ? 'Target from a formation top' : 'Target from a surface'}</DialogTitle>
          <DialogDescription className="text-pl-muted">
            {mode === 'tops'
              ? 'Uses the shared well registry: the target lands where the chosen well crosses the chosen top.'
              : 'Samples a shared depth surface at a location to set the target depth.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-pl-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading registry...</div>
        ) : (
          <div className="space-y-3">
            {mode === 'tops' ? (
              <>
                <div>
                  <Label className="text-xs">Well</Label>
                  <Select value={wellId} onValueChange={(v) => { setWellId(v); setTopId(''); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select well..." /></SelectTrigger>
                    <SelectContent>
                      {wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.tops.length} tops)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Top</Label>
                  <Select value={topId} onValueChange={setTopId} disabled={!well}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select top..." /></SelectTrigger>
                    <SelectContent>
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
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select surface..." /></SelectTrigger>
                    <SelectContent>
                      {surfaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Easting ({surface?.xy_unit || 'm'})</Label><Input type="number" value={sx} onChange={(e) => setSx(e.target.value)} className="h-9" /></div>
                  <div><Label className="text-xs">Northing ({surface?.xy_unit || 'm'})</Label><Input type="number" value={sy} onChange={(e) => setSy(e.target.value)} className="h-9" /></div>
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Target name (optional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePick} disabled={loading}>Create target</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TargetFromRegistryDialog;
