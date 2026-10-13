// Site targets (WD1): CRUD on wp_targets. Point and circle kinds ship
// now; ellipse/polygon geometry, geological-vs-driller derivation and
// the geo-registry pickers arrive with WD2. Coordinates are site-CRS
// metres at TVDSS.

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil, Download, Search, Map as MapIcon, Table as TableIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { useWellPlanningStore } from '../state/WellPlanningStore';
import { saveTarget, updateTarget, deleteTarget } from '../services/wpApi';
import TargetDialog from '../components/TargetDialog';
import TargetFromRegistryDialog from '../components/TargetFromRegistryDialog';
import TargetsMap from '../components/TargetsMap';
import { listWellsWithTops } from '@/lib/wellsRegistry';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { useSourceFreshness } from '@/lib/sourceFreshness/useSourceFreshness';
import SourceChangedNotice from '@/lib/sourceFreshness/SourceChangedNotice';
import { useTargetDepthUnit, mToUnit, showDepth } from '../services/depthUnits';
import { targetSourceRefs, targetKept, readTargetSources, refreshTargetPatch } from '../services/targetSources';

// Source freshness (2026-10-12): the registry readers the pickers use
const REGISTRY_READERS = { listWellsWithTops, listSurfaces, downloadSurfaceGrid };
let sharingStore = null;
const names = (ids) => { sharingStore = sharingStore || supabaseSharingStore(); return sharingStore.names(ids); };

