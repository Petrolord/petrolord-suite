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
  createContext, useCallback, useContext, useEffect, useMemo, useState,
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
  getRunConfig,
} from '@/pages/apps/reservoir-balance/lib/api';
import { assessRunStaleness, buildRunConfigInput } from '@/pages/apps/reservoir-balance/lib/runStaleness';

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
  // H4: what the stored run was made on (its run row and its config
  // snapshot) and what a run would be made on now (the case default
  // config). Together with caseData they decide whether lastResult is stale.
  const [lastRun, setLastRun] = useState(null);
  const [lastRunConfig, setLastRunConfig] = useState(null);
  const [defaultCfg, setDefaultCfg] = useState(null);
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
      setLastRun(null);
      setLastRunConfig(null);
      setDefaultCfg(null);
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
    // The run, its config snapshot and the current default config are read
    // before the case is shown, so a stale stored result never renders for
    // a moment as if it were current.
    const [{ data: runs }, { data: cfg }] = await Promise.all([
      listRuns(caseId),
      getCaseDefaultConfig(caseId),
    ]);
    const lastCompletedRun = (runs ?? []).find((r) => r.status === 'completed');
    let result = null;
    let runCfg = null;
    if (lastCompletedRun) {
      const [res, rc] = await Promise.all([
        getResultByRunId(lastCompletedRun.id),
        getRunConfig(lastCompletedRun.run_config_id),
      ]);
      result = res?.data ?? null;
      runCfg = rc?.data ?? null;
    }
    setDefaultCfg(cfg ?? null);
    setLastRun(lastCompletedRun ?? null);
    setLastRunConfig(runCfg);
    setLastResult(result);
    setCaseData(data);
    setCaseLoading(false);
  }, [caseId]);

  // Re-read the case default config after the PVT or the Aquifer tab saved
  // it. Cheap, and it does not swap the tab tree for the loader.
  const refreshRunInputs = useCallback(async () => {
    if (!caseId) return;
    const { data: cfg } = await getCaseDefaultConfig(caseId);
    setDefaultCfg(cfg ?? null);
  }, [caseId]);

  const runStaleness = useMemo(
    () => assessRunStaleness({
      caseData, defaultCfg, run: lastRun, runConfig: lastRunConfig, result: lastResult,
    }),
    [caseData, defaultCfg, lastRun, lastRunConfig, lastResult],
  );

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
  // MB5: the same config-inherit + invoke path also drives the history match
  // (mode 'history_match' with LM options); both run modes share executeRun.
  const executeRun = useCallback(async (runOptions = {}) => {
    const isHistoryMatch = runOptions.mode === 'history_match';
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

    // Inherit PVT, rock and aquifer settings from the case-default config
    // saved by the PVT and Aquifer tabs. buildRunConfigInput is the one list
    // of what a run inherits; the stale check reads the same list.
    const { data: defaultCfgNow } = await getCaseDefaultConfig(caseId);

    const { data: runConfig, error: configErr } = await createRunConfig(caseId, {
      name: `${isHistoryMatch ? 'History match' : 'Run'} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      is_scenario: true, // mark this row as an executed run, not a default
      ...buildRunConfigInput(caseData, defaultCfgNow),
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

    const { data: runResp, error: runErr } = await runMBAL(
      runConfig.id,
      isHistoryMatch
        ? { mode: 'history_match', historyMatch: runOptions.historyMatch }
        : {},
    );

    if (runErr) {
      // Engine-level errors (e.g. "Initial timestep must have zero cumulative
      // production") arrive via runErr.detail; generic platform errors arrive
      // only as runErr.message.
      const description = runErr.detail
        ? `${runErr.message}: ${runErr.detail}`
        : runErr.message;
      toast({
        title: isHistoryMatch ? 'History match failed' : 'Run failed',
        description,
        variant: 'destructive',
        duration: 12000,
      });
      setRunning(false);
      return;
    }

    const { data: result } = await getResultByRunId(runResp.run_id);
    // The run just made is the run of the current inputs: record what it
    // ran on so the stale check compares like with like.
    const { data: runsNow } = await listRuns(caseId);
    setDefaultCfg(defaultCfgNow ?? null);
    setLastRunConfig(runConfig);
    setLastRun((runsNow ?? []).find((r) => r.id === runResp.run_id)
      ?? { id: runResp.run_id, run_config_id: runConfig.id, status: 'completed', started_at: null });
    setLastResult(result);
    setRunning(false);
    setRunVersion((v) => v + 1);

    toast({
      title: isHistoryMatch ? 'History match completed' : 'MBAL completed',
      description: `Engine returned in ${runResp.duration_ms}ms.`,
    });

    if (result?.warnings?.length > 0) {
      result.warnings.forEach((w) =>
        toast({ title: 'Engine warning', description: w, duration: 7000 }),
      );
    }
  }, [caseData, caseId, toast]);

  const handleRun = useCallback(() => executeRun(), [executeRun]);

  // MB5: history match. historyMatch = { fit_parameters, initial_guesses,
  // bounds, max_iterations } as the edge function expects them.
  const handleHistoryMatch = useCallback(
    (historyMatch) => executeRun({ mode: 'history_match', historyMatch }),
    [executeRun],
  );

  const value = {
    // case list
    cases, casesLoading, casesError, refreshCases,
    // current case
    caseId, caseData, caseLoading, caseError, refreshCase,
    // run
    lastResult, running, runVersion, handleRun, handleHistoryMatch,
    // H4: is lastResult still the run of the current inputs?
    lastRun, lastRunConfig, defaultCfg, runStaleness, refreshRunInputs,
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
