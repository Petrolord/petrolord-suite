// Petrophysics Studio workspace controller (G2.3) on the shared
// WorkspaceShell: registry wells + curve inventory on the left, the
// multi-track viewer in the center, parameters + zones in the right
// dock, status bar below. Owns all state; every data touch goes
// through the injected backend so /dev/petrophysics-studio runs the
// identical app on makeInMemoryBackend (no auth/DB).
//
// Compute is a pure preview: curves + params -> engine/pipeline.js on
// the main thread (closed-form per-sample math; ~100k samples in low
// ms). Publishing results to the registry is G2.5.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import ParameterPanel from './ParameterPanel';
import ZoneManager from './ZoneManager';
import TrackViewer from './TrackViewer';
import { computeWell, zoneSummary, DEFAULT_PARAMS } from '../engine/pipeline';

// standard pipeline inputs <- registry mnemonics (base name, ':n'
// duplicate suffixes ignored; first match wins)
const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD'],
  GR: ['GR', 'SGR', 'CGR', 'GRC'],
  RHOB: ['RHOB', 'DEN', 'ZDEN'],
  NPHI: ['NPHI', 'TNPH', 'CNC', 'NPOR'],
  DT: ['DT', 'DTC', 'AC', 'DTCO'],
  RT: ['RT', 'RES', 'ILD', 'LLD', 'RDEP', 'RD'],
};

function mapLogs(logs) {
  const byBase = new Map();
  for (const log of logs) {
    const base = log.mnemonic.toUpperCase().split(':')[0];
    if (!byBase.has(base)) byBase.set(base, log);
  }
  const mapped = {};
  for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
    const hit = aliases.find((a) => byBase.has(a));
    mapped[key] = hit ? byBase.get(hit) : null;
  }
  return mapped;
}

export default function PetroWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [wellData, setWellData] = useState(null); // {wellId, curves, inventory, tops}
  const [zones, setZones] = useState([]);
  const [zonesBusy, setZonesBusy] = useState(false);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);

  useEffect(() => {
    backend.listWells()
      .then(setWells)
      .catch((e) => { setStatus(e.message); setWells([]); });
  }, [backend]);

  const selected = (wells || []).find((w) => w.id === selectedId) || null;

  const refreshZones = useCallback(async (wellId) => {
    setZonesBusy(true);
    try {
      setZones(await backend.listZones(wellId));
    } catch (e) {
      setStatus(e.message);
      setZones([]);
    } finally {
      setZonesBusy(false);
    }
  }, [backend]);

  const select = useCallback(async (wellId) => {
    setSelectedId(wellId);
    setLoadingId(wellId);
    setWellData(null);
    setZones([]);
    try {
      const [logs, tops] = await Promise.all([backend.listLogs(wellId), backend.listTops(wellId)]);
      const mapped = mapLogs(logs);
      if (!mapped.DEPT) throw new Error('This well has no depth curve — import LAS logs in Well Data Manager first.');
      const curves = {};
      for (const [key, log] of Object.entries(mapped)) {
        if (log) curves[key] = await backend.downloadCurve(log);
      }
      setWellData({
        wellId,
        curves,
        inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })),
        tops,
      });
      await refreshZones(wellId);
      setStatus(`Loaded ${Object.keys(curves).length} curves.`);
    } catch (e) {
      setStatus(e.message);
      setWellData(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend, refreshZones]);

  const computed = useMemo(() => {
    if (!wellData) return null;
    try {
      return computeWell(wellData.curves, params);
    } catch (e) {
      setStatus(e.message);
      return null;
    }
  }, [wellData, params]);

  const summaries = useMemo(() => {
    if (!wellData || !computed) return {};
    const out = {};
    for (const z of zones) {
      out[z.id] = zoneSummary(wellData.curves, computed.outputs, params, z);
    }
    return out;
  }, [wellData, computed, params, zones]);

  const tracks = useMemo(() => {
    if (!wellData || !computed) return [];
    const c = wellData.curves;
    const o = computed.outputs;
    const t = [];
    if (c.GR) t.push({ key: 'gr', title: 'GR (API)', min: 0, max: 150, curves: [{ name: 'GR', data: c.GR, color: '#34d399' }] });
    if (c.RT) t.push({ key: 'rt', title: 'RT (ohm·m)', scale: 'log', min: 0.2, max: 2000, curves: [{ name: 'RT', data: c.RT, color: '#f87171' }] });
    const phiCurves = [];
    if (o.PHIE) phiCurves.push({ name: 'φe', data: o.PHIE, color: '#22d3ee' });
    if (c.NPHI) phiCurves.push({ name: 'NPHI', data: c.NPHI, color: '#a78bfa' });
    if (phiCurves.length) t.push({ key: 'phi', title: 'Porosity (v/v)', min: 0, max: 0.5, curves: phiCurves });
    if (o.VSH) t.push({ key: 'vsh', title: 'Vsh (v/v)', min: 0, max: 1, curves: [{ name: 'Vsh', data: o.VSH, color: '#a3a065', fillTo: 'right' }] });
    if (o.SW) t.push({ key: 'sw', title: 'Sw (v/v)', min: 0, max: 1, curves: [{ name: 'Sw', data: o.SW, color: '#60a5fa' }] });
    if (o.PAY) t.push({ key: 'pay', title: 'Pay', min: 0, max: 1, curves: [{ name: 'pay', data: o.PAY, color: '#4ade80', fillTo: 'left' }] });
    return t;
  }, [wellData, computed]);

  const addZone = async (z) => {
    const zone = await backend.saveZone(wellData.wellId, z);
    setStatus(`Added zone ${zone.name}.`);
    await refreshZones(wellData.wellId);
  };

  const deleteZone = async (zone) => {
    try {
      await backend.deleteZone(zone);
      setStatus(`Deleted zone ${zone.name}.`);
      await refreshZones(zone.well_id);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <FlaskConical className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Petrophysics Studio</span>
      <span className="text-[11px] text-slate-500">log analysis on the shared well registry</span>
      <button
        type="button"
        data-testid="petro-toggle-dock"
        className={`ml-auto px-2 py-1 text-xs rounded border
          ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
        onClick={() => setDockOpen((v) => !v)}
      >
        Parameters & zones
      </button>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="petro-status" className="truncate">{status}</span>
      {computed?.missing.length ? (
        <span className="text-amber-400/90" data-testid="petro-missing">
          missing: {computed.missing.join(', ')}
        </span>
      ) : null}
      <span className="ml-auto whitespace-nowrap">
        {selected ? `${selected.name} · ${wellData?.curves.DEPT?.length ?? '…'} samples` : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-slate-600">SI internal (m)</span>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry wells…
    </div>
  ) : !selected ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="petro-empty">
      Select a well to start interpreting.
    </div>
  ) : !wellData ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading curves…
    </div>
  ) : (
    <TrackViewer depth={wellData.curves.DEPT} tracks={tracks} zones={zones} tops={wellData.tops} />
  );

  return (
    <WorkspaceShell
      autoSaveId="petrophysicsstudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <WellExplorer
          wells={wells || []}
          selectedId={selectedId}
          loadingId={loadingId}
          curveInventory={wellData?.inventory}
          onSelect={select}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <ParameterPanel params={params} onApply={(p) => { setParams(p); setStatus('Parameters applied.'); }} />
          {wellData && (
            <ZoneManager
              zones={zones}
              summaries={summaries}
              isOwn={!!selected?.is_own}
              busy={zonesBusy}
              onAdd={addZone}
              onDelete={deleteZone}
            />
          )}
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
