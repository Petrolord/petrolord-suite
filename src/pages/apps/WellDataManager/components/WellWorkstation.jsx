// Well Data Manager workspace controller (workstation-lite on the
// shared WorkspaceShell): wells tree on the left, map / well-detail
// tabs in the center, a slim tool strip on top and a status bar below.
// Owns all app state; every data touch goes through the injected
// backend so the /dev harness runs the identical app on
// makeInMemoryBackend with no auth or DB (the harness philosophy).

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Loader2, Map as MapIcon, CircleDot, ClipboardList } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { OpenInAppMenu } from '@/components/wells/OpenInAppMenu';
import WellsTree from './WellsTree';
import WellsMap from './WellsMap';
import WellDetail from './WellDetail';
import InventoryView from './InventoryView';
import LasImportDialog from './LasImportDialog';
import AddWellDialog from './AddWellDialog';
import DeleteWellDialog from './DeleteWellDialog';
import PackageExportDialog from '@/components/portability/PackageExportDialog';
import PackageImportDialog from '@/components/portability/PackageImportDialog';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { readDisplayUnit, writeDisplayUnit, unitText } from '../engine/displayUnits';

/** @param {Object} [p.appPaths] route overrides for the "Open in" launchers
 *  (the harness points them at the other /dev harnesses) */
