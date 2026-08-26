// Well Control Studio workstation (D3/W2): WorkspaceShell over an injected
// backend. Engine math runs client-side through services/wcRun; runs persist
// to wp_wc_runs (immutable). Geometry: the shared wp_wellbore_geometry spine.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import VolumesTab from './components/VolumesTab';
import KillSheetTab from './components/KillSheetTab';
import KickToleranceTab from './components/KickToleranceTab';
import {
  runVolumes, runKillSheet, runKickTolerance, WC_ENGINE_VERSION, emwOut, emwLabel,
} from './services/wcRun';
import { DRILL_PIPE, DRILL_COLLARS, HWDP, gradeYieldPa } from '../TorqueDragStudio/engine/tubulars';

const TABS = [
  { id: 'volumes', label: 'Well & Volumes' },
  { id: 'killsheet', label: 'Kill Sheet' },
  { id: 'kicktol', label: 'Kick Tolerance' },
];

function defaultCase(wellboreId, designId, tdM) {
  const dp = DRILL_PIPE[3];
  const dc = DRILL_COLLARS[2];
  const hw = HWDP[3];
  return {
    wellbore_id: wellboreId,
    design_id: designId ?? null,
    name: 'Case 1',
    string: [
      { type: 'dc', label: dc.designation, lengthM: 150, odM: dc.odM, idM: dc.idM, weightKgM: dc.weightKgM },
      { type: 'hwdp', label: hw.designation, lengthM: 150, odM: hw.odM, idM: hw.idM, weightKgM: hw.weightKgM, tooljointOdM: hw.tooljointOdM },
      {
        type: 'dp', label: dp.designation, lengthM: Math.max(300, (tdM || 3000) - 300),
        odM: dp.odM, idM: dp.idM, weightKgM: dp.weightKgM, tooljointOdM: dp.tooljointOdM,
        grade: 'S-135', yieldPa: gradeYieldPa('S-135'),
      },
    ],
    mud: { densityKgM3: 1440 },
    pump: { outputM3PerStroke: 0.012, scr: [{ spm: 30, pressurePa: 4.5e6 }], scrIndex: 0 },
    shoe: { mdM: Math.max(300, Math.round((tdM || 3000) * 0.45)), fracEmwKgM3: 1750 },
    kick: { sidppPa: 2e6, sicpPa: 2.6e6, pitGainM3: 3, influxDensityKgM3: 240, kickIntensityKgM3: 60 },
  };
}

// Published frac EMW near the shoe TVD (kg/m3) from a mud-window row set.
function shoeFracHint(mudWindow, tvdShoeM) {
  if (!mudWindow?.length || !(tvdShoeM > 0)) return null;
  const rows = mudWindow.filter((r) => r.fpEmw != null);
  if (!rows.length) return null;
  const nearest = rows.reduce((best, r) => (Math.abs(r.tvd - tvdShoeM) < Math.abs(best.tvd - tvdShoeM) ? r : best), rows[0]);
  return nearest.fpEmw * 1000;
}

