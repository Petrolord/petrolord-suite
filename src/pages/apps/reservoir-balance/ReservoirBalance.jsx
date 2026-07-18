// Material Balance Studio (MB3) — Reservoir Balance on the shared Studio
// shell. Replaces the pre-MB3 two-page layout (case-list page + RbCaseDetail
// tabs page, both retired) with the studio-class workstation used by the DCA,
// Waterflood Design and Well Test Analysis studios.
//
// Routes (App.jsx): apps/reservoir/reservoir-balance and .../cases/:caseId
// (plus the -pro / -surveillance / material-balance-studio slug aliases) all
// mount this page; :caseId selects the open case. ?tab= deep-links a tab.
//
// Tabs (only what is real ships): Data | PVT | Aquifer | Run | Plots.
// Later phases add: Aquifer screening segment (MB4), History Match (MB5),
// Contacts | Forecast | Report (MB6).
//
// Persistence: rb_cases + rb_* tables via lib/api.js. Every write is explicit
// and immediate (no debounced autosave here by design: production-data saves
// are non-atomic delete+insert). Results are computed by the calculate-mbal
// edge function and recomputed on demand, never trusted from stale state.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  Scale, Play, Loader2, Database, Info, CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import {
  MaterialBalanceStudioProvider,
  useMaterialBalanceStudio,
} from '@/contexts/MaterialBalanceStudioContext';
import DataHub from '@/components/reservoirbalance/DataHub';
import PvtRock from '@/components/reservoirbalance/PvtRock';
import AquiferModel from '@/components/reservoirbalance/AquiferModel';
import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';
import NewCaseDialog, { fluidSystemDisplay } from '@/components/reservoirbalance/NewCaseDialog';
import MbsHelpContent from '@/components/reservoirbalance/MbsHelpContent';
import { mapWellTestIntake } from './lib/wellTestIntake';

const TABS = [
  { value: 'data', label: 'Data' },
  { value: 'pvt', label: 'PVT' },
  { value: 'aquifer', label: 'Aquifer' },
  { value: 'run', label: 'Run' },
  { value: 'plots', label: 'Plots' },
];