const TargetsTab = () => {
  const { site, wellbores, targets, refreshTargets, user } = useWellPlanningStore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('table');
  const [dialogTarget, setDialogTarget] = useState(undefined); // undefined closed, null new, object edit
  const [pickerMode, setPickerMode] = useState(null); // 'tops' | 'surface' | null
  // 2026-10-13: TVDSS and radius in the unit profile's depth unit (stored metres)
  const du = useTargetDepthUnit();

  const filtered = useMemo(() => (targets || []).filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
  ), [targets, search]);

  const mapTargets = useMemo(() => filtered.map((t) => ({
    ...t,
    x: t.center_x,
    y: t.center_y,
    target_data: { tolerance_radius: t.geometry?.radius_m || 0 },
  })), [filtered]);

  // Source freshness: targets picked from a top or a surface, checked on open and on demand
  const sourceRefs = useMemo(() => targetSourceRefs(targets), [targets]);
  const kept = useMemo(() => targetKept(targets), [targets]);
  const resolveSources = useCallback((refs) => readTargetSources(refs, REGISTRY_READERS), []);
  const sources = useSourceFreshness({ refs: sourceRefs, resolve: resolveSources, kept, names });
  const changedTargets = useMemo(() => new Set(sources.items.map((i) => i.ref?.target_id)), [sources.items]);

  const refreshFromSource = async (item) => {
    const t = (targets || []).find((x) => x.id === item.ref.target_id);
    if (!t) return;
    const patch = await refreshTargetPatch(item, t, REGISTRY_READERS);
    await updateTarget(t.id, patch);
    await refreshTargets(site.id);
    toast({ title: 'Target refreshed', description: `${t.name} read again from the registry.` });
  };
  const keepCurrent = async (item) => {
    const t = (targets || []).find((x) => x.id === item.ref.target_id);
    if (!t || !item.token) return;
    try {
      const prov = t.provenance || {};
      await updateTarget(t.id, { provenance: { ...prov, kept: { ...(prov.kept || {}), [item.ref.part]: item.token } } });
      await refreshTargets(site.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const wellLocation = useMemo(() => {
    const w = wellbores.find((x) => Number.isFinite(x.head_x));
    return w ? { x: w.head_x, y: w.head_y, name: w.name } : null;
  }, [wellbores]);

  const handleSave = async (payload) => {
    try {
      if (dialogTarget?.id) {
        await updateTarget(dialogTarget.id, payload);
      } else {
        await saveTarget({ ...payload, site_id: site.id }, user.id);
      }
      await refreshTargets(site.id);
      toast({ title: 'Target saved' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
      throw e;
    }
  };

  const handleDelete = async (t) => {
    try {
      await deleteTarget(t.id);
      await refreshTargets(site.id);
      toast({ title: 'Target deleted' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  const handleExport = () => {
    const csv = Papa.unparse(filtered.map((t) => ({
      Name: t.name,
      Kind: t.kind,
      Category: t.category,
      Easting_m: t.center_x,
      Northing_m: t.center_y,
      TVDSS_m: t.tvdss_m,
      Radius_m: t.geometry?.radius_m ?? '',
      ...(du === 'ft' ? {
        TVDSS_ft: mToUnit(t.tvdss_m, 'ft')?.toFixed(2) ?? '',
        Radius_ft: t.geometry?.radius_m != null ? mToUnit(t.geometry.radius_m, 'ft').toFixed(2) : '',
      } : {}),
      Dip_deg: t.dip_deg ?? '',
      DipAzimuth_deg: t.dip_azimuth_deg ?? '',
      Source: t.provenance?.source || 'manual',
      Notes: t.notes || '',
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${site?.name || 'site'}-targets.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!site) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-pl-muted">
        Select a site to manage its targets.
      </div>
    );
  }

  const own = site.user_id === user?.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-pl-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search targets..." className="h-8 w-full sm:w-64 pl-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded bg-pl-sunken p-1">
            <Button variant="ghost" size="sm" onClick={() => setView('table')} className={`h-7 px-3 text-xs ${view === 'table' ? 'bg-pl-surface text-pl-text shadow-pl-sm' : 'text-pl-muted'}`}><TableIcon className="mr-1 h-3 w-3" /> Table</Button>
            <Button variant="ghost" size="sm" onClick={() => setView('map')} className={`h-7 px-3 text-xs ${view === 'map' ? 'bg-pl-surface text-pl-text shadow-pl-sm' : 'text-pl-muted'}`}><MapIcon className="mr-1 h-3 w-3" /> Map</Button>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!filtered.length} className="h-8 text-xs"><Download className="mr-1 h-3 w-3" /> CSV</Button>
          {own && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPickerMode('tops')} className="h-8 text-xs">From top</Button>
              <Button size="sm" variant="outline" onClick={() => setPickerMode('surface')} className="h-8 text-xs">From surface</Button>
              <Button size="sm" onClick={() => setDialogTarget(null)} className="h-8 text-xs"><Plus className="mr-1 h-3 w-3" /> New target</Button>
            </>
          )}
        </div>
      </div>

      {sourceRefs.length > 0 && (
        <SourceChangedNotice
          items={sources.items.map((i) => ({ ...i, ref: { ...i.ref, name: `${i.ref.name || i.ref.id}, under target ${i.ref.target_name}` } }))}
          checking={sources.checking}
          checkedAt={sources.checkedAt}
          error={sources.error}
          onCheck={sources.check}
          onRefresh={refreshFromSource}
          onKeep={keepCurrent}
          canEdit={own}
          readOnlyText="Only the owner of this site can refresh its targets or keep their values."
          title="Registry source changed"
          testId="wd-source-changed"
          usedBy="the target"
        />
      )}

      {view === 'table' ? (
        <div className="rounded-lg border border-pl-border bg-pl-surface">
          <Table>
            <TableHeader className="bg-pl-sunken">
              <TableRow className="border-pl-border">
                <TableHead className="text-pl-text">Name</TableHead>
                <TableHead className="text-pl-text">Kind</TableHead>
                <TableHead className="text-pl-text">Category</TableHead>
                <TableHead className="text-pl-text text-right">Easting (m)</TableHead>
                <TableHead className="text-pl-text text-right">Northing (m)</TableHead>
                <TableHead className="text-pl-text text-right">TVDSS ({du})</TableHead>
                <TableHead className="text-pl-text text-right">Radius ({du})</TableHead>
                <TableHead className="text-pl-text">Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="border-pl-border hover:bg-pl-sunken">
                  <TableCell className="font-medium text-pl-text">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: t.color || '#d97706' }} />
                    {t.name}
                  </TableCell>
                  <TableCell className="capitalize text-pl-muted">{t.kind}</TableCell>
                  <TableCell className="capitalize text-pl-muted">{t.category}</TableCell>
                  <TableCell className="text-right font-mono text-pl-text">{t.center_x?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-pl-text">{t.center_y?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-pl-text">{showDepth(t.tvdss_m, du, 1)}</TableCell>
                  <TableCell className="text-right font-mono text-pl-muted">{showDepth(t.geometry?.radius_m, du, du === 'ft' ? 0 : 1)}</TableCell>
                  <TableCell className="text-xs text-pl-muted">
                    {t.provenance?.source || 'manual'}
                    {changedTargets.has(t.id) && (
                      <span className="ml-1 rounded-full border border-pl-warning/40 bg-pl-warning-bg px-1.5 py-0.5 text-[10px] text-pl-warning-text" data-testid={`wd-target-stale-${t.id}`} title="The registry source of this target changed after it was picked. Refresh it or keep its values.">source changed</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {own && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-text" onClick={() => setDialogTarget(t)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text" onClick={() => handleDelete(t)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-pl-muted">No targets on this site yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="h-[60vh] overflow-hidden rounded-lg border border-pl-border">
          <TargetsMap targets={mapTargets} wellLocation={wellLocation} onTargetSelect={(t) => own && setDialogTarget(targets.find((x) => x.id === t.id))} />
        </div>
      )}

      {dialogTarget !== undefined && (
        <TargetDialog
          open
          onOpenChange={(o) => { if (!o) setDialogTarget(undefined); }}
          target={dialogTarget}
          onSave={handleSave}
          depthUnit={du}
        />
      )}

      {pickerMode && (
        <TargetFromRegistryDialog
          open
          mode={pickerMode}
          onOpenChange={(o) => { if (!o) setPickerMode(null); }}
          onPick={async (payload) => {
            try {
              await saveTarget({ ...payload, site_id: site.id }, user.id);
              await refreshTargets(site.id);
              toast({ title: 'Target created', description: `${payload.name} from the ${payload.provenance.source === 'geo_top' ? 'well registry' : 'surface registry'}.` });
            } catch (e) {
              toast({ variant: 'destructive', title: 'Save failed', description: e.message });
            }
          }}
        />
      )}
    </div>
  );
};

export default TargetsTab;
