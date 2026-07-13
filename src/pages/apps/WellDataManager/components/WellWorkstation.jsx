// Well Data Manager workspace controller (workstation-lite on the
// shared WorkspaceShell): wells tree on the left, map / well-detail
// tabs in the center, a slim tool strip on top and a status bar below.
// Owns all app state; every data touch goes through the injected
// backend so the /dev harness runs the identical app on
// makeInMemoryBackend with no auth or DB (the harness philosophy).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Loader2, Map as MapIcon, CircleDot } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import WellsTree from './WellsTree';
import WellsMap from './WellsMap';
import WellDetail from './WellDetail';
import LasImportDialog from './LasImportDialog';
import AddWellDialog from './AddWellDialog';
import DeleteWellDialog from './DeleteWellDialog';

export default function WellWorkstation({ backend }) {
  const [wells, setWells] = useState(null);       // null = first load
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);     // well with an in-flight action
  const [view, setView] = useState('map');        // 'map' | 'detail'
  const [status, setStatus] = useState('Ready.');
  const [lasOpen, setLasOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState(null); // well pending delete confirm
  const [orgId, setOrgId] = useState(undefined);  // undefined = resolving

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
    backend.myOrgId().then(setOrgId).catch(() => setOrgId(null));
  }, [backend]);

  const list = wells || [];
  const selected = list.find((w) => w.id === selectedId) || null;
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
      setStatus('You belong to no organization — nothing to share with.');
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

  const onImported = async ({ wellId, nLogs, fileName }) => {
    setStatus(`Imported ${nLogs} log${nLogs === 1 ? '' : 's'} from ${fileName}.`);
    await refresh();
    select(wellId);
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <Database className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Well Data Manager</span>
      <span className="text-[11px] text-slate-500">shared subsurface well registry</span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid="wdm-view-map"
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border
            ${view === 'map'
              ? 'border-cyan-500/60 text-cyan-300'
              : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('map')}
        >
          <MapIcon className="w-3.5 h-3.5" /> Map
        </button>
        <button
          type="button"
          data-testid="wdm-view-detail"
          disabled={!selected}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border disabled:opacity-40
            ${view === 'detail'
              ? 'border-cyan-500/60 text-cyan-300'
              : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
          onClick={() => setView('detail')}
        >
          <CircleDot className="w-3.5 h-3.5" /> {selected ? selected.name : 'Well'}
        </button>
      </div>
    </div>
  );

  const statusBar = (
    <div
      className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800
        text-[11px] text-slate-400"
      data-testid="wdm-status"
    >
      <span data-testid="wdm-status-message" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap">
        {list.length} well{list.length === 1 ? '' : 's'}
        {orgId === null ? ' · no organization' : ''}
      </span>
      <span className="whitespace-nowrap text-slate-600">SI internal (m)</span>
    </div>
  );

  const center = wells === null ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…
    </div>
  ) : (
    <div className="h-full min-h-0 overflow-auto">
      {view === 'map' || !selected ? (
        <div className="p-3">
          <WellsMap wells={list} selectedId={selectedId} onSelect={select} />
        </div>
      ) : (
        <WellDetail backend={backend} well={selected} onStatus={setStatus} />
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
            search={search}
            onSearch={setSearch}
            selectedId={selectedId}
            busyId={busyId}
            onSelect={select}
            onShareToggle={shareToggle}
            onDelete={setDeleting}
            onImportLas={() => setLasOpen(true)}
            onAddWell={() => setAddOpen(true)}
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
    </>
  );
}
