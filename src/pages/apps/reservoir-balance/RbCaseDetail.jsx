// src/pages/apps/reservoir-balance/RbCaseDetail.jsx
//
// Reservoir Balance — Case Detail Page
// =====================================
//
// Phase 2 deliverable. The page where a user actually performs MBAL analysis.
//
// Mounted at: /dashboard/apps/reservoir/reservoir-balance/cases/:caseId
// (Routing added in Artifact 5: App.jsx patch.)
//
// Tabs:
//   1. Overview     — Case metadata + last run summary
//   2. Data         — Production data table editor (the main entry point)
//   3. Run          — Run trigger + last result display
//   4. Advanced     — Placeholders for PVT, Aquifer, Contacts, Forecast, Reports
//                     (existing components mount in Phase 3)
//
// State model:
//   - Case metadata: server-loaded, edited in Overview tab
//   - Production data: server-loaded, edited locally, save-on-button
//   - Run configs: created on-demand when the user hits "Run MBAL"
//   - Results: server-loaded after a successful run
//
// Pattern: mirrors EpeCaseDetail or equivalent in this Suite.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Droplet,
  Wind,
  Layers,
  TrendingUp,
  Database,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PvtRock from '@/components/reservoirbalance/PvtRock';
import AquiferModel from '@/components/reservoirbalance/AquiferModel';
import DataHub from '@/components/reservoirbalance/DataHub';
import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';
import {
  getCaseWithProductionData,
  createRunConfig,
  runMBAL,
  listRuns,
  getResultByRunId,
  getCaseDefaultConfig,
} from './lib/api';

// =============================================================================
// HELPERS
// =============================================================================

const FLUID_DISPLAY = {
  oil: { label: 'Oil reservoir', icon: Droplet, color: 'text-green-500' },
  gas: { label: 'Gas reservoir', icon: Wind, color: 'text-blue-500' },
  oil_with_gas_cap: {
    label: 'Oil with gas cap',
    icon: Layers,
    color: 'text-purple-500',
  },
};

function fluidDisplay(value) {
  return (
    FLUID_DISPLAY[value] ?? {
      label: value,
      icon: Droplet,
      color: 'text-gray-500',
    }
  );
}