export default function WellWorkstation({ backend, appPaths = {} }) {
  // deep link (PT1): ?well=<id>&tab=<header|logs|tops|deviation|checkshots>
  // selects the well once the list has loaded (Petrophysics links here)
  const [searchParams] = useSearchParams();
  const deepLinkRef = useRef({ well: searchParams.get('well'), tab: searchParams.get('tab'), done: false });
  const [wells, setWells] = useState(null);       // null = first load
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);     // well with an in-flight action
  const [view, setView] = useState('map');        // 'map' | 'detail' | 'inventory'
  const [status, setStatus] = useState('Ready.');
  const [lasOpen, setLasOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detailNonce, setDetailNonce] = useState(0); // reload the detail view after an import into the selected well
  const [deleting, setDeleting] = useState(null); // well pending delete confirm
  const [orgId, setOrgId] = useState(undefined);  // undefined = resolving
  // WDM-U2-001: display depth unit, remembered per user on this device
  const userId = useContext(AuthContext)?.user?.id || null;
  const [unit, setUnitState] = useState(() => readDisplayUnit(userId));
  useEffect(() => { setUnitState(readDisplayUnit(userId)); }, [userId]);
  const setUnit = (u) => { setUnitState(u); writeDisplayUnit(userId, u); };

  const refresh = useCallback(async () => {
    try {
      setWells(await backend.listWells());
    } catch (e) {
      setStatus(e.message);
      setWells((w) => w || []);
    }
  }, [backend]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !dl.well || !wells) return;
    dl.done = true;
    if (wells.some((w) => w.id === dl.well)) { setSelectedId(dl.well); setView('detail'); }
  }, [wells]);  

  // PT1: the detail view edited the well row; reload the list so the row
  // it renders is fresh, and bump the detail so its children reload too
  const onWellChanged = useCallback(async () => {
    await refresh();
    setDetailNonce((n) => n + 1);
  }, [refresh]);
  useEffect(() => {
    backend.myOrgId().then(setOrgId).catch(() => setOrgId(null));
  }, [backend]);

  const list = wells || [];
  const selected = list.find((w) => w.id === selectedId) || null;
  const selectedName = selected?.name ?? null;
  const packagePreselect = useMemo(
    () => (selectedId ? { wells: [selectedId], name: selectedName } : { wells: [] }),
    [selectedId, selectedName],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.name.toLowerCase().includes(q)
      || (w.uwi || '').toLowerCase().includes(q));
  }, [list, search]);

  const select = (id) => {
    setSelectedId(id);
    setView('detail');
  };

  const shareToggle = async (well) => {
    if (orgId === null) {
      setStatus('You belong to no organization, so there is nothing to share with.');
      return;
    }
    setBusyId(well.id);
    try {
      if (well.organization_id) {
        await backend.unshareWell(well.id);
        setStatus(`${well.name} is private again.`);
      } else {
        await backend.shareWell(well.id);
        setStatus(`${well.name} shared with your organization (read-only for members).`);
      }
      await refresh();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onImported = async ({ wellId, nLogs, nCurves, fileName, note }) => {
    // WDM-U1-015: count curves the way the import preview did (depth apart)
    const n = nCurves ?? nLogs;
    const depthNote = nCurves != null && nLogs > nCurves ? ' and the depth index' : '';
    setStatus(`Imported ${n} curve${n === 1 ? '' : 's'}${depthNote} from ${fileName}${note ? ` (${note})` : ''}.`);
    await refresh();
    select(wellId);
    setDetailNonce((n) => n + 1);
  };

  const onPackageImported = async (summary) => {
    setStatus(`Imported ${summary.rowsWritten} rows and ${summary.blobsWritten} files.`);
    await refresh();
  };

  const onAdded = async (well) => {
    setStatus(`Added well ${well.name}.`);
    await refresh();
    select(well.id);
  };

  const onDeleted = async (well) => {
    setStatus(`Deleted ${well.name}.`);
    if (selectedId === well.id) {
      setSelectedId(null);
      setView('map');
    }
    await refresh();
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" testId="wdm-home" />
      <Database className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text">Well Data Manager</span>
      <span className="text-[11px] text-pl-muted">shared subsurface well registry</span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid="wdm-view-map"
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border
            ${view === 'map'
              ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text'
              : 'border-pl-border text-pl-muted hover:text-pl-text'}`}
          onClick={() => setView('map')}
        >
          <MapIcon className="w-3.5 h-3.5" /> Map
        </button>
        <button
          type="button"
          data-testid="wdm-view-inventory"
          title="Every well against its logs, tops, survey, checkshots, CRS and KB, with QC flags"
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border
            ${view === 'inventory'
              ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text'
              : 'border-pl-border text-pl-muted hover:text-pl-text'}`}
          onClick={() => setView('inventory')}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Inventory
        </button>
        <button
          type="button"
          data-testid="wdm-view-detail"
          disabled={!selected}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border disabled:opacity-40
            ${view === 'detail'
              ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text'
              : 'border-pl-border text-pl-muted hover:text-pl-text'}`}
          onClick={() => setView('detail')}
        >
          <CircleDot className="w-3.5 h-3.5" /> {selected ? selected.name : 'Well'}
        </button>
        <OpenInAppMenu wellIds={selectedId ? [selectedId] : []} paths={appPaths} testIdPrefix="wdm" disabled={!selected} />
        <label className="flex items-center gap-1 text-[11px] text-pl-muted" title="Depth unit for every table, editor, plot and export. The registry stores metres.">
          Depths in
          <select className="rounded border border-pl-border bg-pl-surface text-pl-text px-1 py-0.5 text-xs" value={unit}
            onChange={(e) => setUnit(e.target.value)} data-testid="wdm-units">
            <option value="m">metres</option>
            <option value="ft">feet</option>
          </select>
        </label>
        <ThemeToggle />
      </div>
    </div>
  );

  const statusBar = (
    <div
      className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border
        text-[11px] text-pl-muted"
      data-testid="wdm-status"
    >
      <span data-testid="wdm-status-message" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap">
        {list.length} well{list.length === 1 ? '' : 's'}
        {orgId === null ? ' · no organization' : ''}
      </span>
      <span className="whitespace-nowrap text-pl-muted" data-testid="wdm-status-units">Depths in {unitText(unit)} (stored in m)</span>
    </div>
  );

  const center = wells === null ? (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto">
      {view === 'inventory' ? (
        <InventoryView backend={backend} wells={filtered} unit={unit} onOpen={select} onStatus={setStatus} reloadKey={wells} />
      ) : view === 'map' || !selected ? (
        <div className="p-3">
          <WellsMap wells={list} selectedId={selectedId} onSelect={select} />
        </div>
      ) : (
        <WellDetail backend={backend} well={selected} unit={unit} onStatus={setStatus} refreshNonce={detailNonce}
          onWellChanged={onWellChanged} appPaths={appPaths} initialTab={deepLinkRef.current.well === selected.id ? deepLinkRef.current.tab : null} />
      )}
    </div>
  );

  return (
    <>
      <WorkspaceShell
        autoSaveId="welldatamanager.workspace.v1"
        minWidth={960}
        ribbon={ribbon}
        explorer={(
          <WellsTree
            wells={filtered}
            total={list.length}
            unit={unit}
            search={search}
            onSearch={setSearch}
            selectedId={selectedId}
            busyId={busyId}
            appPaths={appPaths}
            onSelect={select}
            onShareToggle={shareToggle}
            onDelete={setDeleting}
            onImportLas={() => setLasOpen(true)}
            onAddWell={() => setAddOpen(true)}
            onExportPackage={() => setPackageOpen(true)}
            onImportPackage={() => setImportOpen(true)}
          />
        )}
        center={center}
        statusBar={statusBar}
      />
      <LasImportDialog
        open={lasOpen}
        onOpenChange={setLasOpen}
        backend={backend}
        wells={list}
        initialTargetId={selectedId}
        unit={unit}
        onDone={onImported}
      />
      <AddWellDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        backend={backend}
        onDone={onAdded}
      />
      <DeleteWellDialog
        well={deleting}
        backend={backend}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        onDone={onDeleted}
      />
      <PackageExportDialog
        open={packageOpen}
        onOpenChange={setPackageOpen}
        preselect={packagePreselect}
        onStatus={setStatus}
      />
      <PackageImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onPackageImported}
        onStatus={setStatus}
      />
    </>
  );
}
