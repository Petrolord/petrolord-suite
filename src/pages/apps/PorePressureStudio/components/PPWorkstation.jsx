// Pore Pressure Studio workspace controller (P3) on the shared
// WorkspaceShell: registry wells on the left, the prognosis / NCT
// views in the center, method parameters + calibration in the right
// dock. Owns all state; every data touch goes through the injected
// backend so /dev/pore-pressure-studio runs the identical app on
// makeInMemoryBackend (no auth/DB).
//
// The harness backend seeds the oracle goldens' synthetic well and
// parameters, so the depth readout reproduces the goldens' pressures
// and fitting the NCT on hydrostatic-section picks recovers the
// generating (dt_ml, c) — the e2e suite asserts both off the screen.
//
// PP0 (2026-09-06): display units live here (pressure as MPa, psi or
// an equivalent mud weight in ppg or sg; depth in the account's
// Geoscience unit) and convert at the edge; the engine, the project
// and the published curves stay SI. Prognosis CSV is the display-unit
// deliverable for the well plan. PP1: Well data, Open in and Help
// launchers; `appPaths` lets the harness point them at the /dev/* apps.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, Loader2, Save, Upload, Download, HelpCircle, Database, FileText } from 'lucide-react';
import { OpenInAppMenu } from '@/components/wells/OpenInAppMenu';
import { useAppUnits } from '@/lib/units/useAppUnits';
import UnitProfileNote from '@/components/units/UnitProfileNote';
import { appPath, wellDataManagerHref, WELL_DATA_MANAGER_ID } from '@/components/wells/appLinks';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import WellExplorer from './WellExplorer';
import ParamsPanel from './ParamsPanel';
import PrognosisChart from './PrognosisChart';
import NctPanel from './NctPanel';
import {
  mapLogs, buildProfileInput, normalizePpCurves, wellDepthFrame, normalizeResistivity,
} from '../services/prep';
import { computeProfile } from '../engine/profile';
import { pseudoSonicFromLinearVelocity } from '../engine/velocitySource';
import { layerCakeProfile } from '@/lib/velocityModels';
import { preparePublishLogs, publishBlocker } from '../services/publish';
import { inputNotes, trendDepthM } from '../services/honesty';
import { reviewerLines, prognosisPdf } from '../services/report';
import { drillingWindow, casingDesign, WINDOW_FROM_BML_M } from '../services/drillingWindow';
import { pickShaleLog, normalizeShaleIndicator } from '../services/shalePicks';
import { fitTarget, fitToCalibration } from '../services/calibrate';
import { datumToMudline } from '../services/alongHole';
import { comparesTo } from '../services/calibrationImport';
import {
  UNITS_KEY, PRESSURE_UNITS, DEPTH_UNITS, readUnits, depthFromDisplay, tidyDepth,
  fmtPressure, fmtDepth, emwReferenceDepthM, emwDatumLabel, isEmw, prognosisCsv,
} from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  DEPTH_REF_KEY, VIEW_REFS, depthReferences, refMapper, refShort, refLabel,
} from '../services/depthRef';

const storage = () => { try { return window.localStorage; } catch { return null; } };

// PP-U1-017: no invented water column; a new project starts onshore (water
// depth 0) and an offshore well says to set the water depth and mudline MD
export const DEFAULT_PARAMS = {
  waterDepthM: 0,
  rhoSeawaterKgM3: 1025,
  rhoFluidKgM3: 1030,
  mudlineMdM: 0,
  nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 },
  method: 'eaton',
  eatonN: 3,
  bowers: { A: 10, B: 0.75 },
  nu: 0.4,
  // U2-001: resistivity Eaton, Eaton's published exponent 1.2
  resNct: { r0OhmM: 0.6, bPerM: 2e-4 },
  eatonNRes: 1.2,
};

const PP_ID = 'pore-pressure-studio';

