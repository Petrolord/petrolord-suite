// Rock Physics Studio workspace controller (G6.4) on the shared
// WorkspaceShell: registry wells + engine-input inventory on the
// left, the Fluids & Gassmann / AVO / Wedge panels in the center,
// scenario + rock-model parameters in the right dock. Owns all state;
// every data touch goes through the injected backend so
// /dev/rock-physics-studio runs the identical app on
// makeInMemoryBackend (no auth/DB).
//
// The AVO and Wedge panels stay usable with no well selected (manual
// halfspaces / pure wedge parameters); Fluids & Gassmann needs curves.
// Estimated Vs is badged app-wide (plan decision 2 — provenance never
// silently mixed).
//
// RP0 (2026-09-06): display units live here (velocity or slowness,
// density, depth) and convert at the edge; the depth default is the
// account's Geoscience depth unit through the backend. RP1: the
// substituted case publishes to the well as VP_SUB / VS_SUB / RHOB_SUB.
// RP2: Open-in launchers for the selected well, Well data (Well Data
// Manager on the logs tab) and the help guide; `appPaths` lets the
// harness point them at the /dev/* apps.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPrePt9aPhie, PRE_PT9A_PHIE_NOTE } from '@/lib/petroProvenance';
import { Link } from 'react-router-dom';
import { Waves, Loader2, Save, HelpCircle, Database, Users } from 'lucide-react';
import { OpenInAppMenu } from '@/components/wells/OpenInAppMenu';
import { useAppUnits } from '@/lib/units/useAppUnits';
import UnitProfileNote from '@/components/units/UnitProfileNote';
import { appPath, wellDataManagerHref, WELL_DATA_MANAGER_ID } from '@/components/wells/appLinks';
import { RecordSharingBar, useRecordSharing } from '@/components/recordSharing';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import RockParamsPanel, { TEMPERATURE_UNITS, PRESSURE_UNITS, GOR_UNITS } from './RockParamsPanel';
import FluidsPanel from './FluidsPanel';
import AvoPanel from './AvoPanel';
import CrossplotPanel from './CrossplotPanel';
import ElasticPanel from './ElasticPanel';
import WorkbenchPanel from './WorkbenchPanel';
import GatherPanel from './GatherPanel';
import WedgePanel from './WedgePanel';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { DEFAULT_AVO, DEFAULT_WEDGE } from '../services/defaults';
import {
  UNITS_KEY, VELOCITY_UNITS, DENSITY_UNITS, DEPTH_UNITS, readUnits,
} from '../services/units';
import { preparePublishLogs, prepareEstimatedSonicLog, ENGINE } from '../services/publish';
import { pseudoConfig, calibrateOn, calibratedConfig, savedPseudo } from '../services/pseudoSonic';
import PseudoSonicBox from './PseudoSonicBox';
import { mineralModelLogs, buildMineralSet, porePressureLog, zonePorePressure, saturationHeightSw } from '../services/petroInputs';
import { makeWellFrame } from '@/lib/wellDatum';
import { packGather } from '@/lib/rockPhysicsGather';
import { PIPELINE_VERSION } from '../services/publish';
import { projectRowFromState, projectStateFromRow } from '../services/projectState';
import { applyIterativeVs, shearSourceText } from '../services/iterativeVs';
import { applyLocalShearTrend } from '../services/localShear';

const storage = () => { try { return window.localStorage; } catch { return null; } };
const publishedBy = (logs) => logs.filter((l) => l.provenance?.computed && l.provenance?.engine === ENGINE);

// the AVO and wedge defaults live in services/defaults.js (the help
// guide quotes them without pulling the workstation chunk in)
export { DEFAULT_AVO, DEFAULT_WEDGE } from '../services/defaults';

const RP_ID = 'rock-physics-studio';

