// Wellsite Studio workstation (WS0, 2026-09-07). The controller on an
// injected backend (the local store over Supabase, or over the fake
// transport in the harness): the Geoscience shell with a ribbon (module
// home, views, unit, help), an explorer of live wells, a centre view
// (Live, Config in WS0; Samples, Describe, Shows, Observations, Tops,
// Timeline, Handover, Report arrive with their phases) and a status bar
// with the bit depth, pumps, tour, rig time and the sync state.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Settings, HelpCircle, Loader2, Plus, HardHat, PenLine, ListOrdered } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getDepthUnit } from '@/lib/crs/settingsService';
import { tourAt, toRigLocal, offsetLabel } from '@/lib/wellsite/time';
import { wellContext, offsetMinOf, defaultDepthEntry, tourConfigOf } from '../services/wellContext';
import { readUnits, writeUnits, fmtDepth, DEPTH_UNITS } from '../services/units';
import { currentObservations } from '@/lib/wellsite/records';
import LiveWellView from './LiveWellView';
import ConfigView from './ConfigView';
import DescribeView from './DescribeView';
import { DESCRIPTION_SUBTYPE } from '../services/describe';
import TimelineView from './TimelineView';
import { eventsFromRecords, startEventParams } from '../services/events';
import WellSetup from './WellSetup';

export const VIEWS = [
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'describe', label: 'Describe', icon: PenLine },
  { id: 'timeline', label: 'Timeline', icon: ListOrdered },
  { id: 'config', label: 'Config', icon: Settings },
];

