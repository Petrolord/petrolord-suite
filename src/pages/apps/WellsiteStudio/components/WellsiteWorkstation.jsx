// Wellsite Studio workstation (WS0, 2026-09-07). The controller on an
// injected backend (the local store over Supabase, or over the fake
// transport in the harness): the Geoscience shell with a ribbon (module
// home, views, unit, help), an explorer of live wells, a centre view
// (Live, Config in WS0; Samples, Describe, Shows, Observations, Tops,
// Timeline, Handover, Report arrive with their phases) and a status bar
// with the bit depth, pumps, tour, rig time and the sync state.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Settings, HelpCircle, Loader2, Plus, HardHat, PenLine, ListOrdered, FlaskConical, PanelRight, Droplets, Eye, Camera, Tags, ClipboardList, FileText, FileUp, Compass, LineChart, Building2 } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { tourAt, toRigLocal, offsetLabel } from '@/lib/wellsite/time';
import { wellContext, offsetMinOf, defaultDepthEntry, tourConfigOf } from '../services/wellContext';
import { readUnits, fmtDepth, DEPTH_UNITS, UNITS_KEY } from '../services/units';
import { useAppUnits } from '@/lib/units/useAppUnits';
import UnitProfileNote from '@/components/units/UnitProfileNote';
import { currentObservations } from '@/lib/wellsite/records';
import LiveWellView from './LiveWellView';
import ConfigView from './ConfigView';
import DescribeView from './DescribeView';
import { DESCRIPTION_SUBTYPE } from '../services/describe';
import TimelineView from './TimelineView';
import { eventsFromRecords, startEventParams } from '../services/events';
import SamplesView from './SamplesView';
import LagPanel from './LagPanel';
import { lagNow, sampleBoard, currentProgramme, programmeChange, samplesToSchedule, scheduleHorizonM, programmeStartMdM, bitHistoryOf, PROGRAMME_SUBTYPE, isFloater, ropNow } from '../services/samples';
import ShowsView from './ShowsView';
import ObservationsView from './ObservationsView';
import PhotosPanel from './PhotosPanel';
import { SHOW_SUBTYPE } from '../services/shows';
import { OBSERVATION_CODES } from '../services/observations';
import { GAS_SUBTYPE } from '../services/gas';
import TopsView from './TopsView';
import SyncStatusPill, { useSyncState } from './SyncStatusPill';
import ReportScreen from './ReportScreen';
import { narrativeParams, currentNarrative } from '../services/reports';
import { memberRole } from '../services/tops';
import SyncDrawer from './SyncDrawer';
import { persistStorage } from '@/lib/wellsite/db';
import ApproachPanel from './ApproachPanel';
import { formationBoard, currentPrognosis, canApprove, formationKey } from '../services/tops';
import { buildPrognosis, editedPrognosis } from '../services/prognosis';
import { depthFromDisplay } from '../services/units';
import { toCanonicalMd } from '@/lib/wellsite/depth';
import WellSetup from './WellSetup';
import MembersPanel from './MembersPanel';
import { memberName } from '../services/members';
import { buildLabel } from '@/lib/platformBuild';
import { useNarrowViewport } from './useNarrowViewport';
import LagCheckPanel from './LagCheckPanel';
import ImportView from './ImportView';
import { IMPORT_SUBTYPE, DATA_SUBTYPE, mudlogRecords, mudlogSeries, importsOf, withdrawParams, typedRowParams } from '../services/mudlogImport';
import { newId } from '@/lib/wellsite/ids';
import SurveysView from './SurveysView';
import LogView from './LogView';
import OfficeView from './OfficeView';
import { dExponentSeries, currentDxcSettings, dxcSettingsParams } from '../services/dexponent';
import { buildStripLog } from '../services/stripLog';
import { SURVEY_SUBTYPE, activeSurvey, wellWithSurvey, surveyRuns, staleDepths } from '../services/surveys';
import { LAG_CHECK_SUBTYPE, currentWashout, lagCheckParams, washoutParams } from '../services/lagCheck';

// record types added by the upgrade that belong with the typed observations (lists, evidence, reports)
const EXTRA_OBSERVATION_SUBTYPES = [GAS_SUBTYPE, 'lag_check', SURVEY_SUBTYPE];

export const VIEWS = [
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'samples', label: 'Samples', icon: FlaskConical },
  { id: 'describe', label: 'Describe', icon: PenLine },
  { id: 'shows', label: 'Shows', icon: Droplets },
  { id: 'observations', label: 'Observations', icon: Eye },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'import', label: 'Import', icon: FileUp },
  { id: 'surveys', label: 'Surveys', icon: Compass },
  { id: 'log', label: 'Log', icon: LineChart },
  { id: 'tops', label: 'Tops', icon: Tags },
  { id: 'timeline', label: 'Timeline', icon: ListOrdered },
  { id: 'handover', label: 'Handover', icon: ClipboardList },
  { id: 'report', label: 'Report', icon: FileText },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'office', label: 'Office', icon: Building2 },
];

