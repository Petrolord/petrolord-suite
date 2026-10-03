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
  upsertCaseDefaultConfig,
  updateCase,
  setCaseReadOnly,
  setCaseSharingStore,
  createCase,
  replaceProductionData,
} from '@/pages/apps/reservoir-balance/lib/api';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { useRecordSharing } from '@/lib/recordSharing/useRecordSharing';
import { copyCaseAsOwn } from '@/pages/apps/reservoir-balance/lib/copyCase';
import { assessRunStaleness, buildRunConfigInput } from '@/pages/apps/reservoir-balance/lib/runStaleness';
import {
  readStudy, withStudy, DEFAULT_CORRELATIONS,
} from '@/pages/apps/reservoir-balance/lib/studyMeta';
import { createMbalUnits, MBAL_UNIT_APP, MBAL_UNIT_SPEC, MBAL_OILFIELD_VIEW } from '@/pages/apps/reservoir-balance/lib/mbalUnits';
import { buildMbalSeries } from '@/pages/apps/reservoir-balance/lib/mbalSeries';
import { excludedOf, applyExclusion, cleanReasons } from '@/pages/apps/reservoir-balance/lib/exclusions';
import { buildPlotModels } from '@/pages/apps/reservoir-balance/lib/plotModels';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buildLabel } from '@/lib/platformBuild';

const MaterialBalanceStudioContext = createContext(null);

export const useMaterialBalanceStudio = () => {
  const ctx = useContext(MaterialBalanceStudioContext);
  if (!ctx) {
    throw new Error('useMaterialBalanceStudio must be used within MaterialBalanceStudioProvider');
  }
  return ctx;
};

// The organisation name for the report header. The studio also renders
// outside the auth provider (the /dev harness, unit tests), where there is none.
const useOrganizationName = () => {
  try {
    return useAuth()?.organization?.name || '';
  } catch {
    return '';
  }
};

// Record sharing (docs/scope/OrgSharing-DESIGN-AND-STATUS.md; rb_cases and
// its children since migration 20261002130000). MBAL-U1 adopted sharing for
// VIEWING: the owner shares a case with the organisation, colleagues see it
// under "Shared with me" and open it read-only, with its results, plots and
// report. MBAL-U2-001 adds EDITING (the owner's grant of 2026-10-01): the
// owner may let colleagues edit; one person at a time takes the case for
// editing (the check-out of rb_cases, which its four child tables follow in
// the database); a save of the case row names the version it was opened at;
// Run and every save are refused without the hold; the History panel lists
// who changed what.
export const RB_CASES_TABLE = 'rb_cases';

/**
 * @param {{caseId: ?string, onOpenCase: Function, sharingStore?: object, children: any}} props
 *   sharingStore: a record sharing store (the Supabase one by default; the
 *   /dev harness and the tests hand in their own)
 */
