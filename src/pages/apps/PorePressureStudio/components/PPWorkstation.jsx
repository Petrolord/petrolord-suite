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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2, Save } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import ParamsPanel from './ParamsPanel';
import PrognosisChart from './PrognosisChart';
import NctPanel from './NctPanel';
import { mapLogs, buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';

const MPA = 1e6;

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
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [curves, setCurves] = useState(null); // {depth, dt, rho, units}
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [picks, setPicks] = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [view, setView] = useState('prognosis'); // 'prognosis' | 'nct'
  const [readoutDepth, setReadoutDepth] = useState('3500');
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await backend.listWells();
        if (!live) return;
        setWells(list);
        const project = await backend.loadProject();
        if (!live || !project) return;
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
      });
      setStatus(`Loaded ${depth.length} samples${rho ? '' : ' — no density log, Gardner overburden'}.`);
    } catch (e) {
      setStatus(e.message);
      setCurves(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  const input = useMemo(() => {
    if (!curves) return null;
    try {
      return buildProfileInput(curves, curves.units, { mudlineMdM: params.mudlineMdM });
    } catch (e) {
      return { error: e.message };
    }
  }, [curves, params.mudlineMdM]);

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
    const z = Number(readoutDepth);
    if (!Number.isFinite(z)) return null;
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) {
      if (Math.abs(input.zBmlM[i] - z) < Math.abs(input.zBmlM[best] - z)) best = i;
    }
    return {
      z: input.zBmlM[best],
      obg: result.overburdenPa[best] / MPA,
      ph: result.hydrostaticPa[best] / MPA,
      pp: result.porePressurePa[best] / MPA,
      fg: result.fracPressurePa[best] / MPA,
    };
  }, [result, input, readoutDepth]);

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
      await backend.saveProject({
        params, picks, calibration, source: { kind: 'well', wellId: selectedId },
      });
      setStatus('Project saved.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
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
            className="w-16 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-right"
            value={readoutDepth}
            onChange={(e) => setReadoutDepth(e.target.value)}
          />
          <span>m bml:</span>
          {readout && (
            <>
              <span data-testid="pp-readout-obg">OBG {readout.obg.toFixed(2)}</span>
              <span data-testid="pp-readout-ph">Ph {readout.ph.toFixed(2)}</span>
              <span data-testid="pp-readout-pp" className="text-rose-300">PP {readout.pp.toFixed(2)}</span>
              <span data-testid="pp-readout-fg">FG {readout.fg.toFixed(2)}</span>
              <span className="text-slate-600">MPa</span>
            </>
          )}
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
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
        {selected ? `${selected.name} · ${input && !input.error ? `${input.zBmlM.length} samples` : '…'}` : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-slate-600">SI internal (Pa · m · m/s) · display MPa</span>
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
    />
  ) : (
    <div className="h-full p-2">
      <PrognosisChart profile={result} zBmlM={input.zBmlM} calibration={calibration} />
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
          selectedId={selectedId}
          loadingId={loadingId}
          curveStatus={curves ? `DT ${curves.units.DT || '—'} · RHOB ${curves.units.RHOB || 'absent'}` : null}
          onSelect={select}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <ParamsPanel params={params} calibration={calibration} onApply={applyDock} />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
