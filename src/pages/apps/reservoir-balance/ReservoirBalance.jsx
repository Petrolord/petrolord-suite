// Material Balance Studio (MB3) — Reservoir Balance on the shared Studio
// shell. Replaces the pre-MB3 two-page layout (case-list page + RbCaseDetail
// tabs page, both retired) with the studio-class workstation used by the DCA,
// Waterflood Design and Well Test Analysis studios.
//
// Routes (App.jsx): apps/reservoir/reservoir-balance and .../cases/:caseId
// (plus the -pro / -surveillance / material-balance-studio slug aliases) all
// mount this page; :caseId selects the open case. ?tab= deep-links a tab.
//
// Tabs (only what is real ships): Data | PVT | Aquifer | Run | Plots |
// Forecast | Contacts | Report. The Aquifer tab is segmented
// Model | Screening (MB4); the Run tab is segmented
// Regression | History match (MB5); Forecast/Contacts/Report are MB6.
//
// Persistence: rb_cases + rb_* tables via lib/api.js. Every write is explicit
// and immediate (no debounced autosave here by design: production-data saves
// are non-atomic delete+insert). Results are computed by the calculate-mbal
// edge function. The studio shows the last completed run of the case and
// checks it against the current inputs (H4, lib/runStaleness.js): a run
// made before an input changed is named as an earlier run, its status words
// are withheld and the report waits for a new run.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  Scale, Play, Loader2, Database, Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
import AquiferScreening from '@/components/reservoirbalance/AquiferScreening';
import HistoryMatch from '@/components/reservoirbalance/HistoryMatch';
import ForecastTab from '@/components/reservoirbalance/ForecastTab';
import ContactsTab from '@/components/reservoirbalance/ContactsTab';
import ReportTab from '@/components/reservoirbalance/ReportTab';
import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';
import NewCaseDialog, { fluidSystemDisplay } from '@/components/reservoirbalance/NewCaseDialog';
import MbsHelpContent from '@/components/reservoirbalance/MbsHelpContent';
import { mapWellTestIntake } from './lib/wellTestIntake';
import { staleRunMessage } from './lib/runStaleness';
import { validationTierOf, fmt, r2Text, INJECTION_NOTE } from './lib/reportModel';
import { driveIndexDefs, inPlaceOf } from './lib/mbalSeries';
import { MBAL_OILFIELD_VIEW, MBAL_METRIC_VIEW, MBAL_UNIT_SPEC } from './lib/mbalUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { pvtTableCoverage } from './lib/pvtSource';
import { RecordSharingBar } from '@/components/recordSharing';

const TABS = [
  { value: 'data', label: 'Data' },
  { value: 'pvt', label: 'PVT' },
  { value: 'aquifer', label: 'Aquifer' },
  { value: 'run', label: 'Run' },
  { value: 'plots', label: 'Plots' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'report', label: 'Report' },
];

const Stat = ({ label, value, hint }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold font-pl-mono tabular-nums">{value}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const DriveIndex = ({ label, value }) => (
  <div className="border rounded-md p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-base font-semibold mt-1 font-pl-mono tabular-nums">
      {value === null || value === undefined ? EMPTY_VALUE : value.toFixed(3)}
    </p>
  </div>
);