export default function WellsiteWorkstation({ backend, appPaths = {} }) {
  const [searchParams] = useSearchParams();
  const [wells, setWells] = useState(null);
  // ?well= is a live-well id, or a registry (geo_wells) id from Well Data Manager's Open in menu
  const wellParam = useRef(searchParams.get('well') || null);
  const [setupGeoId, setSetupGeoId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('live');
  const [bitDepths, setBitDepths] = useState([]);
  const [pumpEvents, setPumpEvents] = useState([]);
  const [rigConfig, setRigConfig] = useState(null);
  const [descriptions, setDescriptions] = useState([]);
  const [eventRecords, setEventRecords] = useState([]);
  const [samples, setSamples] = useState([]);
  const [stages, setStages] = useState([]);
  const [programmeRecords, setProgrammeRecords] = useState([]);
  const [decisionRecords, setDecisionRecords] = useState([]);
  const [lagChecks, setLagChecks] = useState([]);
  const [mudlogRecordsState, setMudlogRecordsState] = useState([]);
  const [surveyRecords, setSurveyRecords] = useState([]);
  const [describeSample, setDescribeSample] = useState(null);
  const [shows, setShows] = useState([]);
  const [observations, setObservations] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoSampleId, setPhotoSampleId] = useState('');
  const [tops, setTops] = useState([]);
  const [narratives, setNarratives] = useState([]);
  const [reports, setReports] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [prognoses, setPrognoses] = useState([]);
  const [members, setMembers] = useState([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockView, setDockView] = useState('panels'); // panels | sync
  const [offlineReady, setOfflineReady] = useState(null);
  const syncState = useSyncState();
  const [status, setStatus] = useState('Ready.');
  const [loading, setLoading] = useState(0);
  // Suite unit profile: depth starts from the profile; the header selector
  // changes this view for the session only, and the older remembered
  // 'ws.units' choice no longer beats the profile
  const unitsHook = useAppUnits('wellsite', { depth: { family: 'depth', allowed: DEPTH_UNITS }, volume: { family: 'liquidVolume', allowed: ['bbl', 'm3'] }, pressure: { family: 'pressure', allowed: ['psi', 'kPa', 'bar', 'MPa'] } },
    { fallback: { volume: 'bbl', pressure: 'psi', ...readUnits(typeof localStorage !== 'undefined' ? localStorage : null) }, legacyKeys: [UNITS_KEY] });
  const { units } = unitsHook;
  const [tick, setTick] = useState(0);
  const [user, setUser] = useState(null);
  // WS-U1-009: names for the people on a record. Production ids are uuids, and the
  // screens printed them raw (only the harness user 'user-a' was mapped to a name)
  const [people, setPeople] = useState([]);
  const narrow = useNarrowViewport();
  void appPaths;

  const track = useCallback(async (fn) => { setLoading((n) => n + 1); try { return await fn(); } finally { setLoading((n) => n - 1); } }, []);

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
  // Resolve ?well= on every wells update until it matches: the local list comes first and the server's
  // list after it, so a live well that is not on this device yet is still found. No match means the
  // registry well has no live well yet, so New well opens with it chosen.
  useEffect(() => {
    const param = wellParam.current;
    if (!param || !wells) return;
    const hit = wells.find((w) => w.id === param) || wells.find((w) => w.geo_well_id === param);
    if (hit) {
      wellParam.current = null;
      setSelectedId(hit.id);
      setSetupGeoId(null);
      setView((v) => (v === 'setup' ? 'live' : v));
    } else {
      setSetupGeoId(param);
      setView('setup');
    }
  }, [wells]);
  useEffect(() => { if (!wellParam.current && !selectedId && wells && wells.length) setSelectedId(wells[0].id); }, [wells, selectedId]);

  // refreshes overlap (every save bumps tick); only the latest one may land,
  // or a slower, older read overwrites newer rows (a just-saved observation
  // vanished, a user's offset choice was reset on slow machines)
  const refreshSeq = useRef(0);
  const refreshWellData = useCallback(async () => {
    const seq = ++refreshSeq.current;
    if (!well) { setBitDepths([]); setPumpEvents([]); setRigConfig(null); setDescriptions([]); setEventRecords([]); setSamples([]); setStages([]); setProgrammeRecords([]); setDecisionRecords([]); setLagChecks([]); setMudlogRecordsState([]); setSurveyRecords([]); setShows([]); setObservations([]); setPhotos([]); setTops([]); setPrognoses([]); setMembers([]); setNarratives([]); setReports([]); setSignoffs([]); return; }
    const [bits, pumps, cfg, descs, evs, smp, stg, prog, shw, obs, pho, tps, prg, mem, nar, rep, sgn] = await Promise.all([
      backend.listRecords(well.id, { subtype: 'bit_depth' }),
      backend.listRecords(well.id, { subtype: 'pump_rate' }),
      backend.latestRecord(well.id, 'rig_config'),
      backend.listRecords(well.id, { subtype: DESCRIPTION_SUBTYPE }),
      backend.listRecords(well.id, { kind: 'event' }),
      backend.listSamples(well.id),
      backend.listStages(well.id),
      backend.listRecords(well.id, { kind: 'decision' }),
      backend.listRecords(well.id, { subtype: SHOW_SUBTYPE }),
      backend.listRecords(well.id, { kind: 'observation' }),
      backend.listPhotos(well.id),
      backend.listTops(well.id),
      backend.listPrognosis(well.id),
      backend.listMembers(well.id),
      backend.listRecords(well.id, { kind: 'narrative' }),
      backend.listReports(well.id),
      backend.listSignoffs(well.id),
    ]);
    if (seq !== refreshSeq.current) return; // a newer refresh is in flight
    setNarratives(nar);
    setReports(rep);
    setSignoffs(sgn);
    setTops(tps);
    setPrognoses(prg);
    setMembers(mem);
    setEventRecords(evs);
    setShows(currentObservations(shw));
    setObservations(currentObservations(obs.filter((r) => OBSERVATION_CODES.includes(r.subtype) || EXTRA_OBSERVATION_SUBTYPES.includes(r.subtype))));
    setPhotos(pho);
    setSamples(smp);
    setStages(stg);
    setProgrammeRecords(prog.filter((r) => r.subtype === PROGRAMME_SUBTYPE));
    setDecisionRecords(prog);
    setLagChecks(currentObservations(obs.filter((r) => r.subtype === LAG_CHECK_SUBTYPE)));
    setSurveyRecords(obs.filter((r) => r.subtype === SURVEY_SUBTYPE));
    setMudlogRecordsState(obs.filter((r) => r.subtype === IMPORT_SUBTYPE || r.subtype === DATA_SUBTYPE));
    setBitDepths(currentObservations(bits));
    setPumpEvents(currentObservations(pumps));
    setDescriptions(currentObservations(descs).sort((a, b) => (a.md_calc_m ?? 0) - (b.md_calc_m ?? 0)));
    setRigConfig(cfg ? cfg.payload : null);
  }, [backend, well]);
  useEffect(() => { refreshWellData(); }, [refreshWellData, tick]);
  useEffect(() => { if (well && backend.setCurrentWell) backend.setCurrentWell(well.id); }, [backend, well]);
  useEffect(() => backend.subscribeSync(() => setTick((t) => t + 1)), [backend]);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(id); }, []);

  // U2-005: the survey in use is the registry snapshot with the rig's survey runs applied; every
  // depth on screen (TVD, subsea, the prognosis comparison, the lag) is calculated with it
  const surveyInUse = useMemo(() => activeSurvey(well, surveyRecords), [well, surveyRecords]);
  const wellEff = useMemo(() => wellWithSurvey(well, surveyRecords), [well, surveyRecords]);
  const ctx = useMemo(() => (wellEff ? wellContext(wellEff) : null), [wellEff]);
  useEffect(() => {
    let alive = true;
    if (!well || !backend.listOrgPeople || !backend.online()) return undefined;
    backend.listOrgPeople(well.id).then((p) => { if (alive) setPeople(p || []); }).catch(() => {});
    return () => { alive = false; };
  }, [backend, well]);
  const nameOf = useCallback((userId) => (userId ? memberName({ user_id: userId }, people, user) : 'n/a'), [people, user]);
  const entryDefaults = useMemo(() => defaultDepthEntry(well, units.depth), [well, units.depth]);
  const nowForLag = Date.now() + tick * 0;
  const events = useMemo(() => eventsFromRecords(eventRecords), [eventRecords]);
  // U2-004: the washout in force (a decision citing its lag check) enlarges the open hole before the lag is computed
  const washout = useMemo(() => currentWashout(decisionRecords), [decisionRecords]);
  const lag = useMemo(() => (well ? lagNow({ well: wellEff, rigConfig, bitDepths, pumpEvents, events, nowUtcMs: nowForLag, washout }) : { available: false, note: '' }), [well, wellEff, rigConfig, bitDepths, pumpEvents, events, nowForLag, washout]);
  const floater = isFloater(rigConfig);
  const rop = useMemo(() => ropNow(bitDepths, events), [bitDepths, events]);
  const programme = useMemo(() => currentProgramme(programmeRecords), [programmeRecords]);
  const board = useMemo(() => (well ? sampleBoard({ samples, stages, well: wellEff, rigConfig, bitDepths, pumpEvents, events, nowUtcMs: nowForLag, washout }) : null), [well, wellEff, samples, stages, rigConfig, bitDepths, pumpEvents, events, nowForLag, washout]);
  const scheduling = useRef(false);
  const scheduleAhead = useCallback(async () => {
    if (!well || !programme || scheduling.current) return 0;
    const latest = bitDepths[bitDepths.length - 1];
    if (!latest) return 0;
    const todo = samplesToSchedule(programme, samples, { fromMdM: programmeStartMdM(programme, bitHistoryOf(bitDepths)), toMdM: scheduleHorizonM(programme, latest.md_calc_m) });
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
  const recordPump = useCallback(async (spm, note, boosterSpm = 0) => {
    try {
      const b = Number(boosterSpm) || 0;
      await backend.addRecord(well.id, { kind: 'observation', subtype: 'pump_rate', payload: { spm, boosterSpm: b, note: note || null, source: 'manual' } });
      setStatus(spm === 0 ? 'Pumps off recorded.' : `Pump rate ${spm} spm${b > 0 ? ` and booster ${b} spm` : ''} recorded.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well]);
  // U2-003: imported and typed mudlogging data (depth-sorted points for the strip log and the d-exponent)
  const mudlog = useMemo(() => mudlogSeries(mudlogRecordsState), [mudlogRecordsState]);
  const mudlogImports = useMemo(() => importsOf(mudlogRecordsState).current, [mudlogRecordsState]);
  const importMudlog = useCallback(async ({ conv, table, mapping, fileName, lag: lagRows }) => {
    const { header, chunks } = mudlogRecords(conv, { importId: newId(), fileName, table, mapping });
    const extra = lagRows ? [...lagRows.bitDepths, ...lagRows.pumpRates] : [];
    await backend.addRecords(well.id, [header, ...chunks, ...extra]);
    setStatus(`${fileName}: ${conv.rows.length} row(s) imported${conv.skipped.length ? `, ${conv.skipped.length} not read` : ''}${lagRows ? `; ${lagRows.bitDepths.length} bit depth(s) and ${lagRows.pumpRates.length} pump rate change(s) recorded for the lag` : ''}.`);
    setTick((t) => t + 1);
  }, [backend, well]);
  const withdrawImport = useCallback(async (header, { reason, person }) => {
    await backend.correctObservation(header, withdrawParams(header, { reason, person }));
    setStatus(`Import ${header.payload.file_name} withdrawn; its rows are no longer used.`);
    setTick((t) => t + 1);
  }, [backend]);
  const recordTypedRow = useCallback(async ({ depthEntry, values }) => {
    const { row } = await backend.addRecord(well.id, typedRowParams({ depthEntry, values }));
    setStatus(`Drilling parameters recorded at ${fmtDepth(row.md_calc_m, units.depth)}.`);
    setTick((t) => t + 1);
  }, [backend, well, units.depth]);
  // U2-006: d and dc from the data rows, the settings a decision on the record
  const dxcSettings = useMemo(() => currentDxcSettings(decisionRecords), [decisionRecords]);
  const dxc = useMemo(() => dExponentSeries({ points: mudlog.points, rigConfig, ctx, settings: dxcSettings }), [mudlog, rigConfig, ctx, dxcSettings]);
  const saveDxcSettings = useCallback(async (p) => {
    const params = dxcSettingsParams({ ...p, person: user ? user.name || user.email : null });
    if (dxcSettings && dxcSettings.record) await backend.addVersion(dxcSettings.record, { payload: params.payload });
    else await backend.addRecord(well.id, params);
    setStatus(`${params.payload.statement}.`);
    setTick((t) => t + 1);
  }, [backend, well, dxcSettings, user]);
  const recordSurveyRun = useCallback(async (p) => {
    const { row } = await backend.addRecord(well.id, p);
    setStatus(`${row.payload.text} TVD and subsea depths now follow it.`);
    setTick((t) => t + 1);
  }, [backend, well]);
  const recordLagCheck = useCallback(async (result, { tracer }) => {
    const bit = bitDepths[bitDepths.length - 1] || null;
    const { row } = await backend.addRecord(well.id, lagCheckParams({ result, tracer, bit }));
    setStatus(result.applies
      ? `Lag check recorded: ${result.measuredLagStrokes.toFixed(0)} stk measured against ${result.calculatedLagStrokes.toFixed(0)} calculated, washout ${(result.washoutFraction * 100).toFixed(1)} percent of the open hole.`
      : `Lag check recorded. ${result.note}`);
    setTick((t) => t + 1);
    return row;
  }, [backend, well, bitDepths]);
  const applyWashout = useCallback(async (fraction, { lagCheckId = null, basis = null } = {}) => {
    const p = washoutParams({ washoutFraction: fraction, basis, person: user ? user.name || user.email : null, lagCheckId });
    if (washout && washout.record) await backend.addVersion(washout.record, { payload: p.payload, evidenceIds: p.evidenceIds });
    else await backend.addRecord(well.id, p);
    setStatus(`${p.payload.statement}.`);
    setTick((t) => t + 1);
  }, [backend, well, washout, user]);
  const prognosis = useMemo(() => currentPrognosis(prognoses), [prognoses]);
  const latestBitMd = bitDepths.length ? bitDepths[bitDepths.length - 1].md_calc_m : null;
  const topsBoard = useMemo(() => (well && ctx ? formationBoard({ tops, prognosis, bitMdM: latestBitMd, ctx }) : { rows: [], next: null, conflicts: [] }), [well, ctx, tops, prognosis, latestBitMd]);
  // U2-001: the composite log model (tracks and markers) from the record
  const logModel = useMemo(() => buildStripLog({ well, unit: units.depth, mudlog, bitDepths, events, descriptions, shows, observations, topsBoard, rigConfig, dxc }),
    [well, units.depth, mudlog, bitDepths, events, descriptions, shows, observations, topsBoard, rigConfig, dxc]);
  const exportLogPdf = useCallback(async ({ window: w, scale }) => {
    const { exportStripLogPdf } = await import('../services/stripLogPdf');
    const name = await exportStripLogPdf(logModel, { well, unit: units.depth, toDisplay: (m) => (units.depth === 'ft' ? m / 0.3048 : m), scale, window: w,
      reviewer: { kbElevM: ctx ? ctx.kbElevM : null, preparedBy: user ? user.name || user.email : null, build: `${buildLabel()}, Wellsite Studio` } });
    setStatus(`Strip log saved as ${name}.`);
  }, [logModel, well, units.depth, ctx, user]);
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
  const loadPrognosis = useCallback(async (offsetWellIds) => {
    try {
      const ids = Array.isArray(offsetWellIds) ? offsetWellIds : ((prognosis && prognosis.source && prognosis.source.offset_well_ids) || []);
      const sources = await backend.loadPrognosisSources(well.id, { offsetWellIds: ids });
      const row = await backend.addPrognosis(well.id, buildPrognosis({ wellId: well.id, version: 0, sources, offsetWells: sources.offsetWells, offsetMin: offsetMinOf(well) }));
      setStatus(`Prognosis version ${row.version} loaded: ${row.tops.length} top(s), ${row.offset_tops.length} offset top(s).`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well, prognosis]);
  const loadRegistryWells = useCallback(() => backend.listRegistryWells(), [backend]);
  const addPrognosisTop = useCallback(async ({ name, depth, uncertaintyDisplay, uncertaintyUnit }) => {
    if (!(name && name.trim())) throw new Error('A formation name is required.');
    const c = toCanonicalMd({ ...depth, kind: 'prognosis' }, ctx);
    if (!c.ok) throw new Error(c.errors[0]);
    const base = prognosis || { tops: [], offset_tops: [], casing_points: [], hole_sections: [], source: {} };
    const next = editedPrognosis(base, [...(base.tops || []), { name: name.trim(), formation_key: formationKey(name), md_m: c.mdM, uncertainty_m: depthFromDisplay(uncertaintyDisplay, uncertaintyUnit || depth.unit) || 0, source: 'manual' }]);
    const row = await backend.addPrognosis(well.id, { ...next, wellId: well.id });
    setStatus(`Prognosis version ${row.version}: ${name.trim()} added by hand.`);
    setTick((t) => t + 1);
  }, [backend, well, ctx, prognosis]);
  const myRole = useMemo(() => memberRole(user, members), [user, members]);
  const staleNow = useMemo(() => (ctx ? staleDepths([...bitDepths, ...descriptions, ...shows, ...observations.filter((r) => r.subtype !== SURVEY_SUBTYPE), ...tops], ctx) : null), [ctx, bitDepths, descriptions, shows, observations, tops]);
  const reportData = useMemo(() => ({
    records: [...observations, ...descriptions, ...shows, ...bitDepths, ...pumpEvents, ...narratives, ...eventRecords],
    samples, stages, tops, photos, events, lag,
  }), [observations, descriptions, shows, bitDepths, pumpEvents, narratives, eventRecords, samples, stages, tops, photos, events, lag]);
  const saveNarrative = useCallback(async (key, text, periodStartIso) => {
    try {
      const prev = currentNarrative(narratives, key, periodStartIso);
      const p = narrativeParams(key, text, periodStartIso);
      if (prev) await backend.addVersion(prev, { payload: p.payload });
      else await backend.addRecord(well.id, p);
      setStatus(`${key.replace(/_/g, ' ')} saved as a record; the report regenerates.`);
      setTick((t) => t + 1);
    } catch (e) { setStatus(e.message); }
  }, [backend, well, narratives]);
  const loadPublishPlan = useCallback(async () => (await backend.publishPlanFor(well.id)).plan, [backend, well]);
  const publishToRegistry = useCallback(async (photoIds, renameIds = []) => {
    try {
      const { plan, result } = await backend.publishToRegistry(well.id, { photoIds: Array.isArray(photoIds) ? photoIds : [], renameIds });
      const photosOut = result.photos && result.photos.ids ? result.photos.ids.length : 0;
      const left = (plan.duplicates || []).filter((d) => !result.renamed.some((r) => r.id === d.id)).map((d) => d.name);
      const dup = left.length
        ? ` ${[...new Set(left)].join(', ')} already had a registry top from another source (left as it is), so the registry now holds two tops of that name; tidy them in Well Data Manager.` : '';
      const ren = result.renamed.length ? ` ${result.renamed.map((r) => `${r.from} from the earlier source is now ${r.to}`).join('; ')}.` : '';
      const failed = result.photos.failed && result.photos.failed.length ? ` ${result.photos.failed.length} photograph(s) could not be uploaded (${result.photos.failed[0].error}); the tops and intervals are published.` : '';
      setStatus(`Published to the registry: ${result.tops.ids.length} final top(s) (${result.tops.replaced} replaced), ${result.intervals.ids.length} lithology interval(s) (${result.intervals.replaced} replaced)${photosOut ? `, ${photosOut} photograph(s)` : ''}; ${plan.untouchedTops + plan.untouchedIntervals - result.renamed.length} row(s) from other sources untouched.${ren}${dup}${failed}`);
      setTick((t) => t + 1);
      return true;
    } catch (e) { setStatus(e.message); return false; }
  }, [backend, well]);
  const keepOffline = useCallback(async () => {
    try {
      // fetch this app's lazy chunks so the service worker holds them; the shell itself is precached
      await Promise.all([import('../WellsiteStudio'), import('./ConfigView'), import('./DescribeView'), import('./SamplesView'), import('./TopsView'), import('./TimelineView'), import('./ShowsView'), import('./ObservationsView'), import('./PhotosPanel'), import('./ImportView'), import('./SurveysView'), import('./LogView'), import('./OfficeView')]);
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
  const setUnit = (u) => unitsHook.setUnit('depth', u);
  const isMember = true;

  const ribbon = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" testId="ws-home" />
      <HardHat className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text whitespace-nowrap">Wellsite Studio</span>
      <span className="hidden 2xl:inline text-[11px] text-pl-muted">the geological record of a live well</span>
      <div className="flex flex-wrap items-center gap-1 ml-4">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" data-testid={`ws-nav-${v.id}`} disabled={!well && v.id !== 'live' && v.id !== 'office'}
            className={`flex items-center gap-1 whitespace-nowrap px-2 py-1 text-xs rounded border ${view === v.id ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'} disabled:opacity-40`}
            onClick={() => setView(v.id)}>
            <v.icon className="w-3.5 h-3.5" /> {v.label}
          </button>
        ))}
        <button type="button" data-testid="ws-nav-setup" className={`flex items-center gap-1 whitespace-nowrap px-2 py-1 text-xs rounded border ${view === 'setup' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`} onClick={() => setView('setup')}>
          <Plus className="w-3.5 h-3.5" /> New well
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-pl-muted" title="Display unit; starts from your Suite units and changes this view for the session. The record stores metres">
          Depth
          <select value={units.depth} onChange={(e) => setUnit(e.target.value)} data-testid="ws-unit" className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text">
            {DEPTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <UnitProfileNote u={unitsHook} className="hidden lg:inline-flex" />
        <SyncStatusPill onClick={() => { setDockView('sync'); setDockOpen(true); }} />
        <Link to="/dashboard/apps/geoscience/wellsite-studio/help" data-testid="ws-help" title="Open the Wellsite Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <button type="button" data-testid="ws-toggle-dock" title="Show or hide the lag panel"
          className={`px-2 py-1 text-xs rounded border ${dockOpen ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
          onClick={() => setDockOpen((v) => !v)}>
          <PanelRight className="w-3.5 h-3.5" />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );

  const explorer = (
    <ScrollArea className="h-full min-h-0 bg-pl-surface border-r border-pl-border">
      <div className="p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-pl-muted px-1">Live wells</div>
        {wells === null && <div className="text-xs text-pl-muted px-1">Loading</div>}
        {wells && wells.length === 0 && <div className="text-xs text-pl-muted px-1" data-testid="ws-no-wells">No live well yet. Use New well.</div>}
        {(wells || []).map((w) => (
          <button key={w.id} type="button" data-testid={`ws-well-${w.name}`} onClick={() => { wellParam.current = null; setSetupGeoId(null); setSelectedId(w.id); if (view === 'setup') setView('live'); }}
            className={`w-full text-left px-2 py-1 text-xs rounded ${w.id === selectedId ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}>
            {w.name}
            <div className="text-[10px] text-pl-muted">{w.header?.field || ''}{w.header?.rig ? `, ${w.header.rig}` : ''}</div>
            {w.id === selectedId && (
              <div className="text-[10px] text-pl-muted mt-0.5" data-testid="ws-explorer-counts">{descriptions.length} description(s), {events.length} event(s){events.some((e) => e.duration && e.endUtcMs == null) ? ', one open' : ''}, {shows.length} show(s), {photos.length} photo(s), {topsBoard.rows.filter((r) => r.call).length} top(s) called{Math.max(topsBoard.conflicts.length, syncState.conflicts) ? `, ${Math.max(topsBoard.conflicts.length, syncState.conflicts)} conflict(s)` : ''}</div>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  let center;
  if (view === 'setup' || (!well && wells && wells.length === 0)) {
    center = <WellSetup backend={backend} initialGeoId={setupGeoId} onStatus={setStatus} onCreated={async (w) => { wellParam.current = null; setSetupGeoId(null); await refreshWells(); setSelectedId(w.id); setView('live'); }} />;
  } else if (view === 'office') {
    center = <OfficeView backend={backend} wells={wells || []} unit={units.depth} nowMs={nowForLag} onStatus={setStatus} onOpen={(id) => { wellParam.current = null; setSelectedId(id); setView('live'); }} />;
  } else if (!well) {
    center = <div className="p-4 text-xs text-pl-muted" data-testid="ws-need-well">Choose a live well in the explorer.</div>;
  } else if (view === 'samples') {
    center = <SamplesView board={board} programme={programme} onProgrammeSave={saveProgramme} onStage={recordStage} onSchedule={async () => { const n = await scheduleAhead(); setStatus(n ? `${n} sample(s) scheduled ahead of the bit.` : 'The schedule already reaches ahead of the bit.'); }}
      onDescribe={(smp) => { setDescribeSample(smp); setView('describe'); }} unit={units.depth} offsetMin={offsetMin} nowMs={nowForLag} onStatus={setStatus} />;
  } else if (view === 'describe') {
    center = <DescribeView backend={backend} well={well} ctx={ctx} descriptions={descriptions} sample={describeSample} onSampleDone={async (smp) => { try { await backend.addStage(well.id, smp.id, 'described'); } catch (e) { setStatus(e.message); } setDescribeSample(null); }}
      defaults={entryDefaults} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'shows') {
    center = <ShowsView backend={backend} well={well} ctx={ctx} shows={shows} samples={samples} defaults={entryDefaults} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'observations') {
    center = <ObservationsView backend={backend} well={well} ctx={ctx} observations={observations} latestBit={latestBit} lag={lag} defaults={entryDefaults} unit={units.depth} offsetMin={offsetMin} tourCfg={tourConfigOf(well)} nowMs={nowForLag} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'photos') {
    center = <PhotosPanel backend={backend} well={well} photos={photos} samples={samples} sampleId={photoSampleId} onSampleChange={setPhotoSampleId} unit={units.depth} offsetMin={offsetMin} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  } else if (view === 'import') {
    center = <ImportView ctx={ctx} defaults={entryDefaults} unit={units.depth} pressureUnit={units.pressure} offsetMin={offsetMin} imports={mudlogImports} series={mudlog} onImport={importMudlog} onWithdraw={withdrawImport} onTypedRow={recordTypedRow} onStatus={setStatus} userName={user ? user.name || user.email : ''} />;
  } else if (view === 'surveys') {
    center = <SurveysView inUse={surveyInUse} ctx={ctx} unit={units.depth} offsetMin={offsetMin} stale={staleNow} runs={surveyRuns(surveyRecords)} onRecord={recordSurveyRun} onStatus={setStatus} nameOf={nameOf} />;
  } else if (view === 'log') {
    center = <LogView win={logModel.win} tracks={logModel.tracks} markers={logModel.markers} dxc={dxc} dxcSettings={dxcSettings} onSaveDxc={saveDxcSettings} unit={units.depth} onStatus={setStatus} title={`${well.name}.`} notes={logModel.notes} legend={logModel.legend} onPdf={exportLogPdf} />;
  } else if (view === 'tops') {
    center = <TopsView board={topsBoard} tops={tops} records={allObservationRecords} prognosis={prognosis} ctx={ctx} defaults={entryDefaults} unit={units.depth} offsetMin={offsetMin}
      approver={approver} online={backend.online()} canAdmin={isAdmin} onInterpret={interpretTop} onCall={callTop} onResolve={resolveTop} onLoadPrognosis={loadPrognosis} geoWellId={well.geo_well_id} loadRegistryWells={loadRegistryWells} onAddPrognosisTop={addPrognosisTop} onPublish={publishToRegistry} onPublishPlan={loadPublishPlan} onStatus={setStatus} userName={user ? user.name || user.email : ''} nameOf={nameOf} photos={photos} />;
  } else if (view === 'handover' || view === 'report') {
    center = <ReportScreen key={view} kind={view === 'handover' ? 'handover' : 'daily'} backend={backend} well={well} data={reportData} tourCfg={tourConfigOf(well)} nowMs={nowForLag} unit={units.depth} offsetMin={offsetMin}
      role={myRole} userName={user ? user.name || user.email : ''} nameOf={nameOf} reviewer={{ kbElevM: ctx ? ctx.kbElevM : null, preparedBy: user ? user.name || user.email : null, build: `${buildLabel()}, Wellsite Studio` }} reports={reports} signoffs={signoffs} onNarrativeSave={saveNarrative} onStatus={setStatus} onChanged={() => setTick((t) => t + 1)} />;
  } else if (view === 'timeline') {
    center = <TimelineView events={events} onStart={startEvent} onEnd={endEvent} tourCfg={tourConfigOf(well)} offsetMin={offsetMin} unit={units.depth} nowMs={nowMs} currentUserName={user ? user.name || user.email : ''} />;
  } else if (view === 'config') {
    center = <ConfigView backend={backend} well={well} rigConfig={rigConfig} canAdmin={isMember} unit={units.depth} prognosis={prognosis} onStatus={setStatus} onSaved={() => { refreshWells(); setTick((t) => t + 1); }}
      membersSlot={<MembersPanel backend={backend} well={well} members={members} user={user} onStatus={setStatus} onChanged={() => setTick((t) => t + 1)} />} />;
  } else {
    center = <LiveWellView rop={rop} backend={backend} well={well} ctx={ctx} bitDepths={bitDepths} pumpEvents={pumpEvents} events={events} onStartEvent={startEvent} onEndEvent={endEvent} descriptions={descriptions} lag={lag} board={board} onStage={recordStage} defaults={entryDefaults} offsetMin={offsetMin} unit={units.depth} floater={floater} onChanged={() => setTick((t) => t + 1)} onStatus={setStatus} />;
  }

  const statusBar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="ws-status" className="truncate">{loading ? <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> : null}{status}</span>
      <span className="ml-auto" data-testid="ws-status-bit">Bit {latestBit ? fmtDepth(latestBit.md_calc_m, units.depth) : 'n/a'}</span>
      <span data-testid="ws-status-lagged">Lagged {lag.available && Number.isFinite(lag.laggedMdM) ? fmtDepth(lag.laggedMdM, units.depth) : 'n/a'}</span>
      <span data-testid="ws-status-lag-strokes">Lag {lag.available && Number.isFinite(lag.lagStrokes) ? `${Math.round(lag.lagStrokes)} stk` : 'n/a'}</span>
      <span data-testid="ws-status-spm">Pumps {lastPump ? (lastPump.payload.spm > 0 ? `${lastPump.payload.spm} spm${lastPump.payload.boosterSpm > 0 ? ` + ${lastPump.payload.boosterSpm} booster` : ''}` : 'off') : 'n/a'}</span>
      <span data-testid="ws-status-tour">{tour ? `${tour.label} tour` : ''}</span>
      <span data-testid="ws-status-rigtime">{well ? `${rigNow.hhmm} rig (${offsetLabel(offsetMin)})` : ''}</span>
      <span data-testid="ws-status-user">{user ? user.name || user.email : ''}</span>
    </div>
  );

  const dockContent = dockView === 'sync' ? (
    <SyncDrawer backend={backend} wellId={well ? well.id : null} offsetMin={offsetMin} onClose={() => setDockView('panels')} onOpenConflicts={() => { setView('tops'); setDockView('panels'); }} onKeepOffline={keepOffline} offlineReady={offlineReady} />
  ) : well ? (
    <>
      <LagPanel lag={lag} pumpEvents={pumpEvents} onPump={recordPump} unit={units.depth} volumeUnit={units.volume} offsetMin={offsetMin} nowMs={nowForLag} floater={floater} />
      <div className="border-t border-pl-border" />
      <LagCheckPanel lag={lag} washout={washout} checks={lagChecks} onRecord={recordLagCheck} onApply={applyWashout} unit={units.depth} volumeUnit={units.volume} offsetMin={offsetMin} />
      <div className="border-t border-pl-border" />
      <ApproachPanel next={topsBoard.next} evidence={approachEvidence} unit={units.depth} offsetMin={offsetMin} onOpenTops={() => setView('tops')} />
    </>
  ) : null;

  // WS-U1-004 (PL6): a rig tablet in portrait (768 to 834 px) and a phone (390 px)
  // got the desktop shell with a 1000 px minimum, so the whole screen scrolled
  // sideways. Below 900 px the workstation stacks: the ribbon, a well chooser,
  // the view, then the lag and approach panels, and a wrapping status bar.
  if (narrow) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-pl-bg overflow-x-hidden" data-testid="ws-compact">
        <div className="shrink-0">{ribbon}</div>
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-pl-surface border-b border-pl-border">
          <label className="text-[11px] text-pl-muted" htmlFor="ws-compact-well">Live well</label>
          <select id="ws-compact-well" data-testid="ws-compact-well" value={selectedId || ''} className="flex-1 min-w-0 bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text"
            onChange={(e) => { wellParam.current = null; setSetupGeoId(null); setSelectedId(e.target.value || null); if (view === 'setup') setView('live'); }}>
            {!(wells || []).length && <option value="">{wells === null ? 'Loading' : 'No live well yet'}</option>}
            {(wells || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          {center}
          {dockOpen && dockContent ? <div className="border-t border-pl-border bg-pl-surface" data-testid="ws-compact-dock">{dockContent}</div> : null}
        </div>
        <div className="shrink-0">{statusBar}</div>
      </div>
    );
  }

  return (
    <WorkspaceShell autoSaveId="wellsite.workspace.v2" minWidth={1000} dockDefaultSize={22} dockOpen={dockOpen} onDockOpenChange={setDockOpen}
      ribbon={ribbon} explorer={explorer} center={<ScrollArea className="h-full min-h-0 bg-pl-bg">{center}</ScrollArea>} statusBar={statusBar}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border">
          {dockContent}
        </ScrollArea>
      )} />
  );
}
