// Publish-to-registry dialog (WD5): pushes the design's trajectory
// into geo_wells (create on first publish, update the bridged row on
// republish) with an optional checkshot borrow so the well can hang in
// time domains (Seismolord co-render). Loud about what will happen
// before it happens.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Share2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { listWells } from '@/lib/wellsRegistry';
import { publishPlan } from '../services/publishPlan';

const NONE = '__none__';

const PublishDialog = ({
  open, onOpenChange, site, wellbore, design, stations, source = 'plan', onPublished,
}) => {
  const { toast } = useToast();
  const [wells, setWells] = useState(null);
  const [borrowId, setBorrowId] = useState(NONE);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!open || wells) return;
    listWells().then(setWells).catch(() => setWells([]));
  }, [open, wells]);

  const donors = useMemo(() => (wells || [])
    .filter((w) => Array.isArray(w.checkshots) && w.checkshots.length >= 2
      && w.id !== wellbore?.geo_well_id), [wells, wellbore?.geo_well_id]);

  const bridged = useMemo(() => (wells || [])
    .find((w) => w.id === wellbore?.geo_well_id) || null, [wells, wellbore?.geo_well_id]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await publishPlan({
        site,
        wellbore,
        design,
        stations,
        source,
        borrowFromWellId: borrowId === NONE ? null : borrowId,
      });
      toast({
        title: res.created ? 'Well published to the registry' : 'Registry well updated',
        description: `${res.geoWell.name}: ${stations.length} stations`
          + `${res.borrowedCheckshots ? `, ${res.borrowedCheckshots} checkshots borrowed` : ''}. `
          + 'Now visible in Well Data Manager and Seismolord.',
        className: 'bg-green-600 text-white',
      });
      onPublished?.(res);
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Publish failed', description: e.message });
    } finally {
      setPublishing(false);
    }
  };

  const ready = Array.isArray(stations) && stations.length >= 2
    && Number.isFinite(wellbore?.head_x);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-lime-400" /> Publish to well registry
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {bridged
              ? `Updates the bridged registry well "${bridged.name}" in place (same id — Seismolord, correlation and petrophysics keep their references).`
              : 'Creates a registry well for this wellbore and remembers the bridge; later publishes update the same row.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 space-y-1">
            <div><span className="text-slate-500">Trajectory:</span> {design?.name} r{design?.revision} ({source}), {stations?.length ?? 0} stations to {stations?.length ? `${stations[stations.length - 1].md.toFixed(0)} m MD` : '--'}</div>
            <div><span className="text-slate-500">Wellhead:</span> {Number.isFinite(wellbore?.head_x) ? `${wellbore.head_x.toFixed(1)} E, ${wellbore.head_y.toFixed(1)} N` : 'not set'} · KB {wellbore?.kb_elev_m ?? 0} m</div>
            <div><span className="text-slate-500">Site CRS:</span> {site?.crs || 'unset (well will import as unplaced)'}</div>
          </div>

          <div>
            <Label className="text-xs text-slate-400">Borrow checkshots (optional, for time-domain display)</Label>
            <Select value={borrowId} onValueChange={setBorrowId}>
              <SelectTrigger className="h-8 mt-1 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 text-white">
                <SelectItem value={NONE} className="text-xs">No borrow</SelectItem>
                {donors.map((w) => (
                  <SelectItem key={w.id} value={w.id} className="text-xs">
                    {w.name} ({w.checkshots.length} checkshots)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {wells && donors.length === 0 && (
              <p className="mt-1 text-[10px] text-slate-500">No registry wells with checkshots available.</p>
            )}
          </div>
          {!ready && (
            <p className="text-[10px] text-amber-400">
              Publishing needs a saved trajectory and wellhead coordinates.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          <Button onClick={handlePublish} disabled={publishing || !ready}
            className="bg-[#4CAF50] hover:bg-[#43a047] text-white" data-testid="publish-confirm">
            {publishing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {bridged ? 'Republish' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublishDialog;