/** @param {Object<string,string>} [p.appPaths] route overrides for the launchers (harness) */
export default function PPWorkstation({ backend, appPaths = {} }) {
  const [wells, setWells] = useState(null);
  const [velocityModels, setVelocityModels] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [curves, setCurves] = useState(null); // {depth, dt, rho, units, logIds}
  const [seismicModel, setSeismicModel] = useState(null); // exclusive with curves
  const [projectId, setProjectId] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [picks, setPicks] = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [view, setView] = useState('prognosis'); // 'prognosis' | 'nct'
  const [readoutDepthM, setReadoutDepthM] = useState(3500); // SI; the text below is its display
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  // PP-U1-010: the NCT was fitted on the open well (or comes from the project/default)
  const [nctFittedFor, setNctFittedFor] = useState(null);
  // U2-001: the resistivity trend was fitted on the open well
  const [resNctFittedFor, setResNctFittedFor] = useState(null);
  // Suite unit profile: depth and pressure start from the profile; the
  // selectors below change this view for the session only, and the older
  // remembered 'pp.units' choice no longer beats the profile
  const unitsHook = useAppUnits('pore-pressure', {
    depth: { family: 'depth', allowed: DEPTH_UNITS },
    pressure: { family: 'pressure', allowed: PRESSURE_UNITS.map((p) => p.key) },
  }, { fallback: readUnits(storage()), legacyKeys: [UNITS_KEY] });
  const { units, setUnit } = unitsHook;
  const [readoutText, setReadoutText] = useState(() => tidyDepth(3500, units.depth));
  // U2-004: the depth frame the prognosis is read in (remembered per browser)
  const [depthRefKey, setDepthRefKey] = useState(() => {
    try { const v = window.localStorage.getItem(DEPTH_REF_KEY); return VIEW_REFS.some((r) => r.key === v) ? v : 'bml'; } catch { return 'bml'; }
  });
  const chooseDepthRef = (k) => { setDepthRefKey(k); try { window.localStorage.setItem(DEPTH_REF_KEY, k); } catch { /* per-viewer convenience */ } };

  // the readout text follows the depth unit; typing edits the SI depth
  useEffect(() => { setReadoutText(tidyDepth(mapperRef.current ? mapperRef.current.fromBml(readoutDepthM) : readoutDepthM, units.depth)); }, [units.depth, depthRefKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapperRef = React.useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [list, models] = await Promise.all([
          backend.listWells(),
          backend.listVelocityModels ? backend.listVelocityModels() : [],
        ]);
        if (!live) return;
        setWells(list);
        setVelocityModels(models);
        const project = await backend.loadProject();
        if (!live || !project) return;
        setProjectId(project.id || null);
        if (project.params) setParams((p) => ({ ...p, ...project.params }));
        if (project.picks) setPicks(project.picks);
        if (project.source?.nctFittedFor) setNctFittedFor(project.source.nctFittedFor);
        if (project.source?.resNctFittedFor) setResNctFittedFor(project.source.resNctFittedFor);
        if (project.calibration) setCalibration(project.calibration);
        setStatus('Restored saved project.');
        // PP-U1-013: reopen the well the project was saved on
        const savedWell = project.source?.kind === 'well' ? project.source.wellId : null;
        if (savedWell && list.some((w) => w.id === savedWell)) setReopenId(savedWell);
      } catch (e) {
        if (live) { setStatus(e.message); setWells((w) => w || []); }
      }
    })();
    return () => { live = false; };
  }, [backend]);

  const selected = (wells || []).find((w) => w.id === selectedId) || null;
  const [reopenId, setReopenId] = useState(null);

  const select = useCallback(async (wellId, { keepPicks = false } = {}) => {
    setSelectedId(wellId);
    setSeismicModel(null);
    setLoadingId(wellId);
    setCurves(null);
    if (!keepPicks) setPicks([]);
    try {
      const logs = await backend.listLogs(wellId);
      const mapped = mapLogs(logs);
      if (!mapped.DEPT || !mapped.DT) {
        throw new Error('This well has no depth + sonic pair. Pore pressure needs a sonic log.');
      }
      const [depth, dt] = await Promise.all([
        backend.downloadCurve(mapped.DEPT), backend.downloadCurve(mapped.DT),
      ]);
      const rho = mapped.RHOB ? await backend.downloadCurve(mapped.RHOB) : null;
      const resRaw = mapped.RES ? await backend.downloadCurve(mapped.RES) : null;
      // U2-005: the shale indicator for the NCT picks (VSH, else GR)
      const shaleLog = pickShaleLog(logs);
      const shaleRaw = shaleLog ? await backend.downloadCurve(shaleLog.log) : null;
      const shaleN = shaleRaw && shaleRaw.length === depth.length ? normalizeShaleIndicator(shaleRaw, shaleLog) : null;
      // PP-U1-004: vendor nulls, kg/m3 density and us/ft sonic are read for
      // what they are, and each decision is said
      const norm = normalizePpCurves({ depth, dt, rho, dtLog: mapped.DT, rhoLog: mapped.RHOB });
      // U2-001: the deep resistivity, for resistivity Eaton
      const resN = resRaw && resRaw.length === depth.length ? normalizeResistivity(resRaw, mapped.RES) : null;
      setCurves({
        depth: norm.depth,
        dt: norm.dt,
        rho: norm.rho,
        res: resN ? resN.res : null,
        shale: shaleN ? shaleN.values : null,
        shaleKind: shaleN ? shaleN.kind : null,
        shaleName: shaleN ? shaleN.name : null,
        resName: mapped.RES?.mnemonic || null,
        units: norm.units,
        fileUnits: { DT: mapped.DT.unit, RHOB: mapped.RHOB?.unit, RES: mapped.RES?.unit },
        notes: [...norm.notes, ...(resN ? resN.notes : []), ...(shaleN ? shaleN.notes : [])],
        logIds: Object.values(mapped).filter(Boolean).map((l) => l.id),
      });
      setNctFittedFor((prev) => (prev === wellId ? prev : null));
      setResNctFittedFor((prev) => (prev === wellId ? prev : null));
      setStatus(`Loaded ${depth.length} samples${rho ? '' : '. No density log, so the overburden uses Gardner'}.${norm.notes.length ? ` ${norm.notes.join(' ')}` : ''}`);
    } catch (e) {
      setStatus(e.message);
      setCurves(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  useEffect(() => {
    if (!reopenId) return;
    setReopenId(null);
    select(reopenId, { keepPicks: true });
  }, [reopenId, select]);

  // Seismolord U2-006: a layer cake is read at a well (the well selected
  // when the model is chosen); its boundary times come from the published
  // boundary surfaces
  const [layerCakeAt, setLayerCakeAt] = useState(null);   // {wellName, boundaryTwtMs, note, td}|{error}
  // PP-U1-012: a velocity trend runs to the well's TD (layer cake) or
  // 6,000 m below mudline, not a fixed 4,000 m
  const trendZMaxM = trendDepthM(layerCakeAt?.tdMdM, params);
  const selectVelocityModel = useCallback((model) => {
    const at = (wells || []).find((w) => w.id === selectedId) || null;
    setSeismicModel(model);
    setSelectedId(null);
    setCurves(null);
    setPicks([]);
    setLayerCakeAt(null);
    if (model.kind === 'layercake') {
      if (!at) {
        setLayerCakeAt({ error: 'A layer cake changes across the survey: select a well first, then choose the layer cake; it is read at that well.' });
        setStatus('Select a well first: the layer cake is read at its location.');
        return;
      }
      if (!backend.layerCakeBoundariesAt) {
        setLayerCakeAt({ error: 'This backend cannot read layer cakes.' });
        return;
      }
      setStatus(`Reading the layer cake of ${model.name} at ${at.name}...`);
      backend.layerCakeBoundariesAt(model, at, { srdElevM: Number(params.seismicDatumElevM) || 0 })
        .then((r) => {
          setLayerCakeAt({ ...r, wellName: at.name, wellId: at.id, modelId: model.id, srd: Number(params.seismicDatumElevM) || 0, tdMdM: at.td_md_m ?? null });
          setStatus(`Velocity trend from the ${model.name} layer cake at ${at.name}: a trend-grade prognosis (no local anomaly).${r.note ? ` ${r.note}` : ''}`);
        })
        .catch((e) => { setLayerCakeAt({ error: e.message }); setStatus(e.message); });
      return;
    }
    setStatus(`Velocity trend from ${model.name}: a trend-grade prognosis (no local anomaly).`);
  }, [wells, selectedId, backend, params.seismicDatumElevM]);

  // U2-008: a new seismic datum moves the crossings; read the layer cake again
  useEffect(() => {
    const srd = Number(params.seismicDatumElevM) || 0;
    if (seismicModel?.kind !== 'layercake' || !layerCakeAt?.wellId || layerCakeAt.srd === srd || !backend.layerCakeBoundariesAt) return;
    const at = (wells || []).find((w) => w.id === layerCakeAt.wellId);
    if (!at) return;
    let live = true;
    backend.layerCakeBoundariesAt(seismicModel, at, { srdElevM: srd })
      .then((r) => { if (live) setLayerCakeAt((prev) => ({ ...prev, ...r, srd })); })
      .catch((e) => { if (live) setLayerCakeAt({ error: e.message }); });
    return () => { live = false; };
  }, [params.seismicDatumElevM, seismicModel, layerCakeAt, wells, backend]);

  const byRes = params.method === 'eaton-resistivity';
  // U2-008: the mudline below the declared seismic datum (SRD), not the water depth alone
  const trendWell = seismicModel ? (wells || []).find((w) => w.name === layerCakeAt?.wellName) || null : null;
  const datum = datumToMudline(params, { kbM: trendWell?.kb_m != null ? Number(trendWell.kb_m) : null });
  const input = useMemo(() => {
    try {
      if (seismicModel && byRes) {
        return { error: 'A velocity trend carries no resistivity: choose Eaton sonic or Bowers for a seismic trend.' };
      }
      if (seismicModel?.kind === 'layercake') {
        if (!layerCakeAt) return null;
        if (layerCakeAt.error) return { error: layerCakeAt.error };
        return layerCakeProfile(seismicModel.velocity, layerCakeAt.boundaryTwtMs, {
          datumToMudlineM: datum.value,
          zMaxM: trendZMaxM,
          stepM: 10,
        });
      }
      if (seismicModel) {
        // model datum = sea level; the water column is the offset
        return pseudoSonicFromLinearVelocity(seismicModel.velocity, {
          datumToMudlineM: datum.value,
          zMaxM: trendZMaxM,
          stepM: 10,
        });
      }
      if (!curves) return null;
      // PP-U1-002: a deviated well is computed at TVD through its survey
      return buildProfileInput(curves, curves.units, {
        mudlineMdM: params.mudlineMdM, frame: wellDepthFrame(selected), needs: byRes ? 'res' : 'dt',
      });
    } catch (e) {
      return { error: e.message };
    }
  }, [curves, seismicModel, layerCakeAt, params.mudlineMdM, params.waterDepthM, selected, trendZMaxM, byRes, datum.value]);

  const profile = useMemo(() => {
    if (!input || input.error) return null;
    try {
      return { result: computeProfile({ ...input, params }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [input, params]);

  const result = profile?.result || null;
  const windowInfo = useMemo(() => (result && input ? drillingWindow(result, input.zBmlM, params) : null), [result, input, params]);
  // U2-003: kick and trip margins and the bottom-up casing seats
  const casing = useMemo(() => (result && input ? casingDesign(result, input.zBmlM, params) : null), [result, input, params]);
  // U2-004: every sample in each depth frame the source supports
  const refs = useMemo(() => (input && !input.error ? depthReferences(input, params, {
    frame: seismicModel ? null : wellDepthFrame(selected),
    kbM: !seismicModel && selected?.kb_m != null && Number.isFinite(Number(selected.kb_m)) ? Number(selected.kb_m) : null,
    source: seismicModel ? 'seismic' : 'well',
  }) : null), [input, params, seismicModel, selected]);
  const mapper = useMemo(() => refMapper(refs, depthRefKey), [refs, depthRefKey]);
  mapperRef.current = mapper;
  const zRef = (zBml) => `${fmtDepth(mapper.fromBml(zBml), units.depth)} ${units.depth} ${refShort(mapper.key)}`;
  const computeError = input?.error || profile?.error || null;

  // PL4: what the prognosis rests on (datum, TVD, gaps, density, NCT, calibration)
  const notes = useMemo(() => inputNotes({
    input,
    result,
    params,
    source: seismicModel ? 'seismic' : 'well',
    nctFitted: byRes
      ? !!resNctFittedFor && resNctFittedFor === selectedId
      : !!nctFittedFor && nctFittedFor === (selectedId || (seismicModel ? `model:${seismicModel.id}` : null)),
    trend: byRes ? 'res' : 'dt',
    calibration,
    fmtZ: (m) => `${fmtDepth(m, units.depth)} ${units.depth}`,
    fmtP: (mpa) => (units.pressure === 'psi' ? `${fmtPressure(mpa * 1e6, 'psi')} psi` : `${mpa.toFixed(2)} MPa`),
    seismicNote: seismicModel ? [datum.note, layerCakeAt?.note].filter(Boolean).join(' ') : null,
  }), [input, result, params, seismicModel, nctFittedFor, resNctFittedFor, byRes, selectedId, calibration, units, datum.note, layerCakeAt]);

  const readout = useMemo(() => {
    if (!result || !input) return null;
    const z = readoutDepthM;
    if (!Number.isFinite(z)) return null;
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) {
      if (Math.abs(input.zBmlM[i] - z) < Math.abs(input.zBmlM[best] - z)) best = i;
    }
    const zM = input.zBmlM[best];
    const ref = emwReferenceDepthM(zM, params);
    const u = units.pressure;
    return {
      z: zM,
      ref,
      obg: fmtPressure(result.overburdenPa[best], u, ref),
      ph: fmtPressure(result.hydrostaticPa[best], u, ref),
      pp: fmtPressure(result.porePressurePa[best], u, ref),
      fg: fmtPressure(result.fracPressurePa[best], u, ref),
    };
  }, [result, input, readoutDepthM, units.pressure, params]);

  const reportArgs = () => ({
    wellName: selected?.name || '',
    source: seismicModel ? 'seismic' : 'well',
    sourceName: seismicModel?.name || '',
    report: params.report || {},
    params,
    units,
    input,
    result,
    calibration,
    nctFitted: !notes.some((n) => n.key === 'nct'),
    window: windowInfo,
    casing,
    mapper,
    refs,
  });

  // PP-U1-008: the reviewer PDF (jsPDF loaded on demand)
  const exportPdf = async () => {
    if (!result || !input) return;
    try {
      const { jsPDF } = await import('jspdf');
      const { loadPetrolordLogo } = await import('@/lib/pdfBrand');
      const logo = await loadPetrolordLogo().catch(() => null);
      const doc = prognosisPdf(jsPDF, reportArgs(), { logo });
      const name = (seismicModel ? seismicModel.name : (selected?.name || 'well')).replace(/[^\w.-]+/g, '_');
      doc.save(`prognosis-${name}.pdf`);
      setStatus('Prognosis PDF downloaded.');
    } catch (e) {
      setStatus(`The PDF could not be made: ${e.message}`);
    }
  };

  const exportCsv = () => {
    if (!result || !input) return;
    const source = seismicModel ? seismicModel.name : (selected?.name || 'well');
    const csv = prognosisCsv(input, result, params, units, { source, reviewer: reviewerLines(reportArgs()), refs });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prognosis-${source.replace(/[^\w.-]+/g, '_')}-${units.pressure}-${units.depth}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Prognosis CSV in ${units.pressure} and ${units.depth} downloaded.`);
  };

  const unitSelect = (key, options, title) => (
    <select
      data-testid={`pp-unit-${key}`}
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

  const applyDock = ({ params: p, calibration: cal, skipped = [] }) => {
    // a hand-edited trend is no longer the fitted one (PL4)
    const n0 = params.nct; const n1 = p.nct || {};
    if (Math.abs(n0.dtMlUsPerM - n1.dtMlUsPerM) > 1e-6 * n0.dtMlUsPerM || Math.abs(n0.cPerM - n1.cPerM) > 1e-6 * Math.abs(n0.cPerM || 1)
      || Math.abs(n0.dtMaUsPerM - n1.dtMaUsPerM) > 1e-6 * n0.dtMaUsPerM) setNctFittedFor(null);
    const r0 = params.resNct || {}; const r1 = p.resNct || r0;
    if (Math.abs((r0.r0OhmM ?? 0) - (r1.r0OhmM ?? 0)) > 1e-9 * Math.abs(r0.r0OhmM || 1)
      || Math.abs((r0.bPerM ?? 0) - (r1.bPerM ?? 0)) > 1e-9 * Math.abs(r0.bPerM || 1)) setResNctFittedFor(null);
    // keep what the dock does not edit (trend segments, resistivity trend, ...)
    setParams((prev) => ({ ...prev, ...p }));
    setCalibration(cal);
    setStatus(skipped.length
      ? `Parameters applied. ${skipped.length} calibration line${skipped.length === 1 ? '' : 's'} not read (two numbers per line: depth, pressure): ${skipped.slice(0, 3).join(' | ')}`
      : 'Parameters applied.');
  };

  // U2-002: imported calibration points land on the engine frame through
  // the selected well's survey and KB (TVDSS and MD need them)
  const importCtx = useMemo(() => ({
    frame: seismicModel ? null : wellDepthFrame(selected),
    kbM: !seismicModel && Number.isFinite(Number(selected?.kb_m)) && selected?.kb_m != null ? Number(selected.kb_m) : null,
    mudlineMdM: params.mudlineMdM,
    waterDepthM: params.waterDepthM,
  }), [seismicModel, selected, params.mudlineMdM, params.waterDepthM]);
  const importCalibration = (points, summary) => {
    setCalibration((c) => [...c, ...points]);
    setStatus(`Imported ${summary.read} calibration point${summary.read === 1 ? '' : 's'} from ${summary.name}${summary.skipped.length ? `; ${summary.skipped.length} line${summary.skipped.length === 1 ? '' : 's'} not read` : ''}.`);
  };

  const onResNctFitted = (fit) => {
    setResNctFittedFor(selectedId);
    setParams((p) => ({ ...p, resNct: { r0OhmM: fit.r0OhmM, bPerM: fit.bPerM } }));
    setStatus(`Resistivity trend fitted: R0 ${fit.r0OhmM.toFixed(3)} ohm.m, b ${fit.bPerM.toExponential(3)} 1/m.`);
  };

  // U2-006: fit the method's parameter to the measured pressures
  const target = fitTarget(params);
  const ppPoints = calibration.filter((c) => comparesTo(c) === 'pp').length;
  const fitCalibration = () => {
    if (!result || !input) return;
    const r = fitToCalibration(params, input, result, calibration);
    if (r.error) { setStatus(r.error); return; }
    setParams(r.params);
    setStatus(r.text);
  };

  // U2-005: the trend segments fitted on their own picks; a new break unfits the trend
  const onSegmentsFitted = (r) => {
    setNctFittedFor(selectedId || (seismicModel ? `model:${seismicModel.id}` : null));
    setParams((p) => ({ ...p, nct: { ...p.nct, dtMlUsPerM: r.nct.dtMlUsPerM, cPerM: r.nct.cPerM }, nctSegments: r.segments }));
    setStatus(`NCT fitted: ${r.fitted.join(', ')}${r.kept.length ? `; ${r.kept.join(', ')} kept (fewer than two picks)` : ''}.`);
  };
  const onSegmentsChange = (segments) => {
    setParams((p) => ({ ...p, nctSegments: segments }));
    setNctFittedFor(null);
    setStatus(segments.length ? `Trend breaks at ${segments.map((g) => `${fmtDepth(g.zTopM, units.depth)} ${units.depth}`).join(', ')} below mudline: fit the NCT again.` : 'Trend breaks removed: fit the NCT again.');
  };

  const onNctFitted = (fit) => {
    setNctFittedFor(selectedId || (seismicModel ? `model:${seismicModel.id}` : null));
    setParams((p) => ({
      ...p,
      nct: { ...p.nct, dtMlUsPerM: fit.dtMl, cPerM: fit.c },
    }));
    setStatus(`NCT fitted: dt_ml ${fit.dtMl.toFixed(2)} us/m, c ${fit.c.toExponential(3)} 1/m.`);
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      const saved = await backend.saveProject({
        params,
        picks,
        calibration,
        // nctFittedFor rides in the source jsonb (no schema change)
        source: seismicModel
          ? { kind: 'seismic', volumeId: seismicModel.id, nctFittedFor }
          : { kind: 'well', wellId: selectedId, nctFittedFor, resNctFittedFor },
      });
      if (saved?.id) setProjectId(saved.id);
      setStatus('Project saved.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  };

  const blocker = selectedId ? publishBlocker(params, { fmt: (m) => `${fmtDepth(m, units.depth)} ${units.depth}` }) : null;
  const publish = async () => {
    if (!result || !input || !selectedId) return;
    if (blocker) { setStatus(blocker); return; }
    setPublishing(true);
    try {
      const prepared = preparePublishLogs(input, result, params, {
        projectId,
        inputLogIds: curves?.logIds || [],
      });
      const saved = await backend.publishCurves(selectedId, prepared, projectId);
      setStatus(`Published ${saved.map((l) => l.mnemonic).join('/')} to the well registry.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const viewButton = (key, label) => (
    <button
      type="button"
      data-testid={`pp-view-${key}`}
      className={`px-2 py-1 text-xs rounded border
        ${view === key ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:text-pl-text'}`}
      onClick={() => setView(key)}
    >
      {label}
    </button>
  );

  const ribbon = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" />
      <Gauge className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text whitespace-nowrap">Pore Pressure Studio</span>
      <span className="hidden 2xl:inline text-[11px] text-pl-muted">Eaton / Bowers prognosis on the shared well registry</span>
      <div className="ml-4 flex items-center gap-1">
        {viewButton('prognosis', 'Prognosis')}
        {viewButton('nct', 'NCT')}
      </div>
      {result && (
        <div className="ml-4 flex items-center gap-2 text-[11px] text-pl-muted">
          <label htmlFor="pp-readout-depth">at</label>
          <input
            id="pp-readout-depth"
            data-testid="pp-readout-depth"
            className="w-20 px-1.5 py-0.5 rounded bg-pl-surface border border-pl-border-strong text-pl-text text-right"
            value={readoutText}
            onChange={(e) => {
              setReadoutText(e.target.value);
              const d = Number(e.target.value);
              if (Number.isFinite(d)) setReadoutDepthM(mapper.toBml(depthFromDisplay(d, units.depth)));
            }}
          />
          <span data-testid="pp-readout-ref">{units.depth} {refShort(mapper.key)}:</span>
          {readout && (
            <>
              <span data-testid="pp-readout-obg">OBG {readout.obg}</span>
              <span data-testid="pp-readout-ph">Ph {readout.ph}</span>
              <span data-testid="pp-readout-pp" className="text-pl-danger-text">PP {readout.pp}</span>
              <span data-testid="pp-readout-fg">FG {readout.fg}</span>
              <span
                data-testid="pp-readout-unit"
                className="text-pl-muted"
                title={isEmw(units.pressure)
                  ? `Equivalent mud weight at ${tidyDepth(readout.ref, units.depth)} ${units.depth} below ${emwDatumLabel(params)} (depth below mudline plus ${params.mudlineMdM > 0 ? 'the mudline MD' : 'the water depth'}); set the mudline MD in the dock to reference the rotary table`
                  : 'Pressure; choose ppg or sg for an equivalent mud weight'}
              >
                {units.pressure}
              </span>
            </>
          )}
        </div>
      )}
      {seismicModel && (
        <span
          data-testid="pp-trend-badge"
          title="Seismic velocity model (v0+k, or a layer cake read at a well). It constrains the regional trend only; it carries no local overpressure anomaly"
          className="rounded px-1.5 py-0.5 bg-pl-warning-bg border border-pl-warning/40 text-pl-warning-text text-[11px]"
        >
          Trend-grade (seismic velocity)
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {selected && (
          <Link
            to={wellDataManagerHref(selected.id, 'logs', appPath(WELL_DATA_MANAGER_ID, appPaths))}
            data-testid="pp-open-wdm"
            title="Open this well in Well Data Manager on its logs (published curves are listed there)"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
          >
            <Database className="w-3.5 h-3.5" /> Well data
          </Link>
        )}
        <OpenInAppMenu wellIds={selected ? [selected.id] : []} paths={appPaths} exclude={[PP_ID]} testIdPrefix="pp" />
        <Link
          to={`${appPath(PP_ID, appPaths)}/help`}
          data-testid="pp-help"
          title="Open the Pore Pressure Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
        >
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <span className="w-px h-4 bg-pl-border mx-1" />
        <select
          data-testid="pp-depth-ref"
          title={`Depth frame for the readout, the chart, the CSV and the PDF${refs ? Object.entries(refs.reasons).map(([k, r]) => `; ${refLabel(k)} unavailable: ${r}`).join('') : ''}`}
          value={mapper.key}
          onChange={(e) => chooseDepthRef(e.target.value)}
          className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text"
        >
          {VIEW_REFS.map((r) => (
            <option key={r.key} value={r.key} disabled={!!(refs && !refs[r.key])}>{r.label}{refs && !refs[r.key] ? ' (unavailable)' : ''}</option>
          ))}
        </select>
        <span className="text-[11px] text-pl-muted mr-1">Units</span>
        {unitSelect('pressure', PRESSURE_UNITS, 'Pressure display unit, or an equivalent mud weight (the engine stays in Pa)')}
        {unitSelect('depth', DEPTH_UNITS, 'Depth display unit; starts from your Suite units and changes this view for the session. Sonic and the compaction constant follow it')}
        <UnitProfileNote u={unitsHook} names={{ depth: 'depth', pressure: 'pressure' }} className="ml-1 hidden md:inline-flex" />
        <span className="w-px h-4 bg-pl-border mx-1" />
        {result && (
          <button
            type="button"
            data-testid="pp-export-csv"
            title="Download the prognosis against depth in the chosen units, with EMW columns, for the well plan"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border
              border-pl-border text-pl-text hover:bg-pl-sunken"
            onClick={exportCsv}
          >
            <Download className="w-3.5 h-3.5" /> Prognosis CSV
          </button>
        )}
        {result && (
          <button
            type="button"
            data-testid="pp-export-pdf"
            title="Download the prognosis report: well, field, analyst, datum, method, NCT, calibration and the table in the chosen units with EMW"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border
              border-pl-border text-pl-text hover:bg-pl-sunken"
            onClick={exportPdf}
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        )}
        {result && selectedId && backend.publishCurves && (
          <button
            type="button"
            data-testid="pp-publish"
            title={blocker || "Publish PP / FP / OBG curves in MPa on the well's MD to the well registry (overwrites this project's previous publish only)"}
            aria-disabled={blocker ? 'true' : undefined}
            data-blocked={blocker ? 'true' : undefined}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border
              border-pl-border ${blocker ? 'text-pl-muted' : 'text-pl-primary-text hover:bg-pl-sunken'}`}
            onClick={publish}
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Publish
          </button>
        )}
        <button
          type="button"
          data-testid="pp-save-project"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-pl-border text-pl-text hover:bg-pl-sunken"
          onClick={saveProject}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          data-testid="pp-toggle-dock"
          className={`px-2 py-1 text-xs rounded border
            ${dockOpen ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
          onClick={() => setDockOpen((v) => !v)}
        >
          Parameters
        </button>
        <ThemeToggle className="h-7 w-7" />
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="pp-status" className="truncate">{computeError || status}</span>
      <span className="ml-auto whitespace-nowrap">
        {seismicModel
          ? (seismicModel.kind === 'layercake'
            ? `${seismicModel.name} · layer cake${layerCakeAt?.wellName ? ` at ${layerCakeAt.wellName}` : ''}`
            : `${seismicModel.name} · V(z) = ${seismicModel.velocity.v0} + ${seismicModel.velocity.k}·z`)
          : selected
            ? `${selected.name} · ${input && !input.error ? `${input.zBmlM.length} samples` : '…'}`
            : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-pl-muted" title="Every stored, computed and published value is SI; the unit selectors only change the display">SI internal (Pa · m · m/s) · display {units.pressure} · {units.depth}</span>
    </div>
  );

  const empty = (
    <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="pp-empty">
      {!wells ? (
        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry wells…</>
      ) : selectedId && !curves ? (
        loadingId ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading curves…</> : status
      ) : (
        'Select a well to run the pressure prognosis.'
      )}
    </div>
  );

  const center = !result ? empty : view === 'nct' ? (
    <NctPanel
      input={input}
      profile={result}
      params={params}
      picks={picks}
      onPicksChange={setPicks}
      onNctFitted={onNctFitted}
      onResNctFitted={onResNctFitted}
      onSegmentsFitted={onSegmentsFitted}
      onSegmentsChange={onSegmentsChange}
      shaleName={curves?.shaleName || null}
      shaleKind={curves?.shaleKind || null}
      byRes={byRes}
      depthUnit={units.depth}
    />
  ) : (
    <div className="h-full p-2 flex flex-col gap-1">
      {windowInfo?.narrowest && (
        <div className="text-[11px] text-pl-text px-1" data-testid="pp-drilling-window">
          Narrowest drilling window <b>{windowInfo.narrowest.windowPpg.toFixed(2)} ppg</b>
          {' '}(PP {windowInfo.narrowest.ppPpg.toFixed(2)}, FG {windowInfo.narrowest.fgPpg.toFixed(2)} ppg EMW)
          {' '}at {zRef(windowInfo.narrowest.zBmlM)} (below the top {fmtDepth(WINDOW_FROM_BML_M, units.depth)} {units.depth}, the conductor section)
          {windowInfo.maxPp && <> · highest PP {windowInfo.maxPp.ppPpg.toFixed(2)} ppg at {zRef(windowInfo.maxPp.zBmlM)}</>}
          {windowInfo.narrowest.windowPpg < 0.5 && <span className="text-pl-warning-text"> · under 0.5 ppg: plan a casing point or managed pressure</span>}
        </div>
      )}
      {casing && (
        casing.error ? (
          <div className="text-[11px] text-pl-muted px-1" data-testid="pp-casing-seats">{casing.error}</div>
        ) : (
          <div className="text-[11px] text-pl-text px-1" data-testid="pp-casing-seats" data-seats={casing.seats.length}>
            Casing seats, bottom-up (trip margin {casing.tripPpg.toFixed(2)} ppg, kick margin {casing.kickPpg.toFixed(2)} ppg):
            {casing.seats.length === 0 && <span> none needed above TD; one open-hole section from {zRef(casing.fromBmlM)} holds</span>}
            {casing.seats.map((s, k) => (
              <span key={k} data-testid={`pp-casing-seat-${k}`}>
                {k ? ';' : ''} shoe at least {zRef(s.zBmlM)}{s.driver === 'minimum shallow seat' ? ' (your minimum)' : ''}, then {s.mudBelowPpg.toFixed(2)} ppg below
              </span>
            ))}
            {casing.closedAtBmlM != null && (
              <span className="text-pl-warning-text" data-testid="pp-casing-closed"> · window closed by the margins at {zRef(casing.closedAtBmlM)}: no seat opens it; managed pressure or smaller margins</span>
            )}
            <span className="block text-pl-muted" data-testid="pp-casing-sections">
              Window per section: {casing.sections.map((sec) => `${fmtDepth(mapper.fromBml(sec.topBmlM), units.depth)} to ${zRef(sec.baseBmlM)}: mud ${sec.mudPpg.toFixed(2)} ppg, margin to the design FG ${sec.marginPpg.toFixed(2)} ppg`).join(' | ')}
            </span>
          </div>
        )
      )}
      {target && ppPoints > 0 && (
        <div className="px-1">
          <button type="button" data-testid="pp-fit-calibration" onClick={fitCalibration}
            title="Fit the method parameter to the measured pressures (RFT/MDT, kicks) by least squares on the pore pressure"
            className="px-2 py-0.5 text-[11px] rounded border border-pl-primary text-pl-primary-text hover:bg-pl-primary/10">
            {target.label} ({ppPoints} point{ppPoints === 1 ? '' : 's'})
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="text-[11px] px-1 flex flex-wrap gap-x-3 gap-y-0.5" data-testid="pp-notes">
          {notes.map((n) => (
            <li key={n.key} data-testid={`pp-note-${n.key}`} data-tone={n.tone} className={n.tone === 'warn' ? 'text-pl-warning-text' : 'text-pl-muted'}>{n.text}</li>
          ))}
        </ul>
      )}
      <div className="flex-1 min-h-0">
        <PrognosisChart profile={result} zBmlM={input.zBmlM} calibration={calibration} units={units} params={params} casing={casing && !casing.error ? casing : null} mapper={mapper} />
      </div>
    </div>
  );

  return (
    <WorkspaceShell
      autoSaveId="porepressurestudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <WellExplorer
          wells={wells || []}
          velocityModels={velocityModels}
          selectedId={selectedId}
          selectedModelId={seismicModel?.id || null}
          loadingId={loadingId}
          curveStatus={curves ? `DT ${curves.units.DT || EMPTY_VALUE} · RHOB ${curves.units.RHOB || 'absent'}` : null}
          onSelect={select}
          onSelectModel={selectVelocityModel}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border">
          <ParamsPanel
            params={params}
            calibration={calibration}
            onApply={applyDock}
            units={units}
            importCtx={importCtx}
            onImportCalibration={importCalibration}
            onClearImported={() => { setCalibration((c) => c.filter((p) => !p.source)); setStatus('Imported calibration cleared.'); }}
          />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
