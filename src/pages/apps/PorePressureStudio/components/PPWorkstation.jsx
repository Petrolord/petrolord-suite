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
// deliverable for the well plan.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2, Save, Upload, Download } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import ParamsPanel from './ParamsPanel';
import PrognosisChart from './PrognosisChart';
import NctPanel from './NctPanel';
import { mapLogs, buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { pseudoSonicFromLinearVelocity } from '../engine/velocitySource';
import { preparePublishLogs } from '../services/publish';
import {
  UNITS_KEY, PRESSURE_UNITS, DEPTH_UNITS, readUnits, depthFromDisplay, tidyDepth,
  fmtPressure, emwReferenceDepthM, emwDatumLabel, isEmw, prognosisCsv,
} from '../services/units';

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

export default function PPWorkstation({ backend }) {
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
  const [units, setUnits] = useState(() => readUnits(storage()));
  const [readoutText, setReadoutText] = useState(() => tidyDepth(3500, readUnits(storage()).depth));

  // the depth unit defaults to the account's Geoscience setting (the
  // Mapping and Earth Modeling one) until the user picks one here
  useEffect(() => {
    let live = true;
    let chosen = false;
    try { chosen = !!JSON.parse(storage()?.getItem(UNITS_KEY) || 'null')?.depth; } catch { /* fresh browser */ }
    if (chosen || !backend.getDepthUnit) return undefined;
    backend.getDepthUnit().then((u) => {
      if (live && DEPTH_UNITS.includes(u)) setUnits((prev) => ({ ...prev, depth: u }));
    }).catch(() => {});
    return () => { live = false; };
  }, [backend]);

  // the readout text follows the depth unit; typing edits the SI depth
  useEffect(() => { setReadoutText(tidyDepth(readoutDepthM, units.depth)); }, [units.depth]); // eslint-disable-line react-hooks/exhaustive-deps

  const setUnit = (key, value) => {
    setUnits((prev) => {
      const next = { ...prev, [key]: value };
      try { storage()?.setItem(UNITS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

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
        throw new Error('This well has no depth + sonic pair — pore pressure needs a sonic log.');
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
      setStatus(`Loaded ${depth.length} samples${rho ? '' : ' — no density log, Gardner overburden'}.`);
    } catch (e) {
      setStatus(e.message);
      setCurves(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  const selectVelocityModel = useCallback((model) => {
    setSeismicModel(model);
    setSelectedId(null);
    setCurves(null);
    setPicks([]);
    setStatus(`Velocity trend from ${model.name} — trend-grade prognosis (no local anomaly).`);
  }, []);

  const input = useMemo(() => {
    try {
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
  }, [curves, seismicModel, params.mudlineMdM, params.waterDepthM]);

  const profile = useMemo(() => {
    if (!input || input.error) return null;
    try {
      return { result: computeProfile({ ...input, params }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [input, params]);

  const result = profile?.result || null;
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
      className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-200"
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
        ${view === key ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
      onClick={() => setView(key)}
    >
      {label}
    </button>
  );

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <ModuleHomeLink module="geoscience" />
      <Gauge className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Pore Pressure Studio</span>
      <span className="text-[11px] text-slate-500">Eaton / Bowers prognosis on the shared well registry</span>
      <div className="ml-4 flex items-center gap-1">
        {viewButton('prognosis', 'Prognosis')}
        {viewButton('nct', 'NCT')}
      </div>
      {result && (
        <div className="ml-4 flex items-center gap-2 text-[11px] text-slate-400">
          <label htmlFor="pp-readout-depth">at</label>
          <input
            id="pp-readout-depth"
            data-testid="pp-readout-depth"
            className="w-20 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-right"
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
              <span data-testid="pp-readout-pp" className="text-rose-300">PP {readout.pp}</span>
              <span data-testid="pp-readout-fg">FG {readout.fg}</span>
              <span
                data-testid="pp-readout-unit"
                className="text-slate-600"
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
          title="Analytic v0+k velocity model — constrains the regional trend only; it carries no local overpressure anomaly"
          className="rounded px-1.5 py-0.5 bg-amber-500/15 border border-amber-600/50 text-amber-300 text-[11px]"
        >
          Trend-grade (seismic velocity)
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <span className="text-[11px] text-slate-500 mr-1">Units</span>
        {unitSelect('pressure', PRESSURE_UNITS, 'Pressure display unit, or an equivalent mud weight (the engine stays in Pa)')}
        {unitSelect('depth', DEPTH_UNITS, 'Depth display unit; defaults to your Geoscience depth setting. Sonic and the compaction constant follow it')}
        <span className="w-px h-4 bg-slate-800 mx-1" />
        {result && (
          <button
            type="button"
            data-testid="pp-export-csv"
            title="Download the prognosis against depth in the chosen units, with EMW columns, for the well plan"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border
              border-slate-700 text-slate-300 hover:bg-slate-800"
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
              border-emerald-700 text-emerald-300 hover:bg-emerald-500/10"
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
            border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={saveProject}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          data-testid="pp-toggle-dock"
          className={`px-2 py-1 text-xs rounded border
            ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setDockOpen((v) => !v)}
        >
          Parameters
        </button>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="pp-status" className="truncate">{computeError || status}</span>
      <span className="ml-auto whitespace-nowrap">
        {seismicModel
          ? `${seismicModel.name} · V(z) = ${seismicModel.velocity.v0} + ${seismicModel.velocity.k}·z`
          : selected
            ? `${selected.name} · ${input && !input.error ? `${input.zBmlM.length} samples` : '…'}`
            : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-slate-600" title="Every stored, computed and published value is SI; the unit selectors only change the display">SI internal (Pa · m · m/s) · display {units.pressure} · {units.depth}</span>
    </div>
  );

  const empty = (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="pp-empty">
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
    <div className="h-full p-2">
      <PrognosisChart profile={result} zBmlM={input.zBmlM} calibration={calibration} units={units} params={params} />
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
          curveStatus={curves ? `DT ${curves.units.DT || '—'} · RHOB ${curves.units.RHOB || 'absent'}` : null}
          onSelect={select}
          onSelectModel={selectVelocityModel}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <ParamsPanel params={params} calibration={calibration} onApply={applyDock} units={units} />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
