// Wellsite Studio workstation (WS0, 2026-09-07). The controller on an
// injected backend (the local store over Supabase, or over the fake
// transport in the harness): the Geoscience shell with a ribbon (module
// home, views, unit, help), an explorer of live wells, a centre view
// (Live, Config in WS0; Samples, Describe, Shows, Observations, Tops,
// Timeline, Handover, Report arrive with their phases) and a status bar
// with the bit depth, pumps, tour, rig time and the sync state.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Settings, HelpCircle, Loader2, Plus, HardHat, PenLine, ListOrdered, FlaskConical, PanelRight, Droplets, Eye, Camera, Tags } from 'lucide-react';
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
import SamplesView from './SamplesView';
import LagPanel from './LagPanel';
import { lagNow, sampleBoard, currentProgramme, programmeChange, samplesToSchedule, scheduleHorizonM, PROGRAMME_SUBTYPE } from '../services/samples';
import ShowsView from './ShowsView';
import ObservationsView from './ObservationsView';
import PhotosPanel from './PhotosPanel';
import { SHOW_SUBTYPE } from '../services/shows';
import { OBSERVATION_CODES } from '../services/observations';
import TopsView from './TopsView';
import SyncStatusPill, { useSyncState } from './SyncStatusPill';
import SyncDrawer from './SyncDrawer';
import { persistStorage } from '@/lib/wellsite/db';
import ApproachPanel from './ApproachPanel';
import { formationBoard, currentPrognosis, canApprove, formationKey } from '../services/tops';
import { buildPrognosis, editedPrognosis } from '../services/prognosis';
import { depthFromDisplay } from '../services/units';
import { toCanonicalMd } from '@/lib/wellsite/depth';
import WellSetup from './WellSetup';