// ─── Left-rail case summary ──────────────────────────────────────────────────
const CaseSummary = ({ onEdit }) => {
  const { caseData, units } = useMaterialBalanceStudio();
  if (!caseData) return null;
  const fluid = fluidSystemDisplay(caseData.fluid_system);
  const FluidIcon = fluid.icon;
  const pDigits = units.unit('pressure') === 'psi' || units.unit('pressure') === 'kPa' ? 0 : 2;
  const p = (v) => (v == null ? EMPTY_VALUE : `${fmt(units.to('pressure', Number(v)), pDigits)} ${units.label('pressure')}`);
  return (
    <section className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="mbal-case-summary">
      <div className="flex items-center gap-2">
        <FluidIcon className={`h-4 w-4 shrink-0 ${fluid.color}`} />
        <span className="text-sm font-medium text-pl-text truncate min-w-0 flex-1">{caseData.name}</span>
        {onEdit && (
          <button type="button" onClick={onEdit} data-testid="mbal-edit-case"
            className="shrink-0 text-[11px] text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Edit case</button>
        )}
      </div>
      <p className="text-[11px] text-pl-muted">
        {caseData.field_name || 'No field'}
        {caseData.reservoir_name && ` / ${caseData.reservoir_name}`}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-pl-muted">Initial P</span>
        <span className="text-pl-text text-right">{p(caseData.initial_pressure_psia)}</span>
        <span className="text-pl-muted">Temperature</span>
        <span className="text-pl-text text-right">{fmt(units.to('temperature', Number(caseData.reservoir_temperature_f)), 0)} {units.label('temperature')}</span>
        <span className="text-pl-muted">Initial Sw</span>
        <span className="text-pl-text text-right">{fmt(Number(caseData.initial_water_saturation), 3)}</span>
        <span className="text-pl-muted">Bubble point</span>
        <span className="text-pl-text text-right">{caseData.bubble_point_psia ? p(caseData.bubble_point_psia) : EMPTY_VALUE}</span>
        <span className="text-pl-muted">Data rows</span>
        <span className="text-pl-text text-right">{caseData.production_data?.length ?? 0}</span>
      </div>
    </section>
  );
};

// ─── Display units (PL3) ─────────────────────────────────────────────────────
// The Suite unit profile decides the units a case opens in. The switch here is
// a view for this session; stored data and the engine stay in oilfield units.
const sameView = (a, b) => Object.keys(MBAL_UNIT_SPEC).every((k) => a[k] === b[k]);
const UnitsControl = () => {
  const { unitsHook, units } = useMaterialBalanceStudio();
  const current = sameView(unitsHook.units, MBAL_OILFIELD_VIEW) ? 'oilfield' : (sameView(unitsHook.units, MBAL_METRIC_VIEW) ? 'metric' : 'profile');
  const apply = (view) => { for (const k of Object.keys(MBAL_UNIT_SPEC)) unitsHook.setUnit(k, view[k]); };
  const options = [{ value: 'oilfield', label: 'Oilfield' }, { value: 'metric', label: 'Metric' }];
  if (current === 'profile') options.push({ value: 'profile', label: 'My profile' });
  return (
    <section className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="mbal-units">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">Display units</span>
        <SegmentedControl
          size="sm"
          label="Display units"
          value={current}
          onValueChange={(v) => { if (v === 'oilfield') apply(MBAL_OILFIELD_VIEW); else if (v === 'metric') apply(MBAL_METRIC_VIEW); }}
          options={options}
        />
      </div>
      <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="mbal-units-line">
        {units.label('pressure')}, {units.label('temperature')}, {units.label('stockVolume')}, {units.label('resVolume')}, {units.label('gasVolume')}, {units.label('depth')}.
        {' '}Pressures are absolute. STB and sm3 are surface volumes; RB and rm3 are reservoir volumes.
      </p>
      {unitsHook.available && unitsHook.differs.length > 0 && (
        <button type="button" className="text-[11px] underline text-pl-primary-text hover:text-pl-primary-text-hover" onClick={unitsHook.resetToProfile} data-testid="mbal-units-reset">
          Use my units profile
        </button>
      )}
    </section>
  );
};

// ─── Stale run notice (H4) ───────────────────────────────────────────────────
// Shown above every tab that reads the stored result when an input changed
// after that run. Mirrors the Well Test rule for a stale auto-fit.
const RESULT_TABS = ['run', 'plots', 'forecast', 'contacts', 'report'];
export const StaleRunNotice = () => {
  const { runStaleness } = useMaterialBalanceStudio();
  if (!runStaleness?.stale) return null;
  return (
    <Alert variant="warning" className="mb-4" data-testid="mbal-stale-run">
      <Info className="h-4 w-4" />
      <AlertTitle>Results are from an earlier run</AlertTitle>
      <AlertDescription className="text-xs">{staleRunMessage(runStaleness)}</AlertDescription>
    </Alert>
  );
};