export default function WCWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [geometryRow, setGeometryRow] = useState(null);
  const [mudWindow, setMudWindow] = useState(null);
  const [tdCases, setTdCases] = useState([]);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('volumes');
  const [volumes, setVolumes] = useState(null);
  const [ks, setKs] = useState(null);
  const [kt, setKt] = useState(null);
  const [method, setMethod] = useState('waitAndWeight');
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runError, setRunError] = useState(null);

  const fail = useCallback((e) => {
    toast({ title: 'Well Control Studio', description: e.message, variant: 'destructive' });
  }, [toast]);

  useEffect(() => {
    backend.listSites().then((rows) => {
      setSites(rows);
      if (rows.length === 1) setSiteId(rows[0].id);
    }).catch(fail);
  }, [backend, fail]);

  useEffect(() => {
    if (!siteId) return;
    backend.listWellbores(siteId).then((rows) => {
      setWellbores(rows);
      if (rows.length === 1) setWellboreId(rows[0].id);
    }).catch(fail);
  }, [backend, siteId, fail]);

  useEffect(() => {
    if (!wellboreId) return;
    setVolumes(null); setKs(null); setKt(null); setCaseId(null); setCaseDraft(null);
    Promise.all([
      backend.getDefinitiveTrajectory(wellboreId),
      backend.getGeometry(wellboreId),
      backend.listCases(wellboreId),
      backend.listTdCases ? backend.listTdCases(wellboreId).catch(() => []) : [],
    ]).then(async ([traj, geom, caseRows, tdRows]) => {
      setTrajectory(traj);
      setGeometryRow(geom || { wellbore_id: wellboreId, hole_sections: [] });
      setCases(caseRows);
      setTdCases(tdRows || []);
      if (caseRows.length) setCaseId(caseRows[0].id);
      if (backend.loadMudWindow) {
        setMudWindow(await backend.loadMudWindow(traj.wellbore, traj.stations).catch(() => null));
      }
    }).catch(fail);
  }, [backend, wellboreId, fail]);

  useEffect(() => {
    const row = (cases || []).find((c) => c.id === caseId);
    setCaseDraft(row ? JSON.parse(JSON.stringify(row)) : null);
    setDirty(false);
    setVolumes(null); setKs(null); setKt(null); setRunError(null);
    if (caseId) backend.listRuns(caseId).then(setRuns).catch(fail);
    else setRuns(null);
  }, [backend, caseId, cases, fail]);

  const wellbore = trajectory?.wellbore || (wellbores || []).find((w) => w.id === wellboreId) || null;
  const depthUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
  const tdM = trajectory?.stations?.length ? trajectory.stations[trajectory.stations.length - 1].md : 0;

  const onCaseChange = (patch) => {
    setCaseDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const saveDraft = async () => {
    try {
      if (caseDraft?.id) {
        const saved = await backend.updateCase(caseDraft.id, {
          name: caseDraft.name,
          string: caseDraft.string,
          mud: caseDraft.mud,
          pump: caseDraft.pump,
          shoe: caseDraft.shoe,
          kick: caseDraft.kick,
          design_id: trajectory?.design?.id ?? null,
        });
        setCases((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      }
      setDirty(false);
      toast({ title: 'Saved', description: 'Case saved.' });
    } catch (e) { fail(e); }
  };

  const onNewCase = async () => {
    try {
      const created = await backend.saveCase(defaultCase(wellboreId, trajectory?.design?.id, tdM));
      setCases((rows) => [...(rows || []), created]);
      setCaseId(created.id);
    } catch (e) { fail(e); }
  };

  const onDeleteCase = async (id) => {
    try {
      await backend.deleteCase(id);
      setCases((rows) => rows.filter((r) => r.id !== id));
      if (caseId === id) setCaseId(null);
    } catch (e) { fail(e); }
  };

  const onImportString = (tdCaseId) => {
    const td = tdCases.find((c) => c.id === tdCaseId);
    if (td?.string?.length) {
      onCaseChange({ string: td.string });
      toast({ title: 'String imported', description: `Copied from T&D case '${td.name}'.` });
    }
  };

  const guarded = (fn) => () => {
    setRunning(true);
    setRunError(null);
    setTimeout(() => {
      try { fn(); } catch (e) { setRunError(e.message); } finally { setRunning(false); }
    }, 30);
  };

  const args = () => ({ stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow });

  const onComputeVolumes = guarded(() => setVolumes(runVolumes(args())));
  const onRunKillSheet = guarded(() => {
    const v = runVolumes(args());
    setVolumes(v);
    setKs(runKillSheet(args()).result);
    setKt(runKickTolerance(args()));
  });
  const onRunKt = guarded(() => {
    setVolumes(runVolumes(args()));
    setKt(runKickTolerance(args()));
  });

  const onSaveRun = async () => {
    if (!ks || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: { kick: caseDraft.kick, pump: caseDraft.pump, shoe: caseDraft.shoe, method },
        results: { schedule: ks.schedule, kickTolerance: kt?.result ?? null },
        summary: {
          killMudDensityKgM3: ks.killMudDensityKgM3,
          icpPa: ks.icpPa,
          fcpPa: ks.fcpPa,
          formationPressurePa: ks.formationPressurePa,
          maaspPa: kt?.result?.maaspPa ?? null,
          kickToleranceM3: kt?.result?.kickToleranceM3 ?? null,
        },
        engine_version: WC_ENGINE_VERSION,
      });
      setRuns((rows) => [saved, ...(rows || [])]);
      toast({ title: 'Run saved', description: 'Added to the immutable run history.' });
    } catch (e) { fail(e); } finally { setSavingRun(false); }
  };

  const onDeleteRun = async (id) => {
    try {
      await backend.deleteRun(id);
      setRuns((rows) => rows.filter((r) => r.id !== id));
    } catch (e) { fail(e); }
  };

  const ribbon = (
    <div className="flex h-11 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3">
      <Link to="/dashboard/drilling" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        <Home className="h-3.5 w-3.5" /> Drilling
      </Link>
      <span className="text-sm font-semibold text-slate-100">Well Control Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`wc-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="wc-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/well-control-studio/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{WC_ENGINE_VERSION}</span>
      <span data-testid="wc-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{caseDraft ? `${caseDraft.name} — mud ${emwOut(caseDraft.mud?.densityKgM3 || 0, depthUnit).toFixed(2)} ${emwLabel(depthUnit)}` : 'no case'}</span>
      <span className="ml-auto">Planning tool (surface BOP, single-bubble); validated vs oracle goldens</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="wc-empty">
      {wellboreId ? 'Create a well control case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 bg-slate-950">
      {tab === 'volumes' && (
        <VolumesTab
          caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          volumes={volumes} onCompute={onComputeVolumes} running={running} error={runError}
          tdCases={tdCases} onImportString={onImportString}
          shoeFracHint={shoeFracHint(mudWindow, volumes?.tvdShoeM)}
        />
      )}
      {tab === 'killsheet' && (
        <KillSheetTab
          caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          ks={ks} kt={kt} volumes={volumes} method={method} onMethodChange={setMethod}
          onRun={onRunKillSheet} running={running} error={runError}
          onSaveRun={onSaveRun} savingRun={savingRun} runs={runs} onDeleteRun={onDeleteRun}
          wellboreName={wellbore?.name}
        />
      )}
      {tab === 'kicktol' && (
        <KickToleranceTab
          caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          kt={kt} onRun={onRunKt} running={running} error={runError}
        />
      )}
    </div>
  );

  return (
    <WorkspaceShell
      ribbon={ribbon}
      explorer={(
        <Explorer
          sites={sites} selectedSiteId={siteId} onSelectSite={setSiteId}
          wellbores={wellbores} selectedWellboreId={wellboreId} onSelectWellbore={setWellboreId}
          cases={cases} selectedCaseId={caseId} onSelectCase={setCaseId}
          onNewCase={onNewCase} onDeleteCase={onDeleteCase}
          trajectory={trajectory}
          caseLabel="Well control cases" testPrefix="wc"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="well-control-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
