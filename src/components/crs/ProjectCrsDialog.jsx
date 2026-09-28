import React, { useEffect, useState } from 'react';
import { Globe2, Lock, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import CrsPicker from '@/components/crs/CrsPicker';
import CrsBadge from '@/components/crs/CrsBadge';
import { crsDisplayName, crsUnit } from '@/lib/crs';
import { UNKNOWN } from '@/lib/crs/tags';
import {
  getProjectCrs, setProjectCrs, countCrsTaggedData, addCustomDef,
} from '@/lib/crs/settingsService';
import { reprojectProjectData } from '@/lib/crs/reprojectProject';


/**
 * View and set the Project CRS (Petrel model): the one system all
 * geoscience imports convert into. Free to change while no CRS-tagged
 * data exists; locked with per-registry counts afterwards.
 *
 * @param {{open: boolean, onOpenChange: (o: boolean) => void,
 *   onChanged?: (p: {tag: string, name: ?string}) => void}} p
 */
export default function ProjectCrsDialog({ open, onOpenChange, onChanged }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(null);
  const [counts, setCounts] = useState(null);
  const [choice, setChoice] = useState(null);   // {tag, name}
  const [reprojectOpen, setReprojectOpen] = useState(false);
  const [reprojecting, setReprojecting] = useState(null);   // {step, done, total}
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setLoading(true);
    Promise.all([getProjectCrs(), countCrsTaggedData()])
      .then(([p, c]) => {
        if (stale) return;
        setCurrent(p);
        setCounts(c);
        setChoice(p.tag !== UNKNOWN ? { tag: p.tag, name: p.name } : null);
      })
      .catch((e) => toast({ title: 'Could not load Project CRS', description: e.message, variant: 'destructive' }))
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [open, toast]);

  const locked = (counts?.total || 0) > 0;

  const onPick = async (tag, meta) => {
    if (meta.customDef) {
      try {
        const customTag = await addCustomDef(meta.customDef);
        setChoice({ tag: customTag, name: meta.customDef.name });
      } catch (e) {
        toast({ title: 'Custom CRS not saved', description: e.message, variant: 'destructive' });
      }
    } else {
      setChoice({ tag, name: meta.name });
    }
  };

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    try {
      await setProjectCrs({
        tag: choice.tag,
        name: choice.name || crsDisplayName(choice.tag, current?.customDefs || {}),
        xyUnit: crsUnit(choice.tag, current?.customDefs || {}),
      });
      toast({ title: 'Project CRS set', description: choice.name || choice.tag });
      if (onChanged) onChanged(choice);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Project CRS not changed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-pl-sunken border-pl-border text-pl-text max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-pl-text">
            <Globe2 className="w-5 h-5 mr-2 text-pl-primary-text" />
            Project coordinate reference system
          </DialogTitle>
          <DialogDescription className="text-pl-muted">
            Every import converts into this system, so wells, seismic and
            surfaces always share one frame. This is the same role the
            project CRS plays in Petrel.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center text-pl-muted text-sm py-4">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-pl-muted">Current:</span>
              <CrsBadge tag={current?.tag} name={current?.name} />
              {current?.name && <span className="text-pl-text">{current.name}</span>}
            </div>

            {locked && (
              <div className="rounded-lg border border-pl-warning/50 bg-pl-warning-bg p-3 text-sm text-pl-warning-text flex items-start">
                <Lock className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <div>
                  The Project CRS is locked: {counts.total} dataset(s) are already stored in it
                  {['geo_wells', 'geo_surfaces', 'seismic_volumes', 'em_models']
                    .filter((t) => counts[t] > 0)
                    .map((t) => ` ${counts[t]} in ${t.replace('geo_', '').replace('_', ' ')}`)
                    .join(',')}.
                  Changing it reprojects all of that data into the new system.
                </div>
              </div>
            )}

            {(!locked || reprojectOpen) && !reprojecting && !report && (
              <CrsPicker
                value={choice?.tag}
                customDefs={current?.customDefs || {}}
                onChange={onPick}
                allowSentinels={false}
              />
            )}

            {locked && !reprojectOpen && !report && (
              <Button
                variant="outline"
                className="border-pl-warning/60 text-pl-warning-text hover:bg-pl-warning-bg"
                onClick={() => { setChoice(null); setReprojectOpen(true); }}
              >
                Change Project CRS and reproject the data…
              </Button>
            )}

            {reprojecting && (
              <div className="flex items-center text-sm text-pl-primary-text">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reprojecting {reprojecting.step}
                {reprojecting.total > 1 ? ` (${reprojecting.done + 1} of ${reprojecting.total})` : ''}…
              </div>
            )}

            {report && (
              <div className="rounded-lg border border-pl-success/50 bg-pl-success-bg p-3 text-sm text-pl-success-text space-y-1">
                <div>
                  Reprojection complete: {report.wells.converted} wells, {report.surfaces.converted} surfaces,
                  {' '}{report.volumes.converted} seismic volumes, {report.models.converted} models converted.
                </div>
                {report.skippedNames.length > 0 && (
                  <div className="text-pl-warning-text">
                    Skipped (unknown or local placement, unchanged): {report.skippedNames.join('; ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!locked && (
            <Button
              disabled={loading || saving || !choice}
              onClick={save}
              className="bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set Project CRS
            </Button>
          )}
          {locked && reprojectOpen && !report && (
            <Button
              disabled={loading || !choice || !!reprojecting}
              onClick={async () => {
                setReprojecting({ step: 'starting', done: 0, total: 1 });
                try {
                  const r = await reprojectProjectData({
                    toTag: choice.tag,
                    onProgress: setReprojecting,
                  });
                  setReport(r);
                  setCurrent(await getProjectCrs());
                  if (onChanged) onChanged(choice);
                  toast({ title: 'Project CRS changed', description: choice.name || choice.tag });
                } catch (e) {
                  toast({ title: 'Reprojection stopped', description: `${e.message} Run it again to finish the remaining datasets.`, variant: 'destructive' });
                } finally {
                  setReprojecting(null);
                }
              }}
              className="bg-pl-warning-bg hover:bg-pl-warning text-pl-text"
            >
              {reprojecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reproject everything to the new CRS
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
