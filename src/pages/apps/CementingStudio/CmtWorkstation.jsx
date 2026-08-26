// Cementing Studio workstation (D4/C2): WorkspaceShell over an injected
// backend. Engine math runs client-side through services/cmtRun; runs
// persist to wp_cmt_runs (immutable). Geometry: the shared
// wp_wellbore_geometry spine.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save } from 'lucide-react';
import Explorer from '../TorqueDragStudio/components/Explorer';
import JobDesignTab from './components/JobDesignTab';
import PlacementTab from './components/PlacementTab';
import CentralizationTab from './components/CentralizationTab';
import {
  runVolumes, runPlacement, runStandoff, runChecklist, CMT_ENGINE_VERSION,
  emwOut, emwLabel,
} from './services/cmtRun';
import { exportPlacementCsv, exportJobReportPdf } from './services/cmtExport';
import { CASING_QUICK } from '../TorqueDragStudio/engine/tubulars';

const TABS = [
  { id: 'job', label: 'Job Design' },
  { id: 'placement', label: 'Placement' },
  { id: 'centralization', label: 'Centralization' },
];

function defaultCase(wellboreId, designId, tdM, geometryRow) {
  const c7 = CASING_QUICK.find((x) => x.designation.startsWith('7"')) || CASING_QUICK[3];
  const shoe = Math.max(500, tdM || 3000);
  const sections = geometryRow?.hole_sections || [];
  const prevShoe = sections.filter((s) => s.cased).reduce((m, s) => Math.max(m, s.to_md_m), 0);
  return {
    wellbore_id: wellboreId,
    design_id: designId ?? null,
    name: 'Job 1',
    casing: {
      label: c7.designation, odM: c7.odM, idM: c7.idM, weightKgM: c7.weightKgM,
      shoeMd: shoe, floatCollarMd: Math.max(0, shoe - 40), hangerMd: 0,
    },
    fluids: {
      mudInHole: { densityKgM3: 1440, fann: { theta600: 64, theta300: 38, theta6: 7, theta3: 6 } },
      program: [
        { kind: 'spacer', densityKgM3: 1500, volumeM3: 4, fann: { theta600: 40, theta300: 24 } },
        { kind: 'lead', densityKgM3: 1560, volumeM3: null, fann: { theta600: 80, theta300: 50 } },
        { kind: 'tail', densityKgM3: 1900, volumeM3: null, fann: { theta600: 110, theta300: 70 } },
        { kind: 'displacement', densityKgM3: 1440, volumeM3: null, fann: { theta600: 64, theta300: 38 } },
      ],
    },
    job: {
      tocMd: prevShoe > 0 ? Math.max(0, prevShoe - 200) : Math.max(0, shoe - 1000),
      excessOpenHolePct: 15,
      leadTailSplitMd: prevShoe > 0 ? prevShoe : null,
      pumpRateM3s: 0.02,
      slurryYieldM3PerSack: 0.0382,
      fracEmwKgM3: 1750,
    },
    centralizers: { type: 'bow', spacingM: 12, restoringForceN: 8900, standoffAtRestoringForce: 0.67 },
  };
}