function formatNumber(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const { decimals = 2, compact = false } = opts;
  if (compact) {
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}MM`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}k`;
  }
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const RbCaseDetail = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastResultLoading, setLastResultLoading] = useState(false);
  // Bumped on successful MBAL run; passed to <RbDiagnosticPlots /> so the
  // Plots tab auto-refreshes without the user clicking Refresh manually.
  const [runVersion, setRunVersion] = useState(0);

  // ────────────────────────────────────────────────────────────────────────
  // Initial load
  // ────────────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadErr } = await getCaseWithProductionData(caseId);
    if (loadErr) {
      setError(loadErr.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setError('Case not found.');
      setLoading(false);
      return;
    }
    setCaseData(data);
    setLoading(false);

    // Load the most recent completed run's result, if any
    const { data: runs } = await listRuns(caseId);
    const lastCompletedRun = (runs ?? []).find(
      (r) => r.status === 'completed',
    );
    if (lastCompletedRun) {
      setLastResultLoading(true);
      const { data: result } = await getResultByRunId(lastCompletedRun.id);
      setLastResult(result);
      setLastResultLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ────────────────────────────────────────────────────────────────────────
  // Run MBAL
  // ────────────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    const rowCount = caseData?.production_data?.length ?? 0;
    if (rowCount < 2) {
      toast({
        title: 'No data to run on',
        description: 'Upload production data via the Data tab first (need at least 2 timesteps).',
        variant: 'destructive',
      });
      return;
    }

    setRunning(true);

    // Phase 3: inherit PVT and rock settings from the case-default config
    // saved by PvtRock. Fall back to sensible defaults if no default exists.
    const isGas = caseData.fluid_system === 'gas';
    const { data: defaultCfg } = await getCaseDefaultConfig(caseId);

    const { data: runConfig, error: configErr } = await createRunConfig(caseId, {
      name: `Run ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      is_scenario: true, // mark this row as an executed run, not a default
      // PVT — inherit from saved default config
      oil_gravity_api: defaultCfg?.oil_gravity_api ?? null,
      gas_specific_gravity:
        defaultCfg?.gas_specific_gravity ?? (isGas ? 0.65 : 0.7),
      water_salinity_ppm: defaultCfg?.water_salinity_ppm ?? null,
      pvt_source: defaultCfg?.pvt_source ?? 'correlated',
      pvt_correlations: defaultCfg?.pvt_correlations ?? undefined,
      pvt_lab_table: defaultCfg?.pvt_lab_table ?? null,
      // Rock — inherit
      formation_compressibility_psi:
        defaultCfg?.formation_compressibility_psi ?? 6e-6,
      water_compressibility_psi:
        defaultCfg?.water_compressibility_psi ?? 3e-6,
      // Aquifer + solver — still hardcoded until Artifact 7 wires AquiferModel
      aquifer_model:
        defaultCfg?.aquifer_model ?? (caseData.has_aquifer ? 'pot' : 'none'),
      aquifer_params: defaultCfg?.aquifer_params ?? null,
      solver_method:
        defaultCfg?.solver_method ??
        (isGas ? 'pot_aquifer_plot' : 'havlena_odeh'),
    });

    if (configErr || !runConfig) {
      toast({
        title: 'Could not create run config',
        description: configErr?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      setRunning(false);
      return;
    }

    // Invoke the Edge Function
    const { data: runResp, error: runErr } = await runMBAL(runConfig.id);

    if (runErr) {
      // Compose a description that shows the actual engine detail when present.
      // Engine-level errors (e.g. "Initial timestep must have zero cumulative
      // production") arrive via runErr.detail; generic platform errors arrive
      // only as runErr.message.
      const description = runErr.detail
        ? `${runErr.message}: ${runErr.detail}`
        : runErr.message;
      toast({
        title: 'Run failed',
        description,
        variant: 'destructive',
        duration: 12000,
      });
      setRunning(false);
      return;
    }

    // Fetch the result row for display
    const { data: result } = await getResultByRunId(runResp.run_id);
    setLastResult(result);
    setRunning(false);
    // Signal the Plots tab to re-fetch the latest result for auto-refresh.
    setRunVersion((v) => v + 1);

    toast({
      title: 'MBAL completed',
      description: `Engine returned in ${runResp.duration_ms}ms.`,
    });

    if (result?.warnings?.length > 0) {
      result.warnings.forEach((w) =>
        toast({
          title: 'Engine warning',
          description: w,
          duration: 7000,
        }),
      );
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-3xl">
        <Button variant="ghost" onClick={() => navigate('..')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to cases
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load case</AlertTitle>
          <AlertDescription>{error ?? 'Unknown error.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const fluid = fluidDisplay(caseData.fluid_system);
  const FluidIcon = fluid.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto py-6 px-4 max-w-7xl"
    >
      <Button variant="ghost" onClick={() => navigate('..')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to cases
      </Button>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{caseData.name}</h1>
            <Badge variant="outline" className="gap-1">
              <FluidIcon className={`h-3 w-3 ${fluid.color}`} />
              {fluid.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {caseData.field_name || 'No field'}
            {caseData.reservoir_name && ` / ${caseData.reservoir_name}`}
            {' • '}
            Initial P: {formatNumber(caseData.initial_pressure_psia)} psia
            {' • '}
            T: {formatNumber(caseData.reservoir_temperature_f)} °F
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">
            <Info className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="mr-2 h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="pvt">
            <Settings className="mr-2 h-4 w-4" />
            PVT
          </TabsTrigger>
          <TabsTrigger value="aquifer">
            <TrendingUp className="mr-2 h-4 w-4" />
            Aquifer
          </TabsTrigger>
          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="plots">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Plots
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Sparkles className="mr-2 h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* ───────────────── OVERVIEW ───────────────── */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Production data</CardDescription>
                <CardTitle className="text-2xl">{caseData?.production_data?.length ?? 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {(caseData?.production_data?.length ?? 0) === 0
                    ? 'No timesteps yet'
                    : `${caseData.production_data.length} timesteps loaded`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Last result</CardDescription>
                <CardTitle className="text-2xl">
                  {lastResult
                    ? caseData.fluid_system === 'gas'
                      ? `${formatNumber(lastResult.estimated_ogip_scf / 1e9, { decimals: 2 })} Bcf`
                      : `${formatNumber(lastResult.estimated_ooip_stb / 1e6, { decimals: 2 })} MMSTB`
                    : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {lastResult
                    ? `${caseData.fluid_system === 'gas' ? 'OGIP' : 'OOIP'} estimate`
                    : 'No runs yet'}
                </p>
                {lastResult?.validation_tier && (
                  <div className="mt-2">
                    <ValidationTierBadge
                      tier={lastResult.validation_tier}
                      reference={lastResult.validation_reference}
                      tolerancePct={lastResult.validation_tolerance_pct}
                      size="sm"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Drive mechanism</CardDescription>
                <CardTitle className="text-base">
                  {lastResult?.drive_mechanism
                    ? lastResult.drive_mechanism.replace(/_/g, ' ')
                    : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {lastResult?.aquifer_strength
                    ? `Aquifer: ${lastResult.aquifer_strength}`
                    : 'Run MBAL to determine'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Initial conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Pressure</p>
                  <p className="font-medium">
                    {formatNumber(caseData.initial_pressure_psia)} psia
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Temperature</p>
                  <p className="font-medium">
                    {formatNumber(caseData.reservoir_temperature_f)} °F
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Initial Sw</p>
                  <p className="font-medium">
                    {formatNumber(caseData.initial_water_saturation, { decimals: 3 })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Bubble point</p>
                  <p className="font-medium">
                    {caseData.bubble_point_psia
                      ? `${formatNumber(caseData.bubble_point_psia)} psia`
                      : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────────── DATA ───────────────── */}
        <TabsContent value="data" className="mt-6">
          <DataHub
            caseId={caseId}
            caseData={caseData}
            onDataSaved={() => {
              // Refresh caseData so production_data length reflects the new save
              refresh();
            }}
          />
        </TabsContent>

        {/* ───────────────── PVT (Phase 3 Capsule 3A) ───────────────── */}
        <TabsContent value="pvt" className="mt-6">
          <PvtRock
            caseId={caseId}
            caseData={caseData}
            onConfigChange={() => {
              // Future hook: refresh anything that depends on saved PVT.
              // Phase 3: nothing here yet — Run tab re-reads on each invocation.
            }}
          />
        </TabsContent>

        {/* ───────────────── AQUIFER (Phase 3 Capsule 3A) ───────────────── */}
        <TabsContent value="aquifer" className="mt-6">
          <AquiferModel
            caseId={caseId}
            caseData={caseData}
            onConfigChange={() => {
              // Future hook: refresh anything that depends on saved aquifer model.
              // Phase 3: nothing here yet — Run tab re-reads on each invocation.
            }}
          />
        </TabsContent>

        {/* ───────────────── RUN ───────────────── */}
        <TabsContent value="run" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Run material balance</CardTitle>
              <CardDescription>
                Invokes the validated engine. PVT correlations and aquifer model are inherited from the PVT and Aquifer tabs. Each computed result carries a validation tier badge indicating the evidence supporting that specific engine path.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  onClick={handleRun}
                  disabled={running || (caseData?.production_data?.length ?? 0) < 2}
                >
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Run MBAL
                </Button>
                {(caseData?.production_data?.length ?? 0) < 2 && (
                  <p className="text-sm text-muted-foreground">
                    Upload production data via the Data tab first (need at least 2 timesteps).
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {lastResult && (
            <Card className="mt-4">
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
                      <span className="font-medium">
                        {lastResult.aquifer_strength}
                      </span>
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
                  <Stat
                    label="R²"
                    value={formatNumber(lastResult.r_squared, { decimals: 4 })}
                  />
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
        </TabsContent>

        {/* ───────────────── PLOTS (Phase 3 Capsule 3B) ───────────────── */}
        <TabsContent value="plots" className="mt-6">
          <RbDiagnosticPlots
            caseId={caseId}
            caseData={caseData}
            runVersion={runVersion}
          />
        </TabsContent>

        {/* ───────────────── ADVANCED (Phase 3 preview) ───────────────── */}
        <TabsContent value="advanced" className="mt-6">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Modules in development</AlertTitle>
            <AlertDescription>
              The following modules are placeholder shells. Their underlying functionality is under active development and will be integrated in a future update.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <PreviewCard
              icon={Layers}
              title="Contacts tracker"
              description="OWC/GOC depth tracking through reservoir life."
            />
            <PreviewCard
              icon={TrendingUp}
              title="Forecast scenarios"
              description="DCA forecast tied to MBAL recoverable estimate."
            />
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

// =============================================================================
// SMALL SUB-COMPONENTS
// =============================================================================

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

const PreviewCard = ({ icon: Icon, title, description }) => (
  <Card className="opacity-60">
    <CardHeader>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Badge variant="outline" className="mt-3 text-xs">
        In development
      </Badge>
    </CardContent>
  </Card>
);

export default RbCaseDetail;