export const VIEWS = [
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'samples', label: 'Samples', icon: FlaskConical },
  { id: 'describe', label: 'Describe', icon: PenLine },
  { id: 'shows', label: 'Shows', icon: Droplets },
  { id: 'observations', label: 'Observations', icon: Eye },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'tops', label: 'Tops', icon: Tags },
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
  const [samples, setSamples] = useState([]);
  const [stages, setStages] = useState([]);
  const [programmeRecords, setProgrammeRecords] = useState([]);
  const [describeSample, setDescribeSample] = useState(null);
  const [shows, setShows] = useState([]);
  const [observations, setObservations] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoSampleId, setPhotoSampleId] = useState('');
  const [tops, setTops] = useState([]);
  const [prognoses, setPrognoses] = useState([]);
  const [members, setMembers] = useState([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockView, setDockView] = useState('panels'); // panels | sync
  const [offlineReady, setOfflineReady] = useState(null);
  const syncState = useSyncState();
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
    if (!well) { setBitDepths([]); setPumpEvents([]); setRigConfig(null); setDescriptions([]); setEventRecords([]); setSamples([]); setStages([]); setProgrammeRecords([]); setShows([]); setObservations([]); setPhotos([]); setTops([]); setPrognoses([]); setMembers([]); return; }
    const [bits, pumps, cfg, descs, evs, smp, stg, prog, shw, obs, pho, tps, prg, mem] = await Promise.all([
      backend.listRecords(well.id, { subtype: 'bit_depth' }),
      backend.listRecords(well.id, { subtype: 'pump_rate' }),
      backend.latestRecord(well.id, 'rig_config'),
      backend.listRecords(well.id, { subtype: DESCRIPTION_SUBTYPE }),
      backend.listRecords(well.id, { kind: 'event' }),
      backend.listSamples(well.id),
      backend.listStages(well.id),
      backend.listRecords(well.id, { subtype: PROGRAMME_SUBTYPE }),
      backend.listRecords(well.id, { subtype: SHOW_SUBTYPE }),
      backend.listRecords(well.id, { kind: 'observation' }),
      backend.listPhotos(well.id),
      backend.listTops(well.id),
      backend.listPrognosis(well.id),
      backend.listMembers(well.id),
    ]);
    setTops(tps);
    setPrognoses(prg);
    setMembers(mem);
    setEventRecords(evs);
    setShows(currentObservations(shw));
    setObservations(currentObservations(obs.filter((r) => OBSERVATION_CODES.includes(r.subtype))));
    setPhotos(pho);
    setSamples(smp);
    setStages(stg);
    setProgrammeRecords(prog);
    setBitDepths(currentObservations(bits));
    setPumpEvents(currentObservations(pumps));
    setDescriptions(currentObservations(descs).sort((a, b) => (a.md_calc_m ?? 0) - (b.md_calc_m ?? 0)));
    setRigConfig(cfg ? cfg.payload : null);
  }, [backend, well]);
  useEffect(() => { refreshWellData(); }, [refreshWellData, tick]);
  useEffect(() => { if (well && backend.setCurrentWell) backend.setCurrentWell(well.id); }, [backend, well]);
  useEffect(() => backend.subscribeSync(() => setTick((t) => t + 1)), [backend]);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(id); }, []);

  const ctx = useMemo(() => (well ? wellContext(well) : null), [well]);
  const nowForLag = Date.now() + tick * 0;
  const lag = useMemo(() => (well ? lagNow({ well, rigConfig, bitDepths, pumpEvents, nowUtcMs: nowForLag }) : { available: false, note: '' }), [well, rigConfig, bitDepths, pumpEvents, nowForLag]);
  const programme = useMemo(() => currentProgramme(programmeRecords), [programmeRecords]);
  const board = useMemo(() => (well ? sampleBoard({ samples, stages, well, rigConfig, bitDepths, pumpEvents, nowUtcMs: nowForLag }) : null), [well, samples, stages, rigConfig, bitDepths, pumpEvents, nowForLag]);
  const scheduling = useRef(false);
  const scheduleAhead = useCallback(async () => {
    if (!well || !programme || scheduling.current) return 0;
    const latest = bitDepths[bitDepths.length - 1];
    if (!latest) return 0;
    const todo = samplesToSchedule(programme, samples, { toMdM: scheduleHorizonM(programme, latest.md_calc_m) });
    if (!todo.length) return 0;
    scheduling.current = true;
    try {
      await backend.addSamples(well.id, todo.map((t) => ({ sampleNo: t.sample_no, mdM: t.mdM, intervalM: t.intervalM, programmeVersion: t.programmeVersion })));
      setTick((t) => t + 1);
      return todo.length;
    } finally { scheduling.current = false; }
  }, [backend, well, programme, samples, bitDepths]);
  // keep the schedule ahead of the bit as bit depths arrive
  useEffect(() => { scheduleAhead().catch((e) => setStatus(e.message)); }, [scheduleAhead]);
  const saveProgramme = useCallback(async (rows, { authorisedBy, reason }) => {
    const p = programmeChange(programme, rows, { authorisedBy, atUtc: new Date().toISOString(), reason });
    if (programme) await backend.addVersion(programme.record, { payload: p.payload });
    else await backend.addRecord(well.id, p);
    setStatus(`Sampling programme version ${p.payload.version} recorded, authorised by ${authorisedBy}.`);
    setTick((t) => t + 1);
  }, [backend, well, programme]);
  const recordStage = useCallback(async (sample, stage) => {
    try {
      await backend.addStage(well.id, sample.id, stage);
      setStatus(`Sample ${sample.sample_no} ${stage} at ${toRigLocal(Date.now(), offsetMinOf(well)).hhmm}.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well]);
  const recordPump = useCallback(async (spm, note) => {
    try {
      await backend.addRecord(well.id, { kind: 'observation', subtype: 'pump_rate', payload: { spm, note: note || null, source: 'manual' } });
      setStatus(spm === 0 ? 'Pumps off recorded.' : `Pump rate ${spm} spm recorded.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well]);
  const events = useMemo(() => eventsFromRecords(eventRecords), [eventRecords]);
  const prognosis = useMemo(() => currentPrognosis(prognoses), [prognoses]);
  const latestBitMd = bitDepths.length ? bitDepths[bitDepths.length - 1].md_calc_m : null;
  const topsBoard = useMemo(() => (well && ctx ? formationBoard({ tops, prognosis, bitMdM: latestBitMd, ctx }) : { rows: [], next: null, conflicts: [] }), [well, ctx, tops, prognosis, latestBitMd]);
  const approver = useMemo(() => canApprove(user, members, well), [user, members, well]);
  const isAdmin = useMemo(() => !!(user && members.some((m) => m.user_id === user.id && m.role === 'administrator' && m.status === 'active')), [user, members]);
  const allObservationRecords = useMemo(() => [...observations, ...descriptions, ...shows].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)), [observations, descriptions, shows]);
  const approachEvidence = useMemo(() => {
    const n = topsBoard.next;
    if (!n || !n.panel.window) return allObservationRecords.slice(0, 6);
    const lo = n.panel.window.fromMdM - 30;
    return allObservationRecords.filter((r) => Number.isFinite(r.md_calc_m) && r.md_calc_m >= lo);
  }, [topsBoard, allObservationRecords]);
  const interpretTop = useCallback(async (p) => {
    const { row, warnings } = await backend.addTop(well.id, p);
    setStatus(warnings.length ? warnings[0] : `${row.name} interpretation recorded, ${row.confidence} confidence.`);
    setTick((t) => t + 1);
  }, [backend, well]);
  const callTop = useCallback(async (p, row) => {
    const prev = row && row.call ? row.call : null;
    const res = prev ? await backend.addTopVersion(prev, p) : await backend.addTop(well.id, p);
    // the event on the timeline that a top was called, citing the decision (the evidence chain of spec section 35)
    await backend.addRecord(well.id, { kind: 'event', subtype: 'top_called', occurredAt: res.row.occurred_at, endedAt: res.row.occurred_at, evidenceIds: [res.row.id],
      depth: { ...p.depth, kind: 'event' }, payload: { label: `${res.row.name} called at ${fmtDepth(res.row.md_calc_m, units.depth)} (${res.row.status})`, family: 'geology', duration: false, top_id: res.row.id } });
    setStatus(`${res.row.name} called at ${fmtDepth(res.row.md_calc_m, units.depth)}, ${res.row.status}${prev ? ` (version ${res.row.version_no})` : ''}.`);
    setTick((t) => t + 1);
  }, [backend, well, units.depth]);
  const resolveTop = useCallback(async (chosen, why, heads) => {
    try {
      await backend.addTopVersion(chosen, {
        status: chosen.status, confidence: chosen.confidence, basis: why, evidenceIds: chosen.evidence_ids || [], resolvesIds: heads.map((h) => h.id),
        depth: { value: chosen.depth_value, unit: chosen.depth_unit, reference: chosen.depth_ref, datum: chosen.depth_datum, kind: chosen.depth_kind },
        rangeBase: chosen.role === 'interpretation' ? { value: chosen.range_base_md_m, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' } : undefined,
      });
      setStatus(`${chosen.name}: competing versions resolved, the ${fmtDepth(chosen.md_calc_m, units.depth)} version stands.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, units.depth]);
  const loadPrognosis = useCallback(async () => {
    try {
      const sources = await backend.loadPrognosisSources(well.id, { offsetWellIds: (prognosis && prognosis.source && prognosis.source.offset_well_ids) || [] });
      const row = await backend.addPrognosis(well.id, buildPrognosis({ wellId: well.id, version: 0, sources, offsetWells: sources.offsetWells, offsetMin: offsetMinOf(well) }));
      setStatus(`Prognosis version ${row.version} loaded: ${row.tops.length} top(s), ${row.offset_tops.length} offset top(s).`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well, prognosis]);
  const addPrognosisTop = useCallback(async ({ name, depth, uncertaintyDisplay }) => {
    if (!(name && name.trim())) throw new Error('A formation name is required.');
    const c = toCanonicalMd({ ...depth, kind: 'prognosis' }, ctx);
    if (!c.ok) throw new Error(c.errors[0]);
    const base = prognosis || { tops: [], offset_tops: [], casing_points: [], hole_sections: [], source: {} };
    const next = editedPrognosis(base, [...(base.tops || []), { name: name.trim(), formation_key: formationKey(name), md_m: c.mdM, uncertainty_m: depthFromDisplay(uncertaintyDisplay, depth.unit) || 0, source: 'manual' }]);
    const row = await backend.addPrognosis(well.id, { ...next, wellId: well.id });
    setStatus(`Prognosis version ${row.version}: ${name.trim()} added by hand.`);
    setTick((t) => t + 1);
  }, [backend, well, ctx, prognosis]);
  const keepOffline = useCallback(async () => {
    try {
      // fetch this app's lazy chunks so the service worker holds them; the shell itself is precached
      await Promise.all([import('../WellsiteStudio'), import('./ConfigView'), import('./DescribeView'), import('./SamplesView'), import('./TopsView'), import('./TimelineView'), import('./ShowsView'), import('./ObservationsView'), import('./PhotosPanel')]);
      const persisted = await persistStorage();
      setOfflineReady(true);
      setStatus(persisted ? 'This app is cached for use without a connection and its storage is protected.' : 'This app is cached for use without a connection.');
    } catch (e) { setOfflineReady(false); setStatus(`Could not cache the app: ${e.message}`); }
  }, []);
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
        <SyncStatusPill onClick={() => { setDockView('sync'); setDockOpen(true); }} />
        <Link to="/dashboard/apps/geoscience/wellsite-studio/help" data-testid="ws-help" title="Open the Wellsite Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <button type="button" data-testid="ws-toggle-dock" title="Show or hide the lag panel"
          className={`px-2 py-1 text-xs rounded border ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setDockOpen((v) => !v)}>
          <PanelRight className="w-3.5 h-3.5" />
        </button>
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
              <div className="text-[10px] text-slate-500 mt-0.5" data-testid="ws-explorer-counts">{descriptions.length} description(s), {events.length} event(s){events.some((e) => e.duration && e.endUtcMs == null) ? ', one open' : ''}, {shows.length} show(s), {photos.length} photo(s), {topsBoard.rows.filter((r) => r.call).length} top(s) called{Math.max(topsBoard.conflicts.length, syncState.conflicts) ? `, ${Math.max(topsBoard.conflicts.length, syncState.conflicts)} conflict(s)` : ''}</div>
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
  } else if (view === 'samples') {
    center = <SamplesView board={board} programme={programme} onProgrammeSave={saveProgramme} onStage={recordStage} onSchedule={async () => { const n = await scheduleAhead(); setStatus(n ? `${n} sample(s) scheduled ahead of the bit.` : 'The schedule already reaches ahead of the bit.'); }}
      onDescribe={(smp) => { setDescribeSample(smp); setView('describe'); }} unit={units.depth} offsetMin={offsetMin} nowMs={nowForLag} onStatus={setStatus} />;
  } else if (view === 'describe') {
    center = <DescribeView backend={backend} well={well} ctx={ctx} descriptions={descriptions} sample={describeSample} onSampleDone={async (smp) => { try { await backend.addStage(well.id, smp.id, 'described'); } catch (e) { setStatus(e.message); } setDescribeSample(null); }}
      defaults={defaultDepthEntry(well)} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'shows') {
    center = <ShowsView backend={backend} well={well} ctx={ctx} shows={shows} samples={samples} defaults={defaultDepthEntry(well)} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'observations') {
    center = <ObservationsView backend={backend} well={well} ctx={ctx} observations={observations} latestBit={latestBit} lag={lag} defaults={defaultDepthEntry(well)} unit={units.depth} offsetMin={offsetMin} tourCfg={tourConfigOf(well)} nowMs={nowForLag} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'photos') {
    center = <PhotosPanel backend={backend} well={well} photos={photos} samples={samples} sampleId={photoSampleId} onSampleChange={setPhotoSampleId} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'tops') {
    center = <TopsView board={topsBoard} tops={tops} records={allObservationRecords} prognosis={prognosis} ctx={ctx} defaults={defaultDepthEntry(well)} unit={units.depth} offsetMin={offsetMin}
      approver={approver} online={backend.online()} canAdmin={isAdmin} onInterpret={interpretTop} onCall={callTop} onResolve={resolveTop} onLoadPrognosis={loadPrognosis} onAddPrognosisTop={addPrognosisTop} onStatus={setStatus} userName={user ? user.name || user.email : ''} />;
  } else if (view === 'timeline') {
    center = <TimelineView events={events} onStart={startEvent} onEnd={endEvent} tourCfg={tourConfigOf(well)} offsetMin={offsetMin} unit={units.depth} nowMs={nowMs} currentUserName={user ? user.name || user.email : ''} />;
  } else if (view === 'config') {
    center = <ConfigView backend={backend} well={well} rigConfig={rigConfig} canAdmin={isMember} onStatus={setStatus} onSaved={() => { refreshWells(); setTick((t) => t + 1); }} />;
  } else {
    center = <LiveWellView backend={backend} well={well} ctx={ctx} bitDepths={bitDepths} pumpEvents={pumpEvents} events={events} onStartEvent={startEvent} onEndEvent={endEvent} descriptions={descriptions} lag={lag} board={board} onStage={recordStage} defaults={defaultDepthEntry(well)} offsetMin={offsetMin} unit={units.depth} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  }

  const statusBar = (
    <div className="flex items-center gap-4 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="ws-status" className="truncate">{loading ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : null}{status}</span>
      <span className="ml-auto" data-testid="ws-status-bit">Bit {latestBit ? fmtDepth(latestBit.md_calc_m, units.depth) : 'n/a'}</span>
      <span data-testid="ws-status-lagged">Lagged {lag.available && Number.isFinite(lag.laggedMdM) ? fmtDepth(lag.laggedMdM, units.depth) : 'n/a'}</span>
      <span data-testid="ws-status-lag-strokes">Lag {lag.available && Number.isFinite(lag.lagStrokes) ? `${Math.round(lag.lagStrokes)} stk` : 'n/a'}</span>
      <span data-testid="ws-status-spm">Pumps {lastPump ? (lastPump.payload.spm > 0 ? `${lastPump.payload.spm} spm` : 'off') : 'n/a'}</span>
      <span data-testid="ws-status-tour">{tour ? `${tour.label} tour` : ''}</span>
      <span data-testid="ws-status-rigtime">{well ? `${rigNow.hhmm} rig (${offsetLabel(offsetMin)})` : ''}</span>
      <span data-testid="ws-status-user">{user ? user.name || user.email : ''}</span>
    </div>
  );

  return (
    <WorkspaceShell autoSaveId="wellsite.workspace.v2" minWidth={1000} dockDefaultSize={22} dockOpen={dockOpen} onDockOpenChange={setDockOpen}
      ribbon={ribbon} explorer={explorer} center={<ScrollArea className="h-full min-h-0 bg-slate-950">{center}</ScrollArea>} statusBar={statusBar}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          {dockView === 'sync' ? (
            <SyncDrawer backend={backend} wellId={well ? well.id : null} offsetMin={offsetMin} onClose={() => setDockView('panels')} onOpenConflicts={() => { setView('tops'); setDockView('panels'); }} onKeepOffline={keepOffline} offlineReady={offlineReady} />
          ) : well ? (
            <>
              <LagPanel lag={lag} pumpEvents={pumpEvents} onPump={recordPump} unit={units.depth} offsetMin={offsetMin} nowMs={nowForLag} />
              <div className="border-t border-slate-800/60" />
              <ApproachPanel next={topsBoard.next} evidence={approachEvidence} unit={units.depth} offsetMin={offsetMin} onOpenTops={() => setView('tops')} />
            </>
          ) : null}
        </ScrollArea>
      )} />
  );
}
