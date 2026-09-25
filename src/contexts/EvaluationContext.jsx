// AI Evaluation Studio state (Data & AI D5).
//
// Holds the loaded dataset (the Ekene synthetic documents by default), the
// spec (text as typed) and the results of the last runs. Every retrieval,
// metric, comparison, groundedness check, extraction score, kappa and
// calibration is a job run by the vendored engine in a Web Worker
// (evalJobs.js). A result carries a stamp of the inputs it was made from, and
// the screen says when those inputs have changed since. The optional
// language-model helper's answer is held apart from the results and is never
// saved.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { ekeneDataset, datasetFromSnapshot } from '@/utils/dataAi/evalData';
import { defaultSpec, parseSpec } from '@/utils/dataAi/evalWorkflows';
import { runEvalAsync } from '@/utils/dataAi/evalJobs';
import { createEvalWorker } from '@/utils/dataAi/evalWorkerFactory';
import {
  serializeStudy, studyFromPayload, fingerprint, stampFor,
} from '@/utils/dataAi/evalStudy';
import { EVAL_RUNS_MIGRATION, EVAL_RUNS_TABLE, createEvalRunsService } from '@/utils/dataAi/evalRunsService';

const Ctx = createContext(null);

export const useEvaluation = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEvaluation must be used within an EvaluationProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, EVAL_RUNS_TABLE, EVAL_RUNS_MIGRATION);

/** Immutable set of one leaf by path. */
export const setIn = (obj, path, value) => {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = setIn(base[k], rest, value);
  return base;
};

/** The spec's choices follow a newly loaded dataset (a query or a system that is gone is replaced). */
export function specForDataset(dataset, previous) {
  const s = previous ? JSON.parse(JSON.stringify(previous)) : defaultSpec();
  if (!dataset) return s;
  const qids = dataset.queries.map((q) => q.id);
  if (!qids.includes(s.retrieval.query)) s.retrieval.query = qids[0] || '';
  const sys = dataset.systems.map((x) => x.id);
  const src = ['retrieval', ...sys];
  if (!src.includes(s.metrics.source)) s.metrics.source = 'retrieval';
  if (!src.includes(s.compare.a)) s.compare.a = sys[0] || 'retrieval';
  if (!src.includes(s.compare.b)) s.compare.b = sys[1] || sys[0] || 'retrieval';
  if (!sys.includes(s.answers.system)) s.answers.system = sys[0] || '';
  const exSys = dataset.extraction ? Object.keys(dataset.extraction.predictions || {}) : [];
  if (!exSys.includes(s.extraction.system)) s.extraction.system = exSys[0] || '';
  return s;
}

const JOB_NEEDS = {
  retrieval: () => true,
  metrics: () => true,
  compare: () => true,
  answers: (d) => d.systems.length > 0,
  extraction: (d) => !!d.extraction,
  agreement: (d) => !!d.second,
  calibration: (d) => !!d.calibration,
};

