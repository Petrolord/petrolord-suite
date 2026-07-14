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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Waves, Loader2, Save } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellExplorer from './WellExplorer';
import RockParamsPanel from './RockParamsPanel';
import FluidsPanel from './FluidsPanel';
import AvoPanel from './AvoPanel';
import WedgePanel from './WedgePanel';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';

// manual-halfspace defaults = the class-III gas-sand oracle fixture
// (shale over gas sand), so the AVO panel lands on a verifiable case
export const DEFAULT_AVO = {
  mode: 'top',
  topId: '',
  windowM: 10,
  maxTheta: 40,
  upper: { vp: 2900, vs: 1330, rho: 2290 },
  lower: { vp: 2540, vs: 1620, rho: 2090 },
};

// the oracle wedge golden's parameters (tuning thickness 16 ms)
export const DEFAULT_WEDGE = {
  rcTop: 0.1, rcBase: -0.1, freqHz: 25, dtMs: 1, maxThicknessMs: 60,
};

export default function RockWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [wellData, setWellData] = useState(null); // {wellId, model, inventory, tops}
  const [zones, setZones] = useState([]);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [rock, setRock] = useState(DEFAULT_ROCK);
  const [avo, setAvo] = useState(DEFAULT_AVO);
  const [wedge, setWedge] = useState(DEFAULT_WEDGE);
  const [view, setView] = useState('fluids'); // 'fluids' | 'avo' | 'wedge'
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
        if (project.scenario) setScenario((s) => ({ ...s, ...project.scenario }));
        if (project.rock) setRock((r) => ({ ...r, ...project.rock }));
        if (project.avo) setAvo((a) => ({ ...a, ...project.avo }));
        if (project.wedge) setWedge((w) => ({ ...w, ...project.wedge }));
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
      const model = buildModel(curves, mapped);
      setWellData({
        wellId,
        model,
        inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })),
        tops,
      });
      setZones(zoneList);
      setStatus(model.vsSource === 'estimated'
        ? `Loaded ${model.n} samples — no DTS, Vs estimated (Greenberg-Castagna).`
        : `Loaded ${model.n} samples.`);
    } catch (e) {
      setStatus(e.message);
      setWellData(null);
    } finally {
      setLoadingId(null);
    }
  }, [backend]);

  const model = wellData?.model || null;

  const applyParams = ({ scenario: s, rock: r }) => {
    setScenario(s);
    setRock(r);
    setStatus('Parameters applied.');
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      await backend.saveProject({ scenario, rock, avo, wedge });
      setStatus('Project saved.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  };

  const viewButton = (key, label, disabled = false) => (
    <button
      type="button"
      data-testid={`rp-view-${key}`}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded border disabled:opacity-40
        ${view === key ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
      onClick={() => setView(key)}
    >
      {label}
    </button>
  );

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <Waves className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Rock Physics Studio</span>
      <span className="text-[11px] text-slate-500">fluid substitution, AVO and tuning on the shared well registry</span>
      <div className="ml-4 flex items-center gap-1">
        {viewButton('fluids', 'Fluids & Gassmann')}
        {viewButton('avo', 'AVO')}
        {viewButton('wedge', 'Wedge')}
      </div>
      {model?.vsSource === 'estimated' && (
        <span
          data-testid="rp-vs-badge"
          title="This well has no shear log — Vs is estimated with Greenberg-Castagna on the VSH sand/shale split"
          className="rounded px-1.5 py-0.5 bg-amber-500/15 border border-amber-600/50 text-amber-300 text-[11px]"
        >
          Vs estimated
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          data-testid="rp-save-project"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border
            border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={saveProject}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          type="button"
          data-testid="rp-toggle-dock"
          className={`px-2 py-1 text-xs rounded border
            ${dockOpen ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
          onClick={() => setDockOpen((v) => !v)}
        >
          Scenario & rock
        </button>
      </div>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="rp-status" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap">
        {selected ? `${selected.name} · ${model ? `${model.n} samples` : '…'}` : `${wells?.length ?? '…'} wells`}
      </span>
      <span className="whitespace-nowrap text-slate-600">SI internal (m/s · kg/m³ · Pa)</span>
    </div>
  );

  const needsWell = (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="rp-empty">
      {!wells ? (
        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading registry wells…</>
      ) : selectedId && !wellData ? (
        loadingId ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading curves…</> : status
      ) : (
        'Select a well to run fluid substitution.'
      )}
    </div>
  );

  const center = view === 'wedge' ? (
    <WedgePanel wedge={wedge} onWedgeChange={setWedge} />
  ) : view === 'avo' ? (
    (avo.mode === 'manual' || model) ? (
      <AvoPanel model={model} tops={wellData?.tops || []} avo={avo} onAvoChange={setAvo} />
    ) : needsWell
  ) : (
    model ? (
      <FluidsPanel model={model} zones={zones} scenario={scenario} rock={rock} />
    ) : needsWell
  );

  return (
    <WorkspaceShell
      autoSaveId="rockphysicsstudio.workspace.v1"
      minWidth={1000}
      dockDefaultSize={24}
      ribbon={ribbon}
      explorer={(
        <WellExplorer
          wells={wells || []}
          selectedId={selectedId}
          loadingId={loadingId}
          curveInventory={wellData?.inventory}
          onSelect={select}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <RockParamsPanel scenario={scenario} rock={rock} onApply={applyParams} />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
