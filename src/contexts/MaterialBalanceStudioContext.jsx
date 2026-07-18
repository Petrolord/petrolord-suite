// Material Balance Studio context (MB3) — the studio-shell state layer for
// the Reservoir Balance upgrade. Unlike the other studios' contexts
// (WellTestStudioContext, WaterfloodDesignContext), persistence is NOT the
// saved_*_projects jsonb pattern: rb_cases and its rb_* satellite tables
// remain the store, all writes go through src/pages/apps/reservoir-balance/
// lib/api.js immediately (no debounced autosave; replaceProductionData is a
// non-atomic delete+insert and must stay behind explicit save actions), and
// results are computed server-side by the calculate-mbal edge function.
//
// This context owns: the case list, the currently open case (with production
// data), the last completed result, and the run action (moved verbatim from
// the retired RbCaseDetail.jsx, including the FunctionsHttpError detail
// extraction in api.js runMBAL). Tab components (DataHub, PvtRock,
// AquiferModel, RbDiagnosticPlots) keep their existing props contracts and
// their own toast-based notifications.
import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  listCases,
  deleteCase,
  getCaseWithProductionData,
  createRunConfig,
  runMBAL,
  listRuns,
  getResultByRunId,
  getCaseDefaultConfig,
} from '@/pages/apps/reservoir-balance/lib/api';

const MaterialBalanceStudioContext = createContext(null);

export const useMaterialBalanceStudio = () => {
  const ctx = useContext(MaterialBalanceStudioContext);
  if (!ctx) {
    throw new Error('useMaterialBalanceStudio must be used within MaterialBalanceStudioProvider');
  }
  return ctx;
};

export const MaterialBalanceStudioProvider = ({ caseId, onOpenCase, children }) => {
  const { toast } = useToast();

  // Case list (left-rail project manager)
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState(null);

  // Current case
  const [caseData, setCaseData] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState(null);

  // Last completed run result + run action
  const [lastResult, setLastResult] = useState(null);
  const [running, setRunning] = useState(false);
  // Bumped on successful MBAL run; RbDiagnosticPlots re-fetches on change.
  const [runVersion, setRunVersion] = useState(0);

  const refreshCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError(null);
    const { data, error } = await listCases();
    if (error) {
      setCasesError(error.message);
      setCases([]);
    } else {
      setCases(data ?? []);
    }
    setCasesLoading(false);
  }, []);

  useEffect(() => {
    refreshCases();
  }, [refreshCases]);

  const refreshCase = useCallback(async () => {
    if (!caseId) {
      setCaseData(null);
      setLastResult(null);
      return;
    }
    setCaseLoading(true);
    setCaseError(null);
    const { data, error } = await getCaseWithProductionData(caseId);
    if (error || !data) {
      setCaseError(error?.message ?? 'Case not found.');
      setCaseData(null);
      setLastResult(null);
      setCaseLoading(false);
      return;
    }
    setCaseData(data);
    setCaseLoading(false);

    const { data: runs } = await listRuns(caseId);
    const lastCompletedRun = (runs ?? []).find((r) => r.status === 'completed');
    if (lastCompletedRun) {
      const { data: result } = await getResultByRunId(lastCompletedRun.id);
      setLastResult(result);
    } else {
      setLastResult(null);
    }
  }, [caseId]);

  useEffect(() => {
    refreshCase();
  }, [refreshCase]);

  const handleCaseCreated = useCallback((newCase) => {
    setCases((prev) => [newCase, ...prev]);
    onOpenCase?.(newCase.id);
  }, [onOpenCase]);

  const handleDeleteCase = useCallback(async (id) => {
    const target = cases.find((c) => c.id === id);
    const { error } = await deleteCase(id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Case deleted',
      description: `"${target?.name ?? 'Case'}" and all associated runs were removed.`,
    });
    setCases((prev) => prev.filter((c) => c.id !== id));
    if (id === caseId) onOpenCase?.(null);
  }, [cases, caseId, onOpenCase, toast]);

  // Run MBAL — moved verbatim from RbCaseDetail.jsx handleRun (Phase 2/3).
  const handleRun = useCallback(async () => {
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

    // Inherit PVT and rock settings from the case-default config saved by
    // PvtRock. Fall back to sensible defaults if no default exists.
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
      // Aquifer + solver — inherit from the Aquifer tab's saved default
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

    const { data: runResp, error: runErr } = await runMBAL(runConfig.id);

    if (runErr) {
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

    const { data: result } = await getResultByRunId(runResp.run_id);
    setLastResult(result);
    setRunning(false);
    setRunVersion((v) => v + 1);

    toast({
      title: 'MBAL completed',
      description: `Engine returned in ${runResp.duration_ms}ms.`,
    });

    if (result?.warnings?.length > 0) {
      result.warnings.forEach((w) =>
        toast({ title: 'Engine warning', description: w, duration: 7000 }),
      );
    }
  }, [caseData, caseId, toast]);

  const value = {
    // case list
    cases, casesLoading, casesError, refreshCases,
    // current case
    caseId, caseData, caseLoading, caseError, refreshCase,
    // run
    lastResult, running, runVersion, handleRun,
    // project-manager actions
    handleCaseCreated, handleDeleteCase,
  };

  return (
    <MaterialBalanceStudioContext.Provider value={value}>
      {children}
    </MaterialBalanceStudioContext.Provider>
  );
};

export default MaterialBalanceStudioContext;