// ─── Run tab main area ───────────────────────────────────────────────────────
const RunPanel = () => {
  const {
    caseData, lastResult, lastRunConfig, running, handleRun, runStaleness, units, defaultCfg,
  } = useMaterialBalanceStudio();
  // what the next run would be made on: the PVT table of the case against its pressures
  const coverage = pvtTableCoverage(caseData, defaultCfg);
  const stale = Boolean(runStaleness?.stale);
  const rows = caseData?.production_data ?? [];
  const rowCount = rows.length;
  const isGas = caseData?.fluid_system === 'gas';
  const injected = rows.some((r) => (r.cum_water_inj_stb ?? 0) > 0 || (r.cum_gas_inj_scf ?? 0) > 0);
  const tier = lastResult ? validationTierOf({ result: lastResult, caseData, runConfig: lastRunConfig }) : null;
  const inPlace = lastResult ? inPlaceOf(lastResult, isGas) : null;
  const ips = units.scaled(isGas ? 'gasVolume' : 'stockVolume', inPlace ?? 0);
  const w = lastResult?.aquifer_owip_rb;
  const ws = units.scaled('resVolume', w ?? 0);
  const sum = lastResult?.final_drive_index_sum;
  const isHm = Boolean(lastResult?.plot_data?.history_match);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run material balance</CardTitle>
          <CardDescription>
            Runs the regression on the data, the PVT and the aquifer model of the other tabs. The result names the published benchmark behind the engine path it used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
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
          {coverage?.outside.length > 0 && (
            <Alert variant="warning" data-testid="mbal-pvt-coverage-note">
              <Info className="h-4 w-4" />
              <AlertTitle>The PVT table does not cover every pressure of the case</AlertTitle>
              <AlertDescription className="text-xs">
                {coverage.outside.length} timestep{coverage.outside.length === 1 ? '' : 's'} ({coverage.outside.slice(0, 8).map((o) => o.timestep_index).join(', ')}{coverage.outside.length > 8 ? ' and more' : ''}) lie outside the table
                ({fmt(units.to('pressure', coverage.min), 0)} to {fmt(units.to('pressure', coverage.max), 0)} {units.label('pressure')}) and carry no PVT of their own.
                The engine uses the correlations of the PVT tab for those and the table for the rest, so the balance would mix two PVT descriptions. Extend the table on the PVT tab before running.
              </AlertDescription>
            </Alert>
          )}
          {injected && (
            <Alert variant="warning" data-testid="mbal-injection-note">
              <Info className="h-4 w-4" />
              <AlertTitle>Injection is on the data table and is left out of the balance</AlertTitle>
              <AlertDescription className="text-xs">{INJECTION_NOTE}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card data-testid="mbal-result-card">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle data-testid="mbal-result-title">{stale ? 'Earlier result, inputs changed since' : 'Latest result'}</CardTitle>
                <CardDescription>
                  Drive mechanism:{' '}
                  <span className="font-medium">
                    {lastResult.drive_mechanism?.replace(/_/g, ' ')}
                  </span>
                  . Aquifer strength:{' '}
                  <span className="font-medium">{lastResult.aquifer_strength}</span>
                  {isHm ? '. Headline from the pressure history match.' : '.'}
                </CardDescription>
              </div>
              {stale ? (
                <Badge variant="outline" data-testid="mbal-result-stale-badge">Not current</Badge>
              ) : tier?.tier ? (
                <span data-testid="mbal-result-tier">
                  <ValidationTierBadge tier={tier.tier} reference={tier.reference} tolerancePct={tier.tolerancePct} />
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label={isGas ? 'OGIP' : 'OOIP'}
                value={inPlace == null ? EMPTY_VALUE : `${fmt(ips.to(inPlace), 2)} ${ips.label}`}
              />
              <Stat label="Regression r2" value={r2Text(lastResult.r_squared)} hint={Number.isFinite(lastResult.n_data_points) ? `${lastResult.n_data_points} points in the fit` : undefined} />
              {Number.isFinite(w) && (
                <Stat label="Aquifer W" value={`${fmt(ws.to(w), 1)} ${ws.label}`} />
              )}
              <Stat
                label="Drive index sum"
                value={fmt(sum, 3)}
                hint="1.000 when the fitted volume reproduces the last timestep"
              />
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {driveIndexDefs(isGas).map((d) => (
                <DriveIndex key={d.key} label={d.label}
                  value={d.key === 'cdi' ? (lastResult.final_cdi ?? lastResult.final_sdi) : lastResult[`final_${d.key}`]} />
              ))}
            </div>
            <p className="text-[11px] text-pl-muted mt-2">
              Each index is its energy term over the hydrocarbon voidage ({isGas ? 'Gp Bg' : 'F minus Wp Bw'}), at the last timestep. CDI is the rock and connate water expansion.
            </p>

            {lastResult.warnings && lastResult.warnings.length > 0 && (
              <Alert variant="warning" className="mt-6">
                <Info className="h-4 w-4" />
                <AlertTitle>Engine warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                    {lastResult.warnings.map((w2, idx) => (
                      <li key={idx}>{w2}</li>
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

// column names of rb_cases as the change history words them
const CASE_FIELD_LABELS = Object.freeze({
  name: 'name', description: 'description', fluid_system: 'fluid system',
  initial_pressure_psia: 'initial pressure', reservoir_temperature_f: 'temperature',
  initial_water_saturation: 'initial water saturation', bubble_point_psia: 'bubble point',
  rock_compressibility: 'rock compressibility', water_compressibility: 'water compressibility',
  has_gas_cap: 'gas cap', gas_cap_ratio_m: 'gas cap ratio m', has_aquifer: 'aquifer',
  ooip_volumetric_stb: 'volumetric oil in place', ogip_volumetric_scf: 'volumetric gas in place',
});

const NoCaseSelected = ({ onCreate }) => (
  <div className="flex flex-col items-center justify-center h-full py-24 text-center">
    <Database className="h-12 w-12 text-pl-muted mb-4" />
    <h3 className="text-lg font-semibold text-pl-text mb-1">No case open</h3>
    <p className="text-sm text-pl-muted max-w-md mb-6">
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
    ownCases, sharedCases, casesError, refreshCases,
    sharing, viewingShared, readOnlyReason, saveCopy,
    caseId, caseData, caseLoading, caseError, refreshCase,
    running, refreshRunInputs,
    handleCaseCreated, handleDeleteCase,
  } = useMaterialBalanceStudio();
  const { toast } = useToast();

  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [editCaseOpen, setEditCaseOpen] = useState(false);
  const [newCasePrefill, setNewCasePrefill] = useState(null);
  const [newCaseHandoffs, setNewCaseHandoffs] = useState(null);
  // Aquifer tab segment (MB4): server model config vs client screening.
  const [aquiferSegment, setAquiferSegment] = useState('model');
  // Run tab segment (MB5): regression vs pressure history match.
  const [runSegment, setRunSegment] = useState('regression');

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
    setNewCaseHandoffs(mapped.handoffs ?? null);
    setNewCaseOpen(true);
    toast({ title: 'Well test results received', description: mapped.note });
  }, [location.state, toast]);

  const openCreate = () => {
    setNewCasePrefill(null);
    setNewCaseHandoffs(null);
    setNewCaseOpen(true);
  };

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          label="Case"
          projects={ownCases}
          sharedProjects={sharedCases}
          canDelete={!viewingShared}
          currentProjectId={caseId || ''}
          onOpen={(id) => onOpenCase(id)}
          onDelete={handleDeleteCase}
          onRequestCreate={openCreate}
          confirmDeleteMessage="Delete this case? Its production data, run configs, runs and results are removed permanently. This cannot be undone."
        />
        {casesError && (
          <p className="text-[11px] text-pl-danger-text mt-2">{casesError}</p>
        )}
        {caseData && (
          <RecordSharingBar
            sharing={sharing}
            label="case"
            className="mt-2"
            allowEdit={false}
            onSaveCopy={saveCopy}
            fieldLabels={CASE_FIELD_LABELS}
          />
        )}
      </section>
      <CaseSummary onEdit={viewingShared ? undefined : () => setEditCaseOpen(true)} />
      {caseData && <UnitsControl />}
      {caseData && (
        <p className="text-[11px] text-pl-muted leading-relaxed">
          Edits on every tab save straight to the case database when you apply them. Results are those of the last completed run. When an input changes after that run, the studio says so and the report waits for a new run.
        </p>
      )}
    </div>
  );

  const main = !caseId ? (
    <NoCaseSelected onCreate={openCreate} />
  ) : caseLoading ? (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-pl-muted" />
    </div>
  ) : caseError || !caseData ? (
    <Alert variant="destructive" className="max-w-xl">
      <AlertTitle>Could not load case</AlertTitle>
      <AlertDescription>{caseError ?? 'Unknown error.'}</AlertDescription>
    </Alert>
  ) : (
    <>
      {readOnlyReason && (
        <Alert className="mb-4" data-testid="mbal-read-only">
          <AlertTitle>Open read-only</AlertTitle>
          <AlertDescription>
            {readOnlyReason} The results, the plots and the report are those of its owner's last run. A copy takes the conditions, the production data and the run settings, and you run it yourself.
          </AlertDescription>
        </Alert>
      )}
      {RESULT_TABS.includes(activeTab) && <StaleRunNotice />}
      {/* DataHub stays mounted (hidden) on other tabs so a parsed-but-unsaved
          CSV survives a visit to PVT/Aquifer/etc. Case switches still reset it:
          refreshCase flips caseLoading, which swaps in the loader branch and
          unmounts the whole tab tree. */}
      <div className={activeTab === 'data' ? undefined : 'hidden'}>
        <DataHub caseId={caseId} caseData={caseData} onDataSaved={refreshCase} />
      </div>
      {activeTab === 'pvt' && (
        <PvtRock caseId={caseId} caseData={caseData} onConfigChange={refreshRunInputs} />
      )}
      {activeTab === 'aquifer' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Aquifer view"
              value={aquiferSegment}
              onValueChange={setAquiferSegment}
              options={[['model', 'Model'], ['screening', 'Screening']].map(([v, l]) => ({ value: v, label: l }))}
            />
            <p className="text-[11px] text-pl-muted min-w-0 basis-full sm:basis-0 sm:flex-1">
              Model drives the engine run; Screening explores influx client-side and can write its parameters into the model.
            </p>
          </div>
          {aquiferSegment === 'model' ? (
            <AquiferModel caseId={caseId} caseData={caseData} onConfigChange={refreshRunInputs} />
          ) : (
            <AquiferScreening />
          )}
        </div>
      )}
      {activeTab === 'run' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Run mode"
              value={runSegment}
              onValueChange={setRunSegment}
              options={[['regression', 'Regression'], ['match', 'History match']].map(([v, l]) => ({ value: v, label: l }))}
            />
            <p className="text-[11px] text-pl-muted min-w-0 basis-full sm:basis-0 sm:flex-1">
              Regression solves OOIP or OGIP from the observed pressures; History match simulates pressures from candidate parameters and fits them to the observations.
            </p>
          </div>
          {runSegment === 'regression' ? <RunPanel /> : <HistoryMatch />}
        </div>
      )}
      {activeTab === 'plots' && (
        <RbDiagnosticPlots />
      )}
      {activeTab === 'forecast' && <ForecastTab />}
      {activeTab === 'contacts' && <ContactsTab />}
      {activeTab === 'report' && <ReportTab />}
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
        handoffs={newCaseHandoffs}
      />
      <NewCaseDialog
        open={editCaseOpen}
        onOpenChange={setEditCaseOpen}
        editCase={caseData}
        onSaved={() => { refreshCase(); refreshCases?.(); }}
      />
    </>
  );
};

// ─── Page (routing wrapper) ──────────────────────────────────────────────────
/** @param {{sharingStore?: object}} props a record sharing store; the Supabase one when omitted (the /dev harness hands in its own) */
export default function ReservoirBalance({ sharingStore = undefined } = {}) {
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

  // Design system rollout batch 1A (docs/scope/DesignSystem-Rollout.md):
  // the page sits in the dashboard scope, so it opens light and the header
  // toggle switches it to dark per user. Charts keep the white standard.
  return (
    <div data-testid="mbal-theme-scope">
      <MaterialBalanceStudioProvider caseId={caseId ?? null} onOpenCase={handleOpenCase} sharingStore={sharingStore}>
        <MaterialBalanceStudioContent onOpenCase={handleOpenCase} />
      </MaterialBalanceStudioProvider>
    </div>
  );
}