export const EvaluationProvider = ({ children, createWorker = createEvalWorker }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [dataset, setDatasetState] = useState(() => ekeneDataset());
  const [spec, setSpec] = useState(() => specForDataset(ekeneDataset(), defaultSpec()));
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [savedSummary, setSavedSummary] = useState(null);
  const [savedEngine, setSavedEngine] = useState(null);
  const [reloadError, setReloadError] = useState(null);
  const cancelRef = useRef(null);

  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  // orgId is a deliberate dependency: a new service on switch makes the
  // saved-run list reload for the organization now selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const service = useMemo(() => createEvalRunsService(() => orgRef.current), [orgId]);

  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const datasetPrint = useMemo(() => (dataset ? fingerprint(dataset) : null), [dataset]);

  const isStale = useCallback((key) => !!results[key] && results[key].stamp !== stampFor(key, datasetPrint, spec), [results, datasetPrint, spec]);

  /** Run one engine job; the result is kept under its name. */
  const runJob = useCallback(async (job) => {
    if (!dataset || !JOB_NEEDS[job]?.(dataset)) return null;
    cancelRef.current?.();
    setBusy({ job });
    const stamp = stampFor(job, datasetPrint, spec);
    const { promise, cancel } = runEvalAsync(job, { dataset, parsed }, { createWorker });
    cancelRef.current = cancel;
    try {
      const result = await promise;
      setResults((r) => ({ ...r, [job]: { stamp, result } }));
      setSavedSummary(null);
      return result;
    } catch (e) {
      if (e.message !== 'cancelled') addNotification(`The ${job} run failed: ${e.message}`, 'error');
      return null;
    } finally {
      if (cancelRef.current === cancel) cancelRef.current = null;
      setBusy(null);
    }
  }, [dataset, datasetPrint, parsed, spec, createWorker, addNotification]);

  /** A helper step (context or check) through the same worker; nothing is kept in results. */
  const runHelperJob = useCallback(async (job, extra) => {
    if (!dataset) return null;
    const { promise } = runEvalAsync(job, { dataset, parsed, ...extra }, { createWorker });
    return promise;
  }, [dataset, parsed, createWorker]);

  const cancelJob = useCallback(() => { cancelRef.current?.(); setBusy(null); }, []);

  /** A new dataset: the spec keeps what still applies, old results go. */
  const setDataset = useCallback((d) => {
    setDatasetState(d);
    setResults({});
    setSavedSummary(null);
    setSavedEngine(null);
    setReloadError(null);
    if (d) setSpec((prev) => specForDataset(d, prev));
  }, []);

  const updateSpec = useCallback((path, value) => setSpec((s) => setIn(s, path, value)), []);

  // ---- persistence
  const freshResults = useMemo(() => {
    const out = {};
    Object.keys(results).forEach((k) => { if (!isStale(k)) out[k] = results[k]; });
    return out;
  }, [results, isStale]);

  const serialize = useCallback((name) => serializeStudy({
    name, dataset, datasetPrint, spec, results: freshResults,
  }), [dataset, datasetPrint, spec, freshResults]);

  const [pendingOpen, setPendingOpen] = useState(null);

  const restore = useCallback((payload) => {
    const r = studyFromPayload(payload);
    if (!r) return false;
    setSpec(r.spec);
    setSavedSummary(r.summary);
    setSavedEngine(r.engine);
    setResults({});
    setReloadError(null);
    setPendingOpen(r);
    return true;
  }, []);

  // Re-read the saved run's dataset; the user reruns.
  useEffect(() => {
    if (!pendingOpen) return;
    const r = pendingOpen;
    try {
      let d = null;
      if (r.source === 'ekene') d = ekeneDataset();
      else if (r.source === 'upload') {
        d = datasetFromSnapshot(r.snapshot);
        if (!d) {
          throw new Error(r.snapshotOmitted
            ? 'This run used an upload too large to keep in the run. Upload the files again to re-run it; the settings are loaded.'
            : 'This run has no stored data. Upload the files again; the settings are loaded.');
        }
      } else throw new Error('This run names no dataset to re-read.');
      setDatasetState(d);
      setSpec(specForDataset(d, r.spec));
    } catch (e) {
      setDatasetState(null);
      setReloadError(e.message || String(e));
    } finally {
      setPendingOpen(null);
    }
  }, [pendingOpen]);

  const persistence = useSavedProjects({
    service,
    serialize,
    restore,
    addNotification,
    describeError,
    watch: { spec, d: datasetPrint, ran: Object.keys(results).map((k) => results[k].stamp).join('|') },
    noun: 'evaluation run',
  });

  const dataChanged = useMemo(() => !!(savedSummary?.fingerprint && datasetPrint
    && datasetPrint !== savedSummary.fingerprint), [savedSummary, datasetPrint]);

  const value = {
    orgId,
    dataset,
    setDataset,
    datasetPrint,
    spec,
    setSpec,
    updateSpec,
    parsed,
    results,
    runJob,
    runHelperJob,
    cancelJob,
    busy,
    isStale,
    savedSummary,
    savedEngine,
    dataChanged,
    reloadError,
    persistence,
    notifications,
    addNotification,
    removeNotification,
    jobReady: (job) => !!dataset && !!JOB_NEEDS[job]?.(dataset),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
