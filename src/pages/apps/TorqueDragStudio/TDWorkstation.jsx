// Torque & Drag Studio workstation (D1/TD2): WorkspaceShell over an injected
// backend (wpBackend in the app, inMemoryBackend in the /dev harness — the
// PorePressureStudio pattern). All engine math runs client-side through
// services/tdRun; runs persist to wp_td_runs (immutable).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Home, HelpCircle, Save } from 'lucide-react';
import Explorer from './components/Explorer';
import StringGeometryTab from './components/StringGeometryTab';
import AnalysisTab from './components/AnalysisTab';
import WearTab from './components/WearTab';
import SensitivityTab from './components/SensitivityTab';
import { runCase, runWear, totalStringLengthM, TD_ENGINE_VERSION } from './services/tdRun';
import { DRILL_PIPE, DRILL_COLLARS, HWDP, gradeYieldPa } from './engine/tubulars';

const TABS = [
  { id: 'string', label: 'String & Geometry' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'wear', label: 'Casing Wear' },
  { id: 'sensitivity', label: 'Sensitivity' },
];

function defaultCase(wellboreId, designId, tdM) {
  const dp = DRILL_PIPE[3]; // 5" 19.50 NC50
  const dc = DRILL_COLLARS[2];
  const hw = HWDP[3];
  const bha = 150 + 150;
  return {
    wellbore_id: wellboreId,
    design_id: designId ?? null,
    name: 'Case 1',
    string: [
      { type: 'dc', label: dc.designation, lengthM: 150, odM: dc.odM, idM: dc.idM, weightKgM: dc.weightKgM },
      { type: 'hwdp', label: hw.designation, lengthM: 150, odM: hw.odM, idM: hw.idM, weightKgM: hw.weightKgM, tooljointOdM: hw.tooljointOdM },
      {
        type: 'dp', label: dp.designation, lengthM: Math.max(300, (tdM || 3000) - bha),
        odM: dp.odM, idM: dp.idM, weightKgM: dp.weightKgM, tooljointOdM: dp.tooljointOdM,
        grade: 'S-135', yieldPa: gradeYieldPa('S-135'),
      },
    ],
    mud: { densityKgM3: 1440 },
    friction: { cased: 0.25, open: 0.35, overrides: [] },
    operations: {
      wobN: 0, bitTorqueNm: 0, tripSpeedMs: 0.3, rpm: 120,
      ops: ['trip_out', 'trip_in', 'rotate_on_bottom'],
      wear: { schedule: [{ rpm: 120, hours: 0 }], wearFactorMm3PerKNm: 1, intervalM: 30 },
    },
  };
}