export default function CmtWorkstation({ backend }) {
  const { toast } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [wellbores, setWellbores] = useState(null);
  const [wellboreId, setWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [geometryRow, setGeometryRow] = useState(null);
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [caseDraft, setCaseDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('job');
  const [vols, setVols] = useState(null);
  const [placementResult, setPlacementResult] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [standoffResult, setStandoffResult] = useState(null);
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runError, setRunError] = useState(null);

  const fail = useCallback((e) => {
    toast({ title: 'Cementing Studio', description: e.message, variant: 'destructive' });
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
    setVols(null); setPlacementResult(null); setChecklist(null); setStandoffResult(null);
    setCaseId(null); setCaseDraft(null);
    Promise.all([
      backend.getDefinitiveTrajectory(wellboreId),
      backend.getGeometry(wellboreId),
      backend.listCases(wellboreId),
    ]).then(([traj, geom, caseRows]) => {
      setTrajectory(traj);
      setGeometryRow(geom || { wellbore_id: wellboreId, hole_sections: [] });
      setCases(caseRows);
      if (caseRows.length) setCaseId(caseRows[0].id);
    }).catch(fail);
  }, [backend, wellboreId, fail]);

  useEffect(() => {
    const row = (cases || []).find((c) => c.id === caseId);
    setCaseDraft(row ? JSON.parse(JSON.stringify(row)) : null);
    setDirty(false);
    setVols(null); setPlacementResult(null); setChecklist(null); setStandoffResult(null); setRunError(null);
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
          casing: caseDraft.casing,
          fluids: caseDraft.fluids,
          job: caseDraft.job,
          centralizers: caseDraft.centralizers,
          design_id: trajectory?.design?.id ?? null,
        });
        setCases((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      }
      setDirty(false);
      toast({ title: 'Saved', description: 'Job saved.' });
    } catch (e) { fail(e); }
  };

  const onNewCase = async () => {
    try {
      const created = await backend.saveCase(defaultCase(wellboreId, trajectory?.design?.id, tdM, geometryRow));
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

  const guarded = (fn) => () => {
    setRunning(true);
    setRunError(null);
    setTimeout(() => {
      try { fn(); } catch (e) { setRunError(e.message); } finally { setRunning(false); }
    }, 30);
  };

  const args = () => ({ stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow });

  const onComputeVolumes = guarded(() => setVols(runVolumes(args())));
  const onRunPlacement = guarded(() => {
    const res = runPlacement(args());
    setVols(res.vols);
    setPlacementResult(res);
    setChecklist(runChecklist(args()));
    setStandoffResult(runStandoff(args()));
  });
  const onRunStandoff = guarded(() => setStandoffResult(runStandoff(args())));

  const onSaveRun = async () => {
    if (!placementResult || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const p = placementResult.placement;
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: { casing: caseDraft.casing, job: caseDraft.job },
        results: { annulusEnd: p.annulusEnd, checklist },
        summary: {
          endPumpPressurePa: p.endPumpPressurePa,
          maxEcdPrevShoeKgM3: p.maxEcdPrevShoeKgM3,
          achievedTocMd: p.achievedTocMd,
          floatDiffPa: p.floatDiffPa,
          freeFall: p.freeFall,
          slurryM3: placementResult.vols.slurryM3,
        },
        engine_version: CMT_ENGINE_VERSION,
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
      <span className="text-sm font-semibold text-slate-100">Cementing Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`cmt-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="cmt-save-case">
            <Save className="mr-1 h-3 w-3" /> Save job
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/cementing-studio/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{CMT_ENGINE_VERSION}</span>
      <span data-testid="cmt-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{caseDraft ? `${caseDraft.name} — mud ${emwOut(caseDraft.fluids?.mudInHole?.densityKgM3 || 0, depthUnit).toFixed(2)} ${emwLabel(depthUnit)}` : 'no job'}</span>
      <span className="ml-auto">Plug-flow planning model; validated vs oracle goldens</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="cmt-empty">
      {wellboreId ? 'Create a cement job from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 bg-slate-950">
      {tab === 'job' && (
        <JobDesignTab caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          vols={vols} onCompute={onComputeVolumes} running={running} error={runError} />
      )}
      {tab === 'placement' && (
        <PlacementTab
          placementResult={placementResult} checklist={checklist} depthUnit={depthUnit}
          fracEmwKgM3={caseDraft.job?.fracEmwKgM3 ?? null}
          onRun={onRunPlacement} running={running} error={runError}
          onSaveRun={onSaveRun} savingRun={savingRun} runs={runs} onDeleteRun={onDeleteRun}
          onExportCsv={() => exportPlacementCsv(placementResult.placement, depthUnit)}
          onExportPdf={() => exportJobReportPdf({
            vols: placementResult.vols, placement: placementResult.placement,
            checklist, standoff: standoffResult, caseRow: caseDraft,
            wellboreName: wellbore?.name, depthUnit,
          })}
        />
      )}
      {tab === 'centralization' && (
        <CentralizationTab caseDraft={caseDraft} onCaseChange={onCaseChange} depthUnit={depthUnit}
          standoffResult={standoffResult} onRun={onRunStandoff} running={running} error={runError} />
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
          caseLabel="Cement jobs" testPrefix="cmt"
        />
      )}
      center={center}
      statusBar={statusBar}
      autoSaveId="cementing-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
