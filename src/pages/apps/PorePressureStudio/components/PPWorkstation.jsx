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
import { Gauge, Loader2, Save, Upload, Download, HelpCircle, Database } from 'lucide-react';
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
import { mapLogs, buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { pseudoSonicFromLinearVelocity } from '../engine/velocitySource';
import { layerCakeProfile } from '@/lib/velocityModels';
import { preparePublishLogs } from '../services/publish';
import { drillingWindow, WINDOW_FROM_BML_M } from '../services/drillingWindow';
import {
  UNITS_KEY, PRESSURE_UNITS, DEPTH_UNITS, readUnits, depthFromDisplay, tidyDepth,
  fmtPressure, fmtDepth, emwReferenceDepthM, emwDatumLabel, isEmw, prognosisCsv,
} from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const storage = () => { try { return window.localStorage; } catch { return null; } };

export const DEFAULT_PARAMS = {
  waterDepthM: 100,
  rhoSeawaterKgM3: 1025,
  rhoFluidKgM3: 1030,
  mudlineMdM: 0,
  nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 },
  method: 'eaton',
  eatonN: 3,
  bowers: { A: 10, B: 0.75 },
  nu: 0.4,
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
  // Suite unit profile: depth and pressure start from the profile; the
  // selectors below change this view for the session only, and the older
  // remembered 'pp.units' choice no longer beats the profile
  const unitsHook = useAppUnits('pore-pressure', {
    depth: { family: 'depth', allowed: DEPTH_UNITS },
    pressure: { family: 'pressure', allowed: PRESSURE_UNITS.map((p) => p.key) },
  }, { fallback: readUnits(storage()), legacyKeys: [UNITS_KEY] });
  const { units, setUnit } = unitsHook;
  const [readoutText, setReadoutText] = useState(() => tidyDepth(3500, units.depth));

  // the readout text follows the depth unit; typing edits the SI depth
  useEffect(() => { setReadoutText(tidyDepth(readoutDepthM, units.depth)); }, [units.depth]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (project.calibration) setCalibration(project.calibration);
        setStatus('Restored saved project.');
      } catch (e) {
        if (live) { setStatus(e.message); setWells((w) => w || []); }
      }
    })();
    return () => { live = false; };
  }, [backend]);

  const selected = (wells || []).find((w) => w.id === selectedId) || null;

  const select = useCallback(async (wellId) => {
    setSelectedId(wellId);
    setSeismicModel(null);
    setLoadingId(wellId);
    setCurves(null);
    setPicks([]);
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
      setCurves({
        depth: Array.from(depth),
        dt: Array.from(dt),
        rho: rho ? Array.from(rho) : null,
        units: { DT: mapped.DT.unit, RHOB: mapped.RHOB?.unit },
        logIds: Object.values(mapped).filter(Boolean).map((l) => l.id),
      });
      setStatus(`Loaded ${depth.length} samples${rho ? '' : '. No density log, so the overburden uses Gardner'}.`);
    } catch (e) {
      setStatus(e.message);
      setCurves(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  // Seismolord U2-006: a layer cake is read at a well (the well selected
  // when the model is chosen); its boundary times come from the published
  // boundary surfaces
  const [layerCakeAt, setLayerCakeAt] = useState(null);   // {wellName, boundaryTwtMs, note}|{error}
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
      backend.layerCakeBoundariesAt(model, at)
        .then((r) => {
          setLayerCakeAt({ ...r, wellName: at.name });
          setStatus(`Velocity trend from the ${model.name} layer cake at ${at.name}: a trend-grade prognosis (no local anomaly).${r.note ? ` ${r.note}` : ''}`);
        })
        .catch((e) => { setLayerCakeAt({ error: e.message }); setStatus(e.message); });
      return;
    }
    setStatus(`Velocity trend from ${model.name}: a trend-grade prognosis (no local anomaly).`);
  }, [wells, selectedId, backend]);

  const input = useMemo(() => {
    try {
      if (seismicModel?.kind === 'layercake') {
        if (!layerCakeAt) return null;
        if (layerCakeAt.error) return { error: layerCakeAt.error };
        return layerCakeProfile(seismicModel.velocity, layerCakeAt.boundaryTwtMs, {
          datumToMudlineM: params.waterDepthM,
          zMaxM: 4000,
          stepM: 10,
        });
      }
      if (seismicModel) {
        // model datum = sea level; the water column is the offset
        return pseudoSonicFromLinearVelocity(seismicModel.velocity, {
          datumToMudlineM: params.waterDepthM,
          zMaxM: 4000,
          stepM: 10,
        });
      }
      if (!curves) return null;
      return buildProfileInput(curves, curves.units, { mudlineMdM: params.mudlineMdM });
    } catch (e) {
      return { error: e.message };
    }
  }, [curves, seismicModel, layerCakeAt, params.mudlineMdM, params.waterDepthM]);

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
  const computeError = input?.error || profile?.error || null;

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

  const exportCsv = () => {
    if (!result || !input) return;
    const source = seismicModel ? seismicModel.name : (selected?.name || 'well');
    const csv = prognosisCsv(input, result, params, units, { source });
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

  const applyDock = ({ params: p, calibration: cal }) => {
    setParams(p);
    setCalibration(cal);
    setStatus('Parameters applied.');
  };

  const onNctFitted = (fit) => {
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
        source: seismicModel
          ? { kind: 'seismic', volumeId: seismicModel.id }
          : { kind: 'well', wellId: selectedId },
      });
      if (saved?.id) setProjectId(saved.id);
      setStatus('Project saved.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!result || !input || !selectedId) return;
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
              if (Number.isFinite(d)) setReadoutDepthM(depthFromDisplay(d, units.depth));
            }}
          />
          <span>{units.depth} bml:</span>
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
        {result && selectedId && backend.publishCurves && (
          <button
            type="button"
            data-testid="pp-publish"
            title="Publish PP / FP / OBG curves to the well registry (overwrites this project's previous publish only)"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border
              border-pl-border text-pl-primary-text hover:bg-pl-sunken"
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
      depthUnit={units.depth}
    />
  ) : (
    <div className="h-full p-2 flex flex-col gap-1">
      {windowInfo?.narrowest && (
        <div className="text-[11px] text-pl-text px-1" data-testid="pp-drilling-window">
          Narrowest drilling window <b>{windowInfo.narrowest.windowPpg.toFixed(2)} ppg</b>
          {' '}(PP {windowInfo.narrowest.ppPpg.toFixed(2)}, FG {windowInfo.narrowest.fgPpg.toFixed(2)} ppg EMW)
          {' '}at {fmtDepth(windowInfo.narrowest.zBmlM, units.depth)} {units.depth} below mudline (below the top {fmtDepth(WINDOW_FROM_BML_M, units.depth)} {units.depth}, the conductor section)
          {windowInfo.maxPp && <> · highest PP {windowInfo.maxPp.ppPpg.toFixed(2)} ppg at {fmtDepth(windowInfo.maxPp.zBmlM, units.depth)} {units.depth}</>}
          {windowInfo.narrowest.windowPpg < 0.5 && <span className="text-pl-warning-text"> · under 0.5 ppg: plan a casing point or managed pressure</span>}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <PrognosisChart profile={result} zBmlM={input.zBmlM} calibration={calibration} units={units} params={params} />
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
          <ParamsPanel params={params} calibration={calibration} onApply={applyDock} units={units} />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
