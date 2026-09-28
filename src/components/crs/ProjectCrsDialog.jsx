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
import { useThemeClass } from '@/lib/themeClass';

// Design system: themed class strings for tc() (see src/lib/themeClass.js).
// Outside an opted-in scope tc() returns the legacy string unchanged.
const THEMED_CLASSES = {
  "bg-slate-900 border-slate-700 text-slate-200 max-w-lg":
    "bg-pl-sunken border-pl-border text-pl-text max-w-lg",
  "flex items-center text-white":
    "flex items-center text-pl-text",
  "w-5 h-5 mr-2 text-cyan-400":
    "w-5 h-5 mr-2 text-pl-primary-text",
  "text-slate-400":
    "text-pl-muted",
  "flex items-center text-slate-400 text-sm py-4":
    "flex items-center text-pl-muted text-sm py-4",
  "text-slate-300":
    "text-pl-text",
  "rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-300 flex items-start":
    "rounded-lg border border-pl-warning/50 bg-pl-warning-bg p-3 text-sm text-pl-warning-text flex items-start",
  "border-amber-700/60 text-amber-300 hover:bg-amber-500/10":
    "border-pl-warning/60 text-pl-warning-text hover:bg-pl-warning-bg",
  "flex items-center text-sm text-cyan-300":
    "flex items-center text-sm text-pl-primary-text",
  "rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-300 space-y-1":
    "rounded-lg border border-pl-success/50 bg-pl-success-bg p-3 text-sm text-pl-success-text space-y-1",
  "text-amber-300":
    "text-pl-warning-text",
  "bg-cyan-600 hover:bg-cyan-500 text-white":
    "bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg",
  "bg-amber-600 hover:bg-amber-500 text-white":
    "bg-pl-warning-bg hover:bg-pl-warning text-pl-text",
};

/**
 * View and set the Project CRS (Petrel model): the one system all
 * geoscience imports convert into. Free to change while no CRS-tagged
 * data exists; locked with per-registry counts afterwards.
 *
 * @param {{open: boolean, onOpenChange: (o: boolean) => void,
 *   onChanged?: (p: {tag: string, name: ?string}) => void}} p
 */
export default function ProjectCrsDialog({ open, onOpenChange, onChanged }) {
  const tc = useThemeClass(THEMED_CLASSES);
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
      <DialogContent className={tc("bg-slate-900 border-slate-700 text-slate-200 max-w-lg")}>
        <DialogHeader>
          <DialogTitle className={tc("flex items-center text-white")}>
            <Globe2 className={tc("w-5 h-5 mr-2 text-cyan-400")} />
            Project coordinate reference system
          </DialogTitle>
          <DialogDescription className={tc("text-slate-400")}>
            Every import converts into this system, so wells, seismic and
            surfaces always share one frame. This is the same role the
            project CRS plays in Petrel.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className={tc("flex items-center text-slate-400 text-sm py-4")}>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={tc("text-slate-400")}>Current:</span>
              <CrsBadge tag={current?.tag} name={current?.name} />
              {current?.name && <span className={tc("text-slate-300")}>{current.name}</span>}
            </div>

            {locked && (
              <div className={tc("rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-300 flex items-start")}>
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
                className={tc("border-amber-700/60 text-amber-300 hover:bg-amber-500/10")}
                onClick={() => { setChoice(null); setReprojectOpen(true); }}
              >
                Change Project CRS and reproject the data…
              </Button>
            )}

            {reprojecting && (
              <div className={tc("flex items-center text-sm text-cyan-300")}>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reprojecting {reprojecting.step}
                {reprojecting.total > 1 ? ` (${reprojecting.done + 1} of ${reprojecting.total})` : ''}…
              </div>
            )}

            {report && (
              <div className={tc("rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-300 space-y-1")}>
                <div>
                  Reprojection complete: {report.wells.converted} wells, {report.surfaces.converted} surfaces,
                  {' '}{report.volumes.converted} seismic volumes, {report.models.converted} models converted.
                </div>
                {report.skippedNames.length > 0 && (
                  <div className={tc("text-amber-300")}>
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
              className={tc("bg-cyan-600 hover:bg-cyan-500 text-white")}
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
              className={tc("bg-amber-600 hover:bg-amber-500 text-white")}
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
