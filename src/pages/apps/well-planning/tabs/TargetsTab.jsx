// Site targets (WD1): CRUD on wp_targets. Point and circle kinds ship
// now; ellipse/polygon geometry, geological-vs-driller derivation and
// the geo-registry pickers arrive with WD2. Coordinates are site-CRS
// metres at TVDSS.

import React, { useState, useMemo } from 'react';
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

const TargetsTab = () => {
  const { site, wellbores, targets, refreshTargets, user } = useWellPlanningStore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('table');
  const [dialogTarget, setDialogTarget] = useState(undefined); // undefined closed, null new, object edit
  const [pickerMode, setPickerMode] = useState(null); // 'tops' | 'surface' | null

  const filtered = useMemo(() => (targets || []).filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
  ), [targets, search]);

  const mapTargets = useMemo(() => filtered.map((t) => ({
    ...t,
    x: t.center_x,
    y: t.center_y,
    target_data: { tolerance_radius: t.geometry?.radius_m || 0 },
  })), [filtered]);

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
      toast({ title: 'Target saved', className: 'bg-green-600 text-white' });
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
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        Select a site to manage its targets.
      </div>
    );
  }

  const own = site.user_id === user?.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-slate-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search targets..." className="h-8 w-64 bg-slate-900 border-slate-700 pl-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded bg-slate-800 p-1">
            <Button variant="ghost" size="sm" onClick={() => setView('table')} className={`h-7 px-3 text-xs ${view === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><TableIcon className="mr-1 h-3 w-3" /> Table</Button>
            <Button variant="ghost" size="sm" onClick={() => setView('map')} className={`h-7 px-3 text-xs ${view === 'map' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><MapIcon className="mr-1 h-3 w-3" /> Map</Button>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!filtered.length} className="h-8 border-slate-600 text-slate-300 text-xs"><Download className="mr-1 h-3 w-3" /> CSV</Button>
          {own && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPickerMode('tops')} className="h-8 border-emerald-700 text-emerald-300 text-xs">From top</Button>
              <Button size="sm" variant="outline" onClick={() => setPickerMode('surface')} className="h-8 border-emerald-700 text-emerald-300 text-xs">From surface</Button>
              <Button size="sm" onClick={() => setDialogTarget(null)} className="h-8 bg-[#4CAF50] hover:bg-[#43a047] text-white text-xs"><Plus className="mr-1 h-3 w-3" /> New target</Button>
            </>
          )}
        </div>
      </div>

      {view === 'table' ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900">
          <Table>
            <TableHeader className="bg-slate-800/70">
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-300">Name</TableHead>
                <TableHead className="text-slate-300">Kind</TableHead>
                <TableHead className="text-slate-300">Category</TableHead>
                <TableHead className="text-slate-300 text-right">Easting (m)</TableHead>
                <TableHead className="text-slate-300 text-right">Northing (m)</TableHead>
                <TableHead className="text-slate-300 text-right">TVDSS (m)</TableHead>
                <TableHead className="text-slate-300 text-right">Radius (m)</TableHead>
                <TableHead className="text-slate-300">Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="border-slate-800 hover:bg-slate-800/40">
                  <TableCell className="font-medium text-slate-200">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: t.color || '#d97706' }} />
                    {t.name}
                  </TableCell>
                  <TableCell className="capitalize text-slate-400">{t.kind}</TableCell>
                  <TableCell className="capitalize text-slate-400">{t.category}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{t.center_x?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{t.center_y?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{t.tvdss_m?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-400">{t.geometry?.radius_m ?? ''}</TableCell>
                  <TableCell className="text-xs text-slate-500">{t.provenance?.source || 'manual'}</TableCell>
                  <TableCell className="text-right">
                    {own && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-white" onClick={() => setDialogTarget(t)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => handleDelete(t)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">No targets on this site yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="h-[60vh] overflow-hidden rounded-lg border border-slate-800">
          <TargetsMap targets={mapTargets} wellLocation={wellLocation} onTargetSelect={(t) => own && setDialogTarget(targets.find((x) => x.id === t.id))} />
        </div>
      )}

      {dialogTarget !== undefined && (
        <TargetDialog
          open
          onOpenChange={(o) => { if (!o) setDialogTarget(undefined); }}
          target={dialogTarget}
          onSave={handleSave}
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
              toast({ title: 'Target created', description: `${payload.name} from the ${payload.provenance.source === 'geo_top' ? 'well registry' : 'surface registry'}.`, className: 'bg-green-600 text-white' });
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