export const MaterialBalanceStudioProvider = ({ caseId, onOpenCase, sharingStore = undefined, children }) => {
  const store = useMemo(() => (sharingStore === undefined ? supabaseSharingStore() : sharingStore), [sharingStore]);
  const { toast } = useToast();
  const organizationName = useOrganizationName();

  // Display units (PL3): the Suite unit profile, with a view override for
  // this session. State, the engine and the database stay in oilfield units.
  const unitsHook = useAppUnits(MBAL_UNIT_APP, MBAL_UNIT_SPEC, { fallback: MBAL_OILFIELD_VIEW });
  const unitsKey = JSON.stringify(unitsHook.units);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const units = useMemo(() => createMbalUnits(unitsHook.units), [unitsKey]);

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
    // the version this editor now shows: a later save of the case row names it
    store?.trackOpened?.(RB_CASES_TABLE, data);
    setCaseData(data);
    setCaseLoading(false);
  }, [caseId, store]);

  // Re-read the case default config after the PVT or the Aquifer tab saved
  // it. Cheap, and it does not swap the tab tree for the loader.
  const refreshRunInputs = useCallback(async () => {
    if (!caseId) return;
    const { data: cfg } = await getCaseDefaultConfig(caseId);
    setDefaultCfg(cfg ?? null);
  }, [caseId]);

  // A case field changed by a tab (the aquifer flag): held in state at once,
  // without the reload that swaps the tab tree for the loader.
  const applyCasePatch = useCallback((patch) => {
    setCaseData((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Record sharing: the open case's sharing state, and whose case it is.
  const sharing = useRecordSharing({ store, table: RB_CASES_TABLE, record: caseData, onChange: applyCasePatch });
  const userId = sharing.userId;
  const viewingShared = !!caseData?.user_id && !!userId && caseData.user_id !== userId;
  // Read-only whenever the sharing rules say this user may not write now: a
  // colleague's case shared for viewing; a case shared for editing that this
  // user (the owner included) has not taken; one a colleague is editing.
  const canWriteCase = !caseData || sharing.canWrite;
  const readOnlyReason = !canWriteCase
    ? `${sharing.readOnlyReason || 'This case was shared with your organisation for viewing.'} Nothing you change here is saved to it.`
    : null;
  // the case row is saved through the sharing store (version check, refusals in words)
  useEffect(() => {
    setCaseSharingStore(sharing.available ? store : null);
    return () => setCaseSharingStore(null);
  }, [store, sharing.available]);
  // Taking the case for editing reloads it, so the editor starts from what
  // the previous editor left (data rows and run settings carry no version).
  const holdsCase = Boolean(sharing.access?.lock?.mine);
  const heldBefore = React.useRef(false);
  useEffect(() => {
    if (holdsCase && !heldBefore.current && caseId) refreshCase();
    heldBefore.current = holdsCase;
  }, [holdsCase, caseId, refreshCase]);
  // every write of lib/api.js to this case answers with the reason while it is read-only
  useEffect(() => {
    setCaseReadOnly(caseId, readOnlyReason);
    return () => setCaseReadOnly(null, null);
  }, [caseId, readOnlyReason]);
  const ownCases = useMemo(() => (userId ? cases.filter((c) => !c.user_id || c.user_id === userId) : cases), [cases, userId]);
  const sharedCases = useMemo(() => (userId ? cases.filter((c) => c.user_id && c.user_id !== userId) : []), [cases, userId]);

  // "Save a copy": the reader's own case with the same inputs. The run is not copied.
  const [copying, setCopying] = useState(false);
  const saveCopy = useCallback(async () => {
    if (!caseData || copying) return;
    setCopying(true);
    const { data: created, error } = await copyCaseAsOwn(
      { createCase, replaceProductionData, upsertCaseDefaultConfig, deleteCase },
      caseData, defaultCfg, ownCases.map((c) => c.name),
    );
    setCopying(false);
    if (error || !created) {
      toast({ title: 'Copy not made', description: error?.message ?? 'Unknown error.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Copy saved as your own case', description: `"${created.name}" holds the same conditions, production data and run settings. Run it to get its results.` });
    setCases((prev) => [created, ...prev]);
    onOpenCase?.(created.id);
  }, [caseData, copying, defaultCfg, ownCases, onOpenCase, toast]);

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

    // MBAL-U1-003: the engine's history match reads the aquifer from the
    // case flag (has_aquifer) and the regression reads it from the run
    // config. The Aquifer tab used to save the model and leave the flag, so
    // a history match simulated a closed tank beside an aquifer regression.
    // The run config's model is the one statement; the flag follows it.
    let caseNow = caseData;
    const modelNow = defaultCfgNow?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none');
    const flagNow = modelNow !== 'none';
    if (Boolean(caseData?.has_aquifer) !== flagNow) {
      await updateCase(caseId, { has_aquifer: flagNow });
      caseNow = { ...caseData, has_aquifer: flagNow };
      setCaseData(caseNow);
    }

    const { data: runConfig, error: configErr } = await createRunConfig(caseId, {
      name: `${isHistoryMatch ? 'History match' : 'Run'} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      is_scenario: true, // mark this row as an executed run, not a default
      ...buildRunConfigInput(caseNow, defaultCfgNow),
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

  // The study record: identification, pressure datum and input sources.
  // Report-only, kept with the case default config (lib/studyMeta.js).
  const study = useMemo(() => readStudy(defaultCfg), [defaultCfg]);
  const saveStudy = useCallback(async (nextStudy) => {
    if (!caseId) return { error: { message: 'No case open.' } };
    const { data: cfgNow } = await getCaseDefaultConfig(caseId);
    const base = cfgNow?.pvt_correlations ?? { ...DEFAULT_CORRELATIONS };
    const { data, error } = await upsertCaseDefaultConfig(caseId, { pvt_correlations: withStudy(base, nextStudy) });
    if (!error) setDefaultCfg(data ?? null);
    return { data, error };
  }, [caseId]);

  // MBAL-U2-003: the timesteps the next run leaves out of the fit, with the
  // reasons. The list is an engine input of the case default config (a
  // change makes the stored run stale); the reasons are a record of the study.
  const exclusions = useMemo(() => ({ excluded: excludedOf(defaultCfg), reasons: study.exclusions ?? {} }), [defaultCfg, study]);
  const setExclusion = useCallback(async (step, change) => {
    if (!caseId) return { error: { message: 'No case open.' } };
    const { data: cfgNow } = await getCaseDefaultConfig(caseId);
    const studyNow = readStudy(cfgNow);
    const steps = (caseData?.production_data ?? []).map((r) => r.timestep_index);
    const next = applyExclusion({ excluded: excludedOf(cfgNow), reasons: studyNow.exclusions, steps }, step, change);
    if (next.error) return { error: { message: next.error } };
    const base = cfgNow?.pvt_correlations ?? { ...DEFAULT_CORRELATIONS };
    const { data, error } = await upsertCaseDefaultConfig(caseId, {
      excluded_timesteps: next.excluded,
      pvt_correlations: withStudy(base, { ...studyNow, exclusions: cleanReasons(next.reasons, next.excluded) }),
    });
    if (!error) setDefaultCfg(data ?? null);
    return { data, error };
  }, [caseId, caseData]);

  // One set of series and plot models for the Plots tab and the report (RL12).
  const series = useMemo(
    () => (lastResult?.plot_data?.timestep_index?.length
      ? buildMbalSeries({ result: lastResult, runConfig: lastRunConfig, caseData })
      : null),
    [lastResult, lastRunConfig, caseData],
  );
  const plotModels = useMemo(
    () => (series ? buildPlotModels({ series, result: lastResult, units }) : []),
    [series, lastResult, units],
  );
  // What the report builder is handed (utils/mbalReportExport.js).
  const reportArgs = useMemo(() => ({
    caseData, result: lastResult, runConfig: lastRunConfig, run: lastRun, study,
    organizationName, build: buildLabel(), units, staleness: runStaleness,
  }), [caseData, lastResult, lastRunConfig, lastRun, study, organizationName, units, runStaleness]);

  const value = {
    // units, report
    units, unitsHook, organizationName, study, saveStudy, series, plotModels, reportArgs,
    // excluded timesteps (MBAL-U2-003)
    exclusions, setExclusion,
    // case list
    cases, ownCases, sharedCases, casesLoading, casesError, refreshCases,
    // record sharing
    sharing, sharingStore: store, viewingShared, readOnlyReason, canWriteCase, saveCopy, copying,
    // current case
    caseId, caseData, caseLoading, caseError, refreshCase, applyCasePatch,
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