export default function TDWorkstation({ backend }) {
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
  const [tab, setTab] = useState('string');
  const [run, setRun] = useState(null);
  const [wear, setWear] = useState(null);
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [runError, setRunError] = useState(null);

  const fail = useCallback((e) => {
    toast({ title: 'Torque & Drag Studio', description: e.message, variant: 'destructive' });
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
    setRun(null); setWear(null); setCaseId(null); setCaseDraft(null);
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
    setRun(null); setWear(null); setRunError(null);
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
  const onSectionsChange = (holeSections) => {
    setGeometryRow((g) => ({ ...g, hole_sections: holeSections }));
    setDirty(true);
  };

  const saveDraft = async () => {
    try {
      if (caseDraft?.id) {
        const saved = await backend.updateCase(caseDraft.id, {
          name: caseDraft.name,
          string: caseDraft.string,
          mud: caseDraft.mud,
          friction: caseDraft.friction,
          operations: caseDraft.operations,
          design_id: trajectory?.design?.id ?? null,
        });
        setCases((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      }
      await backend.saveGeometry(wellboreId, geometryRow?.hole_sections || []);
      setDirty(false);
      toast({ title: 'Saved', description: 'Case and geometry saved.' });
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

  const onRun = () => {
    setRunning(true);
    setRunError(null);
    // Yield a frame so the button state paints before the sync compute.
    setTimeout(() => {
      try {
        const out = runCase({ stations: trajectory?.stations || [], caseRow: caseDraft, geometryRow, stepM: 5 });
        setRun(out);
        setWear(runWear({ results: out.results, caseRow: caseDraft, geometryRow }));
      } catch (e) {
        setRun(null); setWear(null); setRunError(e.message);
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const onSaveRun = async () => {
    if (!run || !caseDraft?.id) return;
    setSavingRun(true);
    try {
      const summary = Object.fromEntries(Object.entries(run.results).map(([op, r]) => [op, r.summary]));
      const saved = await backend.saveRun({
        case_id: caseDraft.id,
        design_id: trajectory?.design?.id ?? null,
        params: run.params,
        results: { ops: run.ops },
        summary,
        engine_version: TD_ENGINE_VERSION,
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
      <span className="text-sm font-semibold text-slate-100">Torque & Drag Studio</span>
      <div className="ml-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`td-tab-${t.id}`}
            className={`rounded px-2.5 py-1 text-xs ${tab === t.id ? 'bg-lime-500/20 text-lime-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveDraft} data-testid="td-save-case">
            <Save className="mr-1 h-3 w-3" /> Save case
          </Button>
        )}
        <Link to="/dashboard/apps/drilling/torque-drag-studio/help" className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700">
          <HelpCircle className="h-3 w-3" /> Help
        </Link>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex h-6 items-center gap-4 border-t border-slate-800 bg-slate-900/80 px-3 text-[10px] text-slate-500">
      <span>{TD_ENGINE_VERSION}</span>
      <span data-testid="td-status-wellbore">{wellbore ? `${wellbore.name} (${depthUnit})` : 'no wellbore'}</span>
      <span>{caseDraft ? `${caseDraft.name} — string ${totalStringLengthM(caseDraft.string).toFixed(0)} m` : 'no case'}</span>
      <span className="ml-auto">Soft-string (Johancsik); validated vs oracle goldens</span>
    </div>
  );

  const center = !caseDraft ? (
    <div className="flex h-full items-center justify-center text-sm text-slate-500" data-testid="td-empty">
      {wellboreId ? 'Create a T&D case from the explorer.' : 'Pick a site and wellbore.'}
    </div>
  ) : (
    <div className="h-full min-h-0 bg-slate-950">
      {tab === 'string' && (
        <StringGeometryTab
          caseDraft={caseDraft} onCaseChange={onCaseChange}
          holeSections={geometryRow?.hole_sections || []} onSectionsChange={onSectionsChange}
          depthUnit={depthUnit} tdM={tdM}
        />
      )}
      {tab === 'analysis' && (
        <AnalysisTab
          run={run} wear={wear} depthUnit={depthUnit}
          onRun={onRun} onSaveRun={onSaveRun} running={running} savingRun={savingRun}
          runs={runs} onDeleteRun={onDeleteRun}
          caseName={caseDraft.name} wellboreName={wellbore?.name} error={runError}
        />
      )}
      {tab === 'wear' && <WearTab wear={wear} depthUnit={depthUnit} />}
      {tab === 'sensitivity' && (
        <SensitivityTab stations={trajectory?.stations || []} caseDraft={caseDraft}
          geometryRow={geometryRow} depthUnit={depthUnit} />
      )}
    </div>
  );

  const explorer = (
    <Explorer
      sites={sites} selectedSiteId={siteId} onSelectSite={setSiteId}
      wellbores={wellbores} selectedWellboreId={wellboreId} onSelectWellbore={setWellboreId}
      cases={cases} selectedCaseId={caseId} onSelectCase={setCaseId}
      onNewCase={onNewCase} onDeleteCase={onDeleteCase}
      trajectory={trajectory}
    />
  );

  return (
    <WorkspaceShell
      ribbon={ribbon}
      explorer={explorer}
      center={center}
      statusBar={statusBar}
      autoSaveId="torque-drag-studio.workspace.v1"
      minWidth={1100}
    />
  );
}