function formatNumber(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const { decimals = 2 } = opts;
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

const Stat = ({ label, value, hint }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const DriveIndex = ({ label, value }) => (
  <div className="border rounded-md p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-base font-semibold mt-1">
      {value === null || value === undefined ? '—' : value.toFixed(3)}
    </p>
  </div>
);

// ─── Left-rail case summary ──────────────────────────────────────────────────
const CaseSummary = () => {
  const { caseData } = useMaterialBalanceStudio();
  if (!caseData) return null;
  const fluid = fluidSystemDisplay(caseData.fluid_system);
  const FluidIcon = fluid.icon;
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FluidIcon className={`h-4 w-4 ${fluid.color}`} />
        <span className="text-sm font-medium text-slate-200 truncate">{caseData.name}</span>
      </div>
      <p className="text-[11px] text-slate-500">
        {caseData.field_name || 'No field'}
        {caseData.reservoir_name && ` / ${caseData.reservoir_name}`}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-slate-500">Initial P</span>
        <span className="text-slate-300 text-right">{formatNumber(caseData.initial_pressure_psia)} psia</span>
        <span className="text-slate-500">Temperature</span>
        <span className="text-slate-300 text-right">{formatNumber(caseData.reservoir_temperature_f)} °F</span>
        <span className="text-slate-500">Initial Sw</span>
        <span className="text-slate-300 text-right">{formatNumber(caseData.initial_water_saturation, { decimals: 3 })}</span>
        <span className="text-slate-500">Bubble point</span>
        <span className="text-slate-300 text-right">
          {caseData.bubble_point_psia ? `${formatNumber(caseData.bubble_point_psia)} psia` : '—'}
        </span>
        <span className="text-slate-500">Data rows</span>
        <span className="text-slate-300 text-right">{caseData.production_data?.length ?? 0}</span>
      </div>
    </section>
  );
};

// ─── Run tab main area (moved from the retired RbCaseDetail.jsx) ─────────────
const RunPanel = () => {
  const { caseData, lastResult, running, handleRun } = useMaterialBalanceStudio();
  const rowCount = caseData?.production_data?.length ?? 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run material balance</CardTitle>
          <CardDescription>
            Invokes the validated engine. PVT correlations and aquifer model are inherited from the PVT and Aquifer tabs. Each computed result carries a validation tier badge indicating the evidence supporting that specific engine path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button size="lg" onClick={handleRun} disabled={running || rowCount < 2}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run MBAL
            </Button>
            {rowCount < 2 && (
              <p className="text-sm text-muted-foreground">
                Upload production data via the Data tab first (need at least 2 timesteps).
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Latest result</CardTitle>
                <CardDescription>
                  Drive mechanism:{' '}
                  <span className="font-medium">
                    {lastResult.drive_mechanism?.replace(/_/g, ' ')}
                  </span>
                  {' • '}
                  Aquifer:{' '}
                  <span className="font-medium">{lastResult.aquifer_strength}</span>
                </CardDescription>
              </div>
              {lastResult.validation_tier ? (
                <ValidationTierBadge
                  tier={lastResult.validation_tier}
                  reference={lastResult.validation_reference}
                  tolerancePct={lastResult.validation_tolerance_pct}
                />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {caseData.fluid_system === 'gas' ? (
                <Stat
                  label="OGIP"
                  value={`${formatNumber(lastResult.estimated_ogip_scf / 1e9, { decimals: 2 })} Bcf`}
                />
              ) : (
                <Stat
                  label="OOIP"
                  value={`${formatNumber(lastResult.estimated_ooip_stb / 1e6, { decimals: 2 })} MMSTB`}
                />
              )}
              <Stat label="R²" value={formatNumber(lastResult.r_squared, { decimals: 4 })} />
              {lastResult.aquifer_owip_rb && (
                <Stat
                  label="Aquifer W"
                  value={`${formatNumber(lastResult.aquifer_owip_rb / 1e6, { decimals: 1 })} MM rb`}
                />
              )}
              <Stat
                label="Drive index sum"
                value={formatNumber(lastResult.final_drive_index_sum, { decimals: 3 })}
                hint="(should be ≈ 1.00)"
              />
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {caseData.fluid_system === 'gas' ? (
                <>
                  <DriveIndex label="Gas drive" value={lastResult.final_gdi} />
                  <DriveIndex label="cf+cw drive" value={lastResult.final_cdi} />
                  <DriveIndex label="Water drive" value={lastResult.final_wdi} />
                </>
              ) : (
                <>
                  <DriveIndex label="Depletion (DDI)" value={lastResult.final_ddi} />
                  <DriveIndex label="Gas cap (GDI)" value={lastResult.final_gdi} />
                  <DriveIndex label="Water (WDI)" value={lastResult.final_wdi} />
                  <DriveIndex label="Segregation (SDI)" value={lastResult.final_sdi} />
                </>
              )}
            </div>

            {lastResult.warnings && lastResult.warnings.length > 0 && (
              <Alert className="mt-6">
                <Info className="h-4 w-4" />
                <AlertTitle>Engine warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                    {lastResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const NoCaseSelected = ({ onCreate }) => (
  <div className="flex flex-col items-center justify-center h-full py-24 text-center">
    <Database className="h-12 w-12 text-slate-700 mb-4" />
    <h3 className="text-lg font-semibold text-slate-200 mb-1">No case open</h3>
    <p className="text-sm text-slate-500 max-w-md mb-6">
      Select a case in the left rail, or create a new material balance study to estimate OOIP, drive mechanism and aquifer support from production history.
    </p>
    <Button onClick={onCreate}>Create a case</Button>
  </div>
);

// ─── Studio content ──────────────────────────────────────────────────────────
const MaterialBalanceStudioContent = ({ onOpenCase }) => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'data',
  );
  const {
    cases, casesError,
    caseId, caseData, caseLoading, caseError, refreshCase,
    running, runVersion,
    handleCaseCreated, handleDeleteCase,
  } = useMaterialBalanceStudio();
  const { toast } = useToast();

  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCasePrefill, setNewCasePrefill] = useState(null);

  // Average pressure / k / skin intake from the Well Test Analysis Studio
  // (WT5 navigate-state handoff; mapping is the jest-guarded pure function
  // in lib/wellTestIntake.js).
  const location = useLocation();
  const wtIntakeDone = useRef(false);
  useEffect(() => {
    const mapped = mapWellTestIntake(location.state?.wellTestData);
    if (!mapped || wtIntakeDone.current) return;
    wtIntakeDone.current = true;
    setNewCasePrefill(mapped.prefill);
    setNewCaseOpen(true);
    toast({ title: 'Well test results received', description: mapped.note });
  }, [location.state, toast]);

  const openCreate = () => {
    setNewCasePrefill(null);
    setNewCaseOpen(true);
  };

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          label="Case"
          projects={cases}
          currentProjectId={caseId || ''}
          onOpen={(id) => onOpenCase(id)}
          onDelete={handleDeleteCase}
          onRequestCreate={openCreate}
          confirmDeleteMessage="Delete this case? Its production data, run configs, runs and results are removed permanently. This cannot be undone."
        />
        {casesError && (
          <p className="text-[11px] text-red-400 mt-2">{casesError}</p>
        )}
      </section>
      <CaseSummary />
      {caseData && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Edits on every tab save straight to the case database when you apply them. Results always come from a fresh engine run, never from stored numbers.
        </p>
      )}
    </div>
  );

  const main = !caseId ? (
    <NoCaseSelected onCreate={openCreate} />
  ) : caseLoading ? (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
    </div>
  ) : caseError || !caseData ? (
    <Alert variant="destructive" className="max-w-xl">
      <AlertTitle>Could not load case</AlertTitle>
      <AlertDescription>{caseError ?? 'Unknown error.'}</AlertDescription>
    </Alert>
  ) : (
    <>
      {activeTab === 'data' && (
        <DataHub caseId={caseId} caseData={caseData} onDataSaved={refreshCase} />
      )}
      {activeTab === 'pvt' && (
        <PvtRock caseId={caseId} caseData={caseData} onConfigChange={() => {}} />
      )}
      {activeTab === 'aquifer' && (
        <AquiferModel caseId={caseId} caseData={caseData} onConfigChange={() => {}} />
      )}
      {activeTab === 'run' && <RunPanel />}
      {activeTab === 'plots' && (
        <RbDiagnosticPlots caseId={caseId} caseData={caseData} runVersion={runVersion} />
      )}
    </>
  );

  return (
    <>
      <Helmet>
        <title>Material Balance Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Material balance analysis: OOIP/OGIP by Havlena-Odeh regression, drive indices, aquifer influx models and diagnostic plots on a validated engine."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Scale}
            iconGradientClass="from-emerald-600 to-teal-600"
            title="Material Balance Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <StudioHelp
            title="Material Balance Studio Guide"
            description="From production history to OOIP, drive mechanism and aquifer support on the validated MBAL engine."
            triggerTitle="Material Balance documentation"
          >
            <MbsHelpContent />
          </StudioHelp>
        }
        sidebarLeft={leftPanel}
        sidebarRight={null}
        defaultRightOpen={false}
        main={<div className="p-4 h-full overflow-y-auto">{main}</div>}
        busyMessage={running ? 'Running the material balance engine…' : null}
      />
      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        onCreated={handleCaseCreated}
        prefill={newCasePrefill}
      />
    </>
  );
};

// ─── Page (routing wrapper) ──────────────────────────────────────────────────
export default function ReservoirBalance() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Base path with the /cases/:id suffix stripped, so open/close navigation
  // works from every slug alias this page is mounted under.
  const basePath = location.pathname.replace(/\/cases\/[^/]+$/, '');
  const handleOpenCase = (id) => {
    if (id) navigate(`${basePath}/cases/${id}`);
    else navigate(basePath);
  };

  return (
    <MaterialBalanceStudioProvider caseId={caseId ?? null} onOpenCase={handleOpenCase}>
      <MaterialBalanceStudioContent onOpenCase={handleOpenCase} />
    </MaterialBalanceStudioProvider>
  );
}