/** @param {Object<string,string>} [p.appPaths] route overrides for the launchers (harness) */
function RockWorkstationContent({ backend, appPaths = {} }) {
  const [wells, setWells] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [wellData, setWellData] = useState(null); // {wellId, model, inventory, tops}
  const [zones, setZones] = useState([]);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [rock, setRock] = useState(DEFAULT_ROCK);
  const [avo, setAvo] = useState(DEFAULT_AVO);
  const [wedge, setWedge] = useState(DEFAULT_WEDGE);
  const [view, setView] = useState('fluids'); // 'fluids' | 'crossplot' | 'elastic' | 'workbench' | 'avo' | 'gather' | 'wedge'
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [projectId, setProjectId] = useState(null);
  // Organisation sharing (rp_projects): the open project's row (the user's own
  // by default, or one a colleague shared), the shared ones on offer, and the
  // sharing state, check-out and history of the open one.
  const [projectRow, setProjectRow] = useState(null);
  const [sharedProjects, setSharedProjects] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const sharing = useRecordSharing({
    store: backend.sharing,
    table: 'rp_projects',
    record: projectRow,
    onChange: (next) => setProjectRow((r) => (r && r.id === next.id ? { ...r, ...next } : r)),
  });
  const viewingShared = !!projectRow && !!sharing.userId && !!projectRow.user_id && projectRow.user_id !== sharing.userId;
  // RP-U1-013: the zone is workstation state so Save keeps it with the well
  const [zoneId, setZoneId] = useState('');
  const [restoreWellId, setRestoreWellId] = useState(null);
  // U2-007: the pseudo-sonic for wells with no sonic log
  const rockRef = useRef(rock);
  rockRef.current = rock;
  const [sonicWells, setSonicWells] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [pseudoBusy, setPseudoBusy] = useState(false);
  const [pseudoError, setPseudoError] = useState('');
  // U2-011: SCAL Studio projects and the saturation-height Sw on this well
  const [scalProjects, setScalProjects] = useState([]);
  const [shm, setShm] = useState(null); // {key, ok, data?, name?, fwlTvdssM?, n?, reason?}
  // U2-012: the gather published for Seismolord
  const [publishingGather, setPublishingGather] = useState(false);
  const [gatherNote, setGatherNote] = useState('');
  // Suite unit profile: velocity, density and depth start from the
  // profile; the selectors change this view for the session only, and the
  // older remembered 'rp.units' choice no longer beats the profile
  const unitsHook = useAppUnits('rock-physics', {
    velocity: { family: 'velocity', allowed: VELOCITY_UNITS.map((v) => v.key) },
    density: { family: 'density', allowed: DENSITY_UNITS.map((v) => v.key) },
    depth: { family: 'depth', allowed: DEPTH_UNITS },
    // RP-U1-008: the dock's reservoir conditions and GOR follow the profile too
    temperature: { family: 'temperature', allowed: TEMPERATURE_UNITS },
    pressure: { family: 'pressure', allowed: PRESSURE_UNITS },
    gor: { family: 'gor', allowed: GOR_UNITS },
  }, { fallback: { ...readUnits(storage()), temperature: 'degC', pressure: 'MPa', gor: 'm3/m3' }, legacyKeys: [UNITS_KEY] });
  const { units, setUnit } = unitsHook;

  // RP-U1-001: rows from any release open through one tolerant reader.
  // `shared` names the colleague whose project this is.
  const applyProjectRow = (project, list, { shared = false } = {}) => {
    setProjectId(project.id || null);
    setProjectRow(project);
    backend.sharing?.trackOpened('rp_projects', project);
    const st = projectStateFromRow(project);
    if (st.scenario) setScenario((sc) => ({ ...sc, ...st.scenario }));
    if (st.rock) setRock((r) => ({ ...r, ...st.rock }));
    if (st.avo) setAvo((a) => ({ ...a, ...st.avo }));
    if (st.wedge) setWedge((w) => ({ ...w, ...st.wedge }));
    if (st.zoneId) setZoneId(st.zoneId);
    const savedWell = st.wellId && (list || []).find((w) => w.id === st.wellId);
    if (savedWell) setRestoreWellId(savedWell.id);
    const what = shared ? `Opened "${project.name}", shared by a colleague.` : 'Restored saved project.';
    setStatus(st.wellId && !savedWell
      ? `${what} Its well is no longer in the registry you can see; pick a well.`
      : what);
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await backend.listWells();
        if (!live) return;
        setWells(list);
        if (backend.listScalProjects) backend.listScalProjects().then((p) => { if (live) setScalProjects(p || []); }).catch(() => {});
        if (backend.listSharedProjects) backend.listSharedProjects().then((p) => { if (live) setSharedProjects(p || []); }).catch(() => {});
        const project = await backend.loadProject();
        if (!live || !project) return;
        applyProjectRow(project, list);
      } catch (e) {
        if (live) { setStatus(e.message); setWells((w) => w || []); }
      }
    })();
    return () => { live = false; };
  }, [backend]);

  const selected = (wells || []).find((w) => w.id === selectedId) || null;

  const select = useCallback(async (wellId, { keepZone = false, restored = false } = {}) => {
    setSelectedId(wellId);
    if (!keepZone) setZoneId('');
    setLoadingId(wellId);
    setWellData(null);
    setZones([]);
    try {
      const [logs, tops, zoneList] = await Promise.all([
        backend.listLogs(wellId), backend.listTops(wellId), backend.listZones(wellId),
      ]);
      const mapped = mapLogs(logs);
      const curves = {};
      for (const [key, log] of Object.entries(mapped)) {
        if (log) curves[key] = await backend.downloadCurve(log);
      }
      const pseudoSonic = rockRef.current?.pseudoSonic || null;
      // U2-009: the mineral fractions Petrophysics Studio published on this well
      const mineralEntries = [];
      for (const { key, log } of mineralModelLogs(logs)) {
        try { mineralEntries.push({ key, data: await backend.downloadCurve(log) }); } catch { /* an unreadable fraction curve is left out; the model then falls back */ }
      }
      const minerals = mineralEntries.length ? buildMineralSet(mineralEntries) : null;
      // U2-011: a pore pressure curve on the well (Pore Pressure Studio's PP first)
      const ppLog = porePressureLog(logs);
      let pp = null;
      if (ppLog) { try { pp = { log: ppLog, data: await backend.downloadCurve(ppLog) }; } catch { pp = null; } }
      const model = buildModel(curves, mapped, { pseudoSonic, minerals });
      setCalibration(null);
      setPseudoError('');
      setWellData({
        wellId,
        model,
        raw: { curves, mapped, minerals, pp },
        builtWith: JSON.stringify(pseudoSonic),
        inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })),
        published: publishedBy(logs),
        tops,
        notes: model.notes || [],
      });
      setZones(zoneList);
      // PETRO-U2-013: a pre-PT9a Studio PHIE is total porosity; say so
      const oldPhie = mapped.PHIE && isPrePt9aPhie(mapped.PHIE) ? ` ${mapped.PHIE.mnemonic}: ${PRE_PT9A_PHIE_NOTE}` : '';
      setStatus((restored ? 'Restored saved project. ' : '') + (model.vpSource === 'estimated' ? `No sonic log, so Vp is ESTIMATED (${model.vpNote}). ` : '') + (model.vsSource === 'estimated'
        ? `Loaded ${model.n} samples. No DTS, so Vs is estimated (Greenberg-Castagna).`
        : `Loaded ${model.n} samples.`) + (model.notes?.length ? ` ${model.notes.length} reading note${model.notes.length === 1 ? '' : 's'} under the curve list.` : '') + oldPhie);
    } catch (e) {
      setStatus(e.message);
      setWellData(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  // U2-005: with no shear log, Vs in hydrocarbon samples is iterated through
  // the brine state; the zone matters when the in-situ Sw is typed
  // U2-007: a well with no sonic is rebuilt when the pseudo-sonic setting changes
  const pseudoKey = JSON.stringify(rock.pseudoSonic || null);
  const baseModel = useMemo(() => {
    if (!wellData) return null;
    if (wellData.model.vpSource !== 'estimated' || wellData.builtWith === pseudoKey) return wellData.model;
    try { return buildModel(wellData.raw.curves, wellData.raw.mapped, { pseudoSonic: rock.pseudoSonic, minerals: wellData.raw.minerals }); } catch { return wellData.model; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wellData, pseudoKey]);
  const activeZone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  // U2-011: Sw at each sample from the chosen SCAL Studio saturation-height
  // function (Petrophysics Studio's reader), for fluid B
  const shmCfg = scenario.fluidB?.shm;
  const shmKey = shmCfg?.on && shmCfg.projectId && baseModel ? `${wellData?.wellId}|${shmCfg.projectId}|${shmCfg.fwlTvdssM ?? ''}|${baseModel.n}` : null;
  useEffect(() => {
    if (!shmKey) { setShm(null); return undefined; }
    let live = true;
    (async () => {
      try {
        const payload = await backend.loadScalProject(shmCfg.projectId);
        if (!payload) throw new Error('That SCAL Studio project could not be opened.');
        const r = await saturationHeightSw({ payload, depth: baseModel.depth, well: selected, fwlTvdssM: shmCfg.fwlTvdssM });
        if (live) setShm({ key: shmKey, ...r });
      } catch (e) {
        if (live) setShm({ key: shmKey, ok: false, reason: e.message });
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shmKey, backend]);
  const fluidModel = useMemo(
    () => (baseModel && shm?.ok && shm.key === shmKey ? { ...baseModel, swB: shm.data, swBInfo: { name: shm.name, fwlTvdssM: shm.fwlTvdssM } } : baseModel),
    [baseModel, shm, shmKey],
  );
  const model = useMemo(
    // QI A2: a saved local shear trend replaces Greenberg-Castagna on a well with no shear log
    () => applyIterativeVs(applyLocalShearTrend(fluidModel, rock.localVs), scenario, rock, activeZone),
    [fluidModel, scenario, rock, activeZone],
  );

  // RP-U1-013: reopen the saved project's well (once, after the list loads)
  useEffect(() => {
    if (!restoreWellId) return;
    setRestoreWellId(null);
    select(restoreWellId, { keepZone: true, restored: true });
  }, [restoreWellId, select]);

  const applyParams = ({ scenario: s, rock: r }) => {
    setScenario(s);
    setRock(r);
    setStatus('Parameters applied.');
  };

  // One door for every save of the project row. A project a colleague shared
  // is saved into THEIR row only while this user holds its check-out;
  // otherwise the save is refused with the reason.
  const persistProject = async (row, note) => {
    if (viewingShared) {
      if (!sharing.canWrite) throw new Error(`${sharing.readOnlyReason || 'This project is open read-only.'}`);
      return backend.saveProject(row, { id: projectRow.id, note });
    }
    if (projectRow && !sharing.canWrite) throw new Error(sharing.readOnlyReason || 'Start editing first.');
    return backend.saveProject(row, { note });
  };
  const saveProject = async () => {
    setSaving(true);
    try {
      const saved = await persistProject(projectRowFromState({
        scenario, rock, avo, wedge, wellId: wellData?.wellId || null, zoneId: zoneId || null,
      }), 'Project saved');
      if (saved?.id) { setProjectId(saved.id); setProjectRow(saved); backend.sharing?.trackOpened('rp_projects', saved); }
      setStatus('Project saved.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  };
  // "Save a copy" of a colleague's project: this app keeps one project per
  // user, so the copy takes the place of the user's own project (asked first).
  const saveCopyAsMine = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Rock Physics Studio keeps one project per user. Saving a copy replaces your own project with what is on screen. Continue?')) return;
    setSaving(true);
    try {
      const saved = await backend.saveProject(projectRowFromState({
        scenario, rock, avo: { ...avo, published_gather: undefined }, wedge, wellId: wellData?.wellId || null, zoneId: zoneId || null,
      }), { note: `Copied from a colleague's project "${projectRow?.name || ''}"` });
      if (saved?.id) { setProjectId(saved.id); setProjectRow(saved); backend.sharing?.trackOpened('rp_projects', saved); }
      setStatus('Saved as your own project.');
    } catch (e) { setStatus(e.message); } finally { setSaving(false); }
  };
  const openProject = async (id) => {
    try {
      if (id === 'mine') {
        const mine = await backend.loadProject();
        if (mine) applyProjectRow(mine, wells);
        else { setProjectRow(null); setProjectId(null); setStatus('You have no saved project yet. Save to create one.'); }
        return;
      }
      const list = backend.listSharedProjects ? await backend.listSharedProjects() : [];
      setSharedProjects(list);
      const row = list.find((p) => p.id === id);
      if (row) applyProjectRow(row, wells, { shared: true });
      else setStatus('That project is no longer shared with you.');
    } catch (e) { setStatus(e.message); }
  };

  // RP1: the substituted case (the Fluids panel's live result over its
  // zone) becomes VP_SUB / VS_SUB / RHOB_SUB on the well, overwrite-own
  const publish = async ({ sub, indices, kmin }, zone) => {
    if (!wellData || !backend.publishCurves) return;
    setPublishing(true);
    try {
      const prepared = preparePublishLogs(model, sub, indices, zone, {
        scenario, rock, kmin, projectId,
        inputLogIds: wellData.inventory.map(({ log }) => log?.id).filter(Boolean),
      });
      const saved = await backend.publishCurves(wellData.wellId, prepared, projectId);
      const logs = await backend.listLogs(wellData.wellId);
      setWellData((d) => (d && d.wellId === wellData.wellId ? { ...d, published: publishedBy(logs) } : d));
      setStatus(`Published ${saved.map((l) => l.mnemonic).join('/')} to the well registry.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setPublishing(false);
    }
  };

  // U2-012: the gather goes into the project row (avo.published_gather, the
  // rock-physics-gather contract) and is saved at once, so Seismolord's
  // synthetics window can show it for this well
  const publishGather = async ({ gather, zone, substitutedLabel }) => {
    if (!wellData || !selected) return;
    setPublishingGather(true);
    setGatherNote('');
    try {
      const payload = packGather({ well: selected, zone, gather, substitutedLabel, model, pipelineVersion: PIPELINE_VERSION });
      const nextAvo = { ...avo, published_gather: payload };
      const saved = await persistProject(projectRowFromState({
        scenario, rock, avo: nextAvo, wedge, wellId: wellData.wellId, zoneId: zoneId || null,
      }), 'Gather published to Seismolord');
      if (saved?.id) { setProjectId(saved.id); setProjectRow(saved); }
      setAvo(nextAvo);
      setGatherNote(`Published for ${selected.name}, ${zone.name}: Seismolord's synthetics window shows it for this well.`);
      setStatus('Gather published to Seismolord and the project saved.');
    } catch (e) {
      setGatherNote('');
      setStatus(e.message);
    } finally { setPublishingGather(false); }
  };

  // U2-007: the wells that have a sonic log, found when the user asks (one
  // log listing per well), and the calibration against one of them
  const findSonicWells = async () => {
    setPseudoBusy(true);
    setPseudoError('');
    try {
      const found = [];
      for (const w of wells || []) {
        if (w.id === selectedId) continue;
        try { if (mapLogs(await backend.listLogs(w.id)).DT) found.push({ id: w.id, name: w.name }); } catch { /* a well that cannot be listed is skipped */ }
      }
      setSonicWells(found);
    } finally { setPseudoBusy(false); }
  };
  const calibratePseudo = async (wellId) => {
    setPseudoBusy(true);
    setPseudoError('');
    try {
      const mapped = mapLogs(await backend.listLogs(wellId));
      const curves = {};
      for (const key of ['DEPT', 'DT', 'RHOB', 'RT']) if (mapped[key]) curves[key] = await backend.downloadCurve(mapped[key]);
      const result = calibrateOn(buildModel(curves, mapped));
      const well = (wells || []).find((w) => w.id === wellId) || null;
      setCalibration({ wellName: well?.name || 'the calibration well', result });
      if (result.gardner || result.faust) {
        setRock((r) => ({ ...r, pseudoSonic: calibratedConfig(pseudoConfig(r.pseudoSonic, { rhob: true, rt: !!baseModel?.rt }), result, well) }));
        setStatus(`Pseudo-sonic calibrated on ${well?.name || 'the calibration well'}.`);
      }
    } catch (e) {
      setPseudoError(e.message);
    } finally { setPseudoBusy(false); }
  };
  const publishEstimatedSonic = async () => {
    if (!wellData || !baseModel || !backend.publishCurves) return;
    setPublishing(true);
    try {
      const prepared = [prepareEstimatedSonicLog(baseModel, { projectId, inputLogIds: wellData.inventory.map(({ log }) => log?.id).filter(Boolean) })];
      await backend.publishCurves(wellData.wellId, prepared, projectId);
      const logs = await backend.listLogs(wellData.wellId);
      setWellData((d) => (d && d.wellId === wellData.wellId ? { ...d, published: publishedBy(logs) } : d));
      setStatus('Published DT_EST (estimated sonic) to the well registry.');
    } catch (e) {
      setStatus(e.message);
    } finally { setPublishing(false); }
  };
  const sonicBox = baseModel?.vpSource === 'estimated' ? (
    <PseudoSonicBox
      cfg={baseModel.pseudo || pseudoConfig(rock.pseudoSonic, { rhob: true, rt: !!baseModel.rt })}
      note={baseModel.vpNote}
      onChange={(p) => setRock((r) => ({ ...r, pseudoSonic: { ...savedPseudo(pseudoConfig(r.pseudoSonic, { rhob: true, rt: !!baseModel.rt })), ...p } }))}
      sonicWells={sonicWells}
      onFindWells={findSonicWells}
      onCalibrate={calibratePseudo}
      calibration={calibration}
      busy={pseudoBusy}
      error={pseudoError}
      onPublish={backend.publishCurves ? publishEstimatedSonic : null}
      publishing={publishing}
    />
  ) : null;

  // what the other apps have published on this well, for the dock (U2-009, U2-011)
  const wellInputs = useMemo(() => {
    if (!wellData) return { scalProjects };
    let pp = null;
    if (wellData.raw?.pp) {
      let tvd = null;
      try {
        // TVD below the depth reference, through the shared datum module (no datum needed for TVD)
        const frame = makeWellFrame(selected);
        tvd = (md) => { try { return frame.mdToTvd(md); } catch { return NaN; } };
      } catch { tvd = null; }
      pp = zonePorePressure(wellData.raw.pp.log, wellData.raw.pp.data, activeZone, tvd);
    }
    const shmNote = !shmKey ? null : !shm || shm.key !== shmKey
      ? { ok: true, text: 'Reading the saturation-height function...' }
      : shm.ok
        ? { ok: true, text: `${shm.name}: Sw from the height above the free-water level at ${(units.depth === 'ft' ? shm.fwlTvdssM / 0.3048 : shm.fwlTvdssM).toFixed(1)} ${units.depth === 'ft' ? 'ft' : 'm'} TVDSS, on ${shm.n} samples.` }
        : { ok: false, text: `${shm.reason} The typed Sw is used.` };
    return { minerals: wellData.raw?.minerals || null, pp, scalProjects, shm: shmNote };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wellData, activeZone, selected, scalProjects, shm, shmKey, units.depth]);

  const unitSelect = (key, options, title) => (
    <select
      data-testid={`rp-unit-${key}`}
      title={title}
      value={units[key]}
      onChange={(e) => setUnit(key, e.target.value)}
      className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text"
    >
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.key} value={o.key}>{o.label}</option>))}
    </select>
  );

  const viewButton = (key, label, disabled = false) => (
    <button
      type="button"
      data-testid={`rp-view-${key}`}
      disabled={disabled}
      className={`whitespace-nowrap px-2 py-1 text-xs rounded border disabled:opacity-40
        ${view === key ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border-strong text-pl-muted hover:text-pl-text'}`}
      onClick={() => setView(key)}
    >
      {label}
    </button>
  );

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" />
      <Waves className="w-4 h-4 text-pl-primary-text" />
      <span className="whitespace-nowrap text-sm font-semibold text-pl-text">Rock Physics Studio</span>
      <span className="hidden min-w-0 truncate text-[11px] text-pl-muted 2xl:inline">fluid substitution, AVO and tuning on the shared well registry</span>
      <div className="ml-4 flex items-center gap-1">
        {viewButton('fluids', 'Fluids & Gassmann')}
        {viewButton('crossplot', 'Crossplot')}
        {viewButton('elastic', 'Elastic logs')}
        {viewButton('workbench', 'Multi-well')}
        {viewButton('avo', 'AVO')}
        {viewButton('gather', 'Gather')}
        {viewButton('wedge', 'Wedge')}
      </div>
      {model?.vpSource === 'estimated' && (
        <span
          data-testid="rp-vp-badge"
          title={`This well has no sonic log. Vp is estimated: ${model.vpNote}. Every velocity, impedance and reflectivity is indicative only.`}
          className="whitespace-nowrap rounded px-1.5 py-0.5 bg-pl-warning-bg border border-pl-warning text-pl-warning-text text-[11px]"
        >
          Vp estimated
        </span>
      )}
      {model?.vsSource === 'estimated' && (
        <span
          data-testid="rp-vs-badge"
          title={`This well has no shear log. ${shearSourceText(model)}.`}
          className="rounded px-1.5 py-0.5 bg-pl-warning-bg border border-pl-warning text-pl-warning-text text-[11px]"
        >
          Vs estimated
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {selected && (
          <Link
            to={wellDataManagerHref(selected.id, 'logs', appPath(WELL_DATA_MANAGER_ID, appPaths))}
            data-testid="rp-open-wdm"
            title="Open this well in Well Data Manager on its logs (published curves are listed there)"
            className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-xs rounded border border-pl-border-strong text-pl-text hover:text-pl-text hover:bg-pl-sunken"
          >
            <Database className="w-3.5 h-3.5" /> Well data
          </Link>
        )}
        <OpenInAppMenu wellIds={selected ? [selected.id] : []} paths={appPaths} exclude={[RP_ID]} testIdPrefix="rp" className="whitespace-nowrap" />
        <Link
          to={`${appPath(RP_ID, appPaths)}/help`}
          data-testid="rp-help"
          title="Open the Rock Physics Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border-strong text-pl-text hover:text-pl-text hover:bg-pl-sunken"
        >
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <span className="w-px h-4 bg-pl-border mx-1" />
        <span className="text-[11px] text-pl-muted mr-1">Units</span>
        {unitSelect('velocity', VELOCITY_UNITS, 'Velocity or sonic slowness display unit (the engine stays in m/s)')}
        {unitSelect('density', DENSITY_UNITS, 'Density display unit (the engine stays in kg/m3)')}
        {unitSelect('depth', DEPTH_UNITS, 'Depth display unit; starts from your Suite units and changes this view for the session')}
        <span className="w-px h-4 bg-pl-border mx-1" />
        {sharedProjects.length > 0 && (
          <select
            data-testid="rp-project-select"
            aria-label="Project"
            title="Your own project, or one a colleague shared with your organisation"
            className="rounded border border-pl-border-strong bg-pl-surface px-1.5 py-1 text-xs text-pl-text"
            value={viewingShared ? projectRow.id : 'mine'}
            onChange={(e) => openProject(e.target.value)}
          >
            <option value="mine">My project</option>
            <optgroup label="Shared with me">
              {sharedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          </select>
        )}
        {projectRow && backend.sharing && (
          <button
            type="button"
            data-testid="rp-share"
            aria-pressed={shareOpen || viewingShared}
            title="Share this project with your organisation, see who is editing and the history. A shared project also shows its published gather to colleagues in Seismolord."
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${shareOpen || viewingShared ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border-strong text-pl-text hover:bg-pl-sunken'}`}
            onClick={() => setShareOpen((v) => !v)}
          >
            <Users className="w-3.5 h-3.5" /> Share
          </button>
        )}
        <button
          type="button"
          data-testid="rp-save-project"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-pl-border-strong text-pl-text hover:bg-pl-sunken"
          onClick={saveProject}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          data-testid="rp-toggle-dock"
          className={`whitespace-nowrap px-2 py-1 text-xs rounded border
            ${dockOpen ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border-strong text-pl-muted'}`}
          onClick={() => setDockOpen((v) => !v)}
        >
          Scenario & rock
        </button>
        <ThemeToggle className="h-7 w-7" />
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="rp-status" className="truncate">{status}</span>
      {/* RP-U1-017: in the ribbon this note wrapped into a 400 px column when
          the view differed from the profile; the status bar has the width */}
      <UnitProfileNote u={unitsHook} className="min-w-0 shrink flex-nowrap whitespace-nowrap overflow-hidden" />
      <span className="ml-auto whitespace-nowrap">
        {selected ? `${selected.name} · ${model ? `${model.n} samples` : '…'}` : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-pl-muted" title="Every stored and computed value is SI; the unit selectors only change the display">SI internal (m/s · kg/m³ · Pa)</span>
    </div>
  );

  const needsWell = (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="rp-empty">
      {!wells ? (
        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry wells…</>
      ) : selectedId && !wellData ? (
        loadingId ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading curves…</> : status
      ) : (
        'Select a well to run fluid substitution.'
      )}
    </div>
  );

  const center = view === 'crossplot' ? (
    model ? (
      <CrossplotPanel model={model} zones={zones} scenario={scenario} rock={rock} units={units} zoneId={zoneId} onZoneChange={setZoneId} />
    ) : needsWell
  ) : view === 'elastic' ? (
    model ? (
      <ElasticPanel model={model} zones={zones} units={units} zoneId={zoneId} onZoneChange={setZoneId} rock={rock} onRockChange={setRock} wellName={selected?.name || ''} />
    ) : needsWell
  ) : view === 'workbench' ? (
    <WorkbenchPanel wells={wells || []} backend={backend} rock={rock} units={units} currentWellId={selectedId || null} projectId={projectId} />
  ) : view === 'gather' ? (
    model ? (
      <GatherPanel model={model} zones={zones} scenario={scenario} rock={rock} avo={avo} onAvoChange={setAvo} units={units} zoneId={zoneId} onZoneChange={setZoneId} well={selected} onPublishGather={publishGather} publishingGather={publishingGather} publishNote={gatherNote} />
    ) : needsWell
  ) : view === 'wedge' ? (
    <WedgePanel wedge={wedge} onWedgeChange={setWedge} units={units} />
  ) : view === 'avo' ? (
    // RP-U1-016: the panel (and its Manual halfspaces button) shows with no
    // well too; before, a new user on "From top" had no way to reach manual
    <AvoPanel model={model} tops={wellData?.tops || []} avo={avo} onAvoChange={setAvo} units={units} scenario={scenario} rock={rock} />
  ) : (
    model ? (
      <FluidsPanel
        model={model}
        zones={zones}
        scenario={scenario}
        rock={rock}
        units={units}
        zoneId={zoneId}
        onZoneChange={setZoneId}
        well={selected}
        onPublish={backend.publishCurves ? publish : null}
        publishing={publishing}
      />
    ) : needsWell
  );

  return (
    <WorkspaceShell
      autoSaveId="rockphysicsstudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={(
        <>
          {ribbon}
          {projectRow && (shareOpen || viewingShared || sharing.access?.sharedEdit) && (
            <div className="px-2 py-1 bg-pl-surface border-b border-pl-border" data-testid="rp-sharing-strip">
              <RecordSharingBar
                sharing={sharing}
                label="project"
                onSaveCopy={saveCopyAsMine}
                onReload={() => openProject(viewingShared ? projectRow.id : 'mine')}
                fieldLabels={{ scenarios: 'the fluid scenario', rock: 'rock parameters', avo: 'AVO and the published gather', wedge: 'the wedge', well_ids: 'the well' }}
              />
            </div>
          )}
        </>
      )}
      explorer={(
        <WellExplorer
          wells={wells || []}
          selectedId={selectedId}
          loadingId={loadingId}
          curveInventory={wellData?.inventory}
          published={wellData?.published}
          readNotes={baseModel?.notes || wellData?.notes}
          sonicBox={sonicBox}
          onSelect={select}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border">
          <RockParamsPanel scenario={scenario} rock={rock} onApply={applyParams} units={units} onUnit={setUnit} wellInputs={wellInputs} />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}

// Design system rollout batch 4D: Rock Physics Studio opens light and
// follows the user's theme choice from the ribbon toggle. The route page
// and the /dev harness both mount this component, so they share the one
// scope. The wedge synthetic stays on its dark canvas; charts stay white.
/** @param {Object<string,string>} [p.appPaths] route overrides for the launchers (harness) */
export default function RockWorkstation(props) {
  return (
    <div className="h-full" data-testid="rp-theme-scope">
      <RockWorkstationContent {...props} />
    </div>
  );
}
