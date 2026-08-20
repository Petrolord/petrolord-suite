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
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Globe2 className="w-5 h-5 mr-2 text-cyan-400" />
            Project coordinate reference system
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Every import converts into this system, so wells, seismic and
            surfaces always share one frame. This is the same role the
            project CRS plays in Petrel.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Current:</span>
              <CrsBadge tag={current?.tag} name={current?.name} />
              {current?.name && <span className="text-slate-300">{current.name}</span>}
            </div>

            {locked && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-300 flex items-start">
                <Lock className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <div>
                  The Project CRS is locked: {counts.total} dataset(s) are already stored in it
                  {['geo_wells', 'geo_surfaces', 'seismic_volumes', 'em_models']
                    .filter((t) => counts[t] > 0)
                    .map((t) => ` ${counts[t]} in ${t.replace('geo_', '').replace('_', ' ')}`)
                    .join(',')}.
                  Changing it will require reprojecting that data (coming with the
                  reproject flow); until then the setting stays as it is.
                </div>
              </div>
            )}

            {!locked && (
              <CrsPicker
                value={choice?.tag}
                customDefs={current?.customDefs || {}}
                onChange={onPick}
                allowSentinels={false}
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!locked && (
            <Button
              disabled={loading || saving || !choice}
              onClick={save}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set Project CRS
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