export default function WellsiteWorkstation({ backend, appPaths = {} }) {
  const [searchParams] = useSearchParams();
  const [wells, setWells] = useState(null);
  const [selectedId, setSelectedId] = useState(() => searchParams.get('well') || null);
  const [view, setView] = useState('live');
  const [bitDepths, setBitDepths] = useState([]);
  const [pumpEvents, setPumpEvents] = useState([]);
  const [rigConfig, setRigConfig] = useState(null);
  const [descriptions, setDescriptions] = useState([]);
  const [eventRecords, setEventRecords] = useState([]);
  const [sync, setSync] = useState({ state: 'offline', pending: 0, online: false });
  const [status, setStatus] = useState('Ready.');
  const [loading, setLoading] = useState(0);
  const [units, setUnits] = useState(() => readUnits(typeof localStorage !== 'undefined' ? localStorage : null));
  const [tick, setTick] = useState(0);
  const [user, setUser] = useState(null);
  void appPaths;

  const track = useCallback(async (fn) => { setLoading((n) => n + 1); try { return await fn(); } finally { setLoading((n) => n - 1); } }, []);

  // account depth unit as the fallback (local default first, remote as an enhancement)
  useEffect(() => {
    let alive = true;
    try {
      if (!localStorage.getItem('ws.units')) getDepthUnit().then((u) => { if (alive && DEPTH_UNITS.includes(u)) setUnits({ depth: u }); }).catch(() => {});
    } catch { /* no storage */ }
    return () => { alive = false; };
  }, []);

  const refreshWells = useCallback(async () => {
    try {
      const local = await backend.listWells();
      setWells(local);
      const remote = await backend.refreshWells().catch(() => null);
      if (remote) setWells(remote);
    } catch (e) { setWells([]); setStatus(e.message); }
  }, [backend]);

  useEffect(() => {
    let alive = true;
    track(async () => {
      const u = await backend.currentUser().catch(() => null);
      if (alive) setUser(u);
      await refreshWells();
    });
    return () => { alive = false; };
  }, [backend, refreshWells, track]);

  const well = useMemo(() => (wells || []).find((w) => w.id === selectedId) || null, [wells, selectedId]);
  useEffect(() => { if (!selectedId && wells && wells.length) setSelectedId(wells[0].id); }, [wells, selectedId]);

  const refreshWellData = useCallback(async () => {
    if (!well) { setBitDepths([]); setPumpEvents([]); setRigConfig(null); setDescriptions([]); setEventRecords([]); return; }
    const [bits, pumps, cfg, descs, evs] = await Promise.all([
      backend.listRecords(well.id, { subtype: 'bit_depth' }),
      backend.listRecords(well.id, { subtype: 'pump_rate' }),
      backend.latestRecord(well.id, 'rig_config'),
      backend.listRecords(well.id, { subtype: DESCRIPTION_SUBTYPE }),
      backend.listRecords(well.id, { kind: 'event' }),
    ]);
    setEventRecords(evs);
    setBitDepths(currentObservations(bits));
    setPumpEvents(currentObservations(pumps));
    setDescriptions(currentObservations(descs).sort((a, b) => (a.md_calc_m ?? 0) - (b.md_calc_m ?? 0)));
    setRigConfig(cfg ? cfg.payload : null);
    setSync(await backend.syncStatus(well.id));
  }, [backend, well]);
  useEffect(() => { refreshWellData(); }, [refreshWellData, tick]);
  useEffect(() => backend.subscribeSync(() => setTick((t) => t + 1)), [backend]);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(id); }, []);

  const ctx = useMemo(() => (well ? wellContext(well) : null), [well]);
  const events = useMemo(() => eventsFromRecords(eventRecords), [eventRecords]);
  const startEvent = useCallback(async ({ type, label = null, note = null }) => {
    if (!well) return;
    try {
      const bit = bitDepths[bitDepths.length - 1] || null;
      const { row } = await backend.addRecord(well.id, startEventParams({ type, label, note, bit }));
      setStatus(`${row.payload.label} started at ${toRigLocal(Date.parse(row.occurred_at), offsetMinOf(well)).hhmm}${bit ? ` at ${fmtDepth(bit.md_calc_m, units.depth)}` : ''}.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well, bitDepths, units.depth]);
  const endEvent = useCallback(async (ev) => {
    if (!well) return;
    try {
      await backend.addVersion(ev.record, { endedAt: new Date().toISOString(), payload: ev.record.payload, occurredAt: ev.record.occurred_at });
      setStatus(`${ev.label} ended.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well]);
  const offsetMin = well ? offsetMinOf(well) : 0;
  const latestBit = bitDepths[bitDepths.length - 1] || null;
  const lastPump = pumpEvents[pumpEvents.length - 1] || null;
  const nowMs = Date.now() + tick * 0;
  const tour = well ? tourAt(nowMs, tourConfigOf(well)) : null;
  const rigNow = toRigLocal(nowMs, offsetMin);
  const setUnit = (u) => { const next = { depth: u }; setUnits(next); writeUnits(typeof localStorage !== 'undefined' ? localStorage : null, next); };
  const isMember = true;

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <ModuleHomeLink module="geoscience" testId="ws-home" />
      <HardHat className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Wellsite Studio</span>
      <span className="text-[11px] text-slate-500">the geological record of a live well</span>
      <div className="flex items-center gap-1 ml-4">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" data-testid={`ws-nav-${v.id}`} disabled={!well && v.id !== 'live'}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${view === v.id ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800'} disabled:opacity-40`}
            onClick={() => setView(v.id)}>
            <v.icon className="w-3.5 h-3.5" /> {v.label}
          </button>
        ))}
        <button type="button" data-testid="ws-nav-setup" className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${view === 'setup' ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`} onClick={() => setView('setup')}>
          <Plus className="w-3.5 h-3.5" /> New well
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-slate-400" title="Display unit; the record stores metres">
          Depth
          <select value={units.depth} onChange={(e) => setUnit(e.target.value)} data-testid="ws-unit" className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100">
            {DEPTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <span data-testid="ws-sync-state" data-sync={sync.state} title="Every entry is saved on this device first, then shared when a connection exists"
          className={`px-2 py-0.5 text-[11px] rounded border ${sync.state === 'offline' ? 'border-amber-500/60 text-amber-300' : sync.pending ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>
          {sync.state === 'offline' ? `offline, ${sync.pending} waiting` : sync.pending ? `${sync.pending} to share` : 'shared'}
        </span>
        <Link to="/dashboard/apps/geoscience/wellsite-studio/help" data-testid="ws-help" title="Open the Wellsite Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
      </div>
    </div>
  );

  const explorer = (
    <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-r border-slate-800/60">
      <div className="p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 px-1">Live wells</div>
        {wells === null && <div className="text-xs text-slate-500 px-1">Loading</div>}
        {wells && wells.length === 0 && <div className="text-xs text-slate-500 px-1" data-testid="ws-no-wells">No live well yet. Use New well.</div>}
        {(wells || []).map((w) => (
          <button key={w.id} type="button" data-testid={`ws-well-${w.name}`} onClick={() => { setSelectedId(w.id); if (view === 'setup') setView('live'); }}
            className={`w-full text-left px-2 py-1 text-xs rounded ${w.id === selectedId ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800'}`}>
            {w.name}
            <div className="text-[10px] text-slate-500">{w.header?.field || ''}{w.header?.rig ? `, ${w.header.rig}` : ''}</div>
            {w.id === selectedId && (
              <div className="text-[10px] text-slate-500 mt-0.5" data-testid="ws-explorer-counts">{descriptions.length} description(s), {events.length} event(s){events.some((e) => e.duration && e.endUtcMs == null) ? ', one open' : ''}</div>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  let center;
  if (view === 'setup' || (!well && wells && wells.length === 0)) {
    center = <WellSetup backend={backend} onStatus={setStatus} onCreated={async (w) => { await refreshWells(); setSelectedId(w.id); setView('live'); }} />;
  } else if (!well) {
    center = <div className="p-4 text-xs text-slate-500" data-testid="ws-need-well">Choose a live well in the explorer.</div>;
  } else if (view === 'describe') {
    center = <DescribeView backend={backend} well={well} ctx={ctx} descriptions={descriptions} defaults={defaultDepthEntry(well)} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'timeline') {
    center = <TimelineView events={events} onStart={startEvent} onEnd={endEvent} tourCfg={tourConfigOf(well)} offsetMin={offsetMin} unit={units.depth} nowMs={nowMs} currentUserName={user ? user.name || user.email : ''} />;
  } else if (view === 'config') {
    center = <ConfigView backend={backend} well={well} rigConfig={rigConfig} canAdmin={isMember} onStatus={setStatus} onSaved={() => { refreshWells(); setTick((t) => t + 1); }} />;
  } else {
    center = <LiveWellView backend={backend} well={well} ctx={ctx} bitDepths={bitDepths} pumpEvents={pumpEvents} events={events} onStartEvent={startEvent} onEndEvent={endEvent} descriptions={descriptions} defaults={defaultDepthEntry(well)} offsetMin={offsetMin} unit={units.depth} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  }

  const statusBar = (
    <div className="flex items-center gap-4 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="ws-status" className="truncate">{loading ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : null}{status}</span>
      <span className="ml-auto" data-testid="ws-status-bit">Bit {latestBit ? fmtDepth(latestBit.md_calc_m, units.depth) : 'n/a'}</span>
      <span data-testid="ws-status-spm">Pumps {lastPump ? (lastPump.payload.spm > 0 ? `${lastPump.payload.spm} spm` : 'off') : 'n/a'}</span>
      <span data-testid="ws-status-tour">{tour ? `${tour.label} tour` : ''}</span>
      <span data-testid="ws-status-rigtime">{well ? `${rigNow.hhmm} rig (${offsetLabel(offsetMin)})` : ''}</span>
      <span data-testid="ws-status-user">{user ? user.name || user.email : ''}</span>
    </div>
  );

  return (
    <WorkspaceShell autoSaveId="wellsite.workspace.v1" minWidth={1000} dockDefaultSize={0}
      ribbon={ribbon} explorer={explorer} center={<ScrollArea className="h-full min-h-0 bg-slate-950">{center}</ScrollArea>} statusBar={statusBar} />
  );
}
