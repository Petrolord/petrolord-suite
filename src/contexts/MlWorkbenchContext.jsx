// ML Workbench state (Data & AI D2).
//
// Holds the loaded table, the spec (text as typed) and the results of the
// last runs. The design (X, y, groups) is built from the table and the spec
// here, on the page; every fit, split, score and prediction is a job run by
// the vendored engine in a Web Worker (mlJobs.js), so the page stays
// responsive. A result carries a stamp of the inputs it was made from, and
// the screen says when the inputs have changed since.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { buildDesign, tableFromSnapshot } from '@/utils/dataAi/mlData';
import { defaultSpec, parseSpec } from '@/utils/dataAi/mlWorkflows';
import { runMlAsync } from '@/utils/dataAi/mlJobs';
import { createMlWorker } from '@/utils/dataAi/mlWorkerFactory';
import { serializeStudy, studyFromPayload, fingerprint } from '@/utils/dataAi/mlStudy';
import { ML_RUNS_MIGRATION, ML_RUNS_TABLE, createMlRunsService } from '@/utils/dataAi/mlRunsService';
import { listWells, loadWellsTable } from '@/utils/dataAi/mlSources';

const Ctx = createContext(null);

export const useMlWorkbench = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMlWorkbench must be used within an MlWorkbenchProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, ML_RUNS_TABLE, ML_RUNS_MIGRATION);

/** Immutable set of one leaf by path. */
export const setIn = (obj, path, value) => {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = setIn(base[k], rest, value);
  return base;
};

/** Spec choices that no longer exist in a newly loaded table are dropped. */
export function specForTable(table, previous) {
  const s = previous ? { ...previous } : defaultSpec();
  const names = new Set(Object.keys(table?.columns || {}));
  const keep = (n) => (n && names.has(n) ? n : '');
  return {
    ...s,
    target: keep(s.target),
    features: (s.features || []).filter((f) => names.has(f.name)),
    label: { ...s.label, curve: keep(s.label?.curve), column: keep(s.label?.column) },
  };
}

export const MlWorkbenchProvider = ({ children, createWorker = createMlWorker }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [sourceKind, setSourceKind] = useState('wells');
  const [table, setTableState] = useState(null);
  const [dataRef, setDataRef] = useState(null);
  const [spec, setSpec] = useState(defaultSpec);
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [savedSummary, setSavedSummary] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(null);
  const cancelRef = useRef(null);

  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  // orgId is a deliberate dependency: a new service on switch makes the
  // saved-run list reload for the organization now selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const service = useMemo(() => createMlRunsService(() => orgRef.current), [orgId]);

  const task = spec.task === 'classification' ? 'classification' : 'regression';
  const design = useMemo(() => (table ? buildDesign(table, spec) : null), [table, spec]);
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const stampNow = useMemo(() => `${table ? table.label : ''}|${JSON.stringify(spec)}`, [table, spec]);

  const isStale = useCallback((key) => !!results[key] && results[key].stamp !== stampNow, [results, stampNow]);

  /** Run one engine job on the current design; the result is kept under key. */
  const runJob = useCallback(async (job, key = job) => {
    if (!design || design.error || parsed.error) return null;
    cancelRef.current?.();
    setBusy({ job, done: 0, total: 0 });
    const stamp = stampNow;
    const { promise, cancel } = runMlAsync(job, { design, parsed, task }, {
      createWorker,
      onProgress: (p) => setBusy({ job, done: p.done, total: p.total }),
    });
    cancelRef.current = cancel;
    try {
      const result = await promise;
      setResults((r) => ({ ...r, [key]: { stamp, result, task } }));
      if (key === 'evaluate') setSavedSummary(null);
      return result;
    } catch (e) {
      if (e.message !== 'cancelled') addNotification(`The ${job} run failed: ${e.message}`, 'error');
      return null;
    } finally {
      if (cancelRef.current === cancel) cancelRef.current = null;
      setBusy(null);
    }
  }, [design, parsed, task, stampNow, createWorker, addNotification]);

  const cancelJob = useCallback(() => { cancelRef.current?.(); setBusy(null); }, []);

  /** A new table: the spec keeps what still applies, old results go. */
  const setTable = useCallback((t, ref = null) => {
    setTableState(t);
    setDataRef(ref);
    setResults({});
    setSavedSummary(null);
    setReloadError(null);
    if (t) setSpec((prev) => specForTable(t, prev));
  }, []);

  const updateSpec = useCallback((path, value) => setSpec((s) => setIn(s, path, value)), []);

  // ---- persistence
  const evaluation = results.evaluate && !results.evaluate.result?.evaluation?.error ? results.evaluate : null;
  const serialize = useCallback((name) => serializeStudy({
    name,
    source: table?.source || sourceKind,
    dataRef,
    table,
    spec,
    task,
    design: design && !design.error ? design : null,
    parsed,
    evaluation: evaluation && !isStale('evaluate') ? evaluation.result.evaluation : null,
  }), [table, sourceKind, dataRef, spec, task, design, parsed, evaluation, isStale]);

  const [pendingOpen, setPendingOpen] = useState(null);

  const restore = useCallback((payload) => {
    const r = studyFromPayload(payload);
    if (!r) return false;
    setSpec(r.spec);
    setSavedSummary(r.summary);
    setResults({});
    setReloadError(null);
    if (r.source) setSourceKind(r.source);
    setPendingOpen(r);
    return true;
  }, []);

  // Re-read the saved run's data from where it lives; the user reruns.
  useEffect(() => {
    if (!pendingOpen) return undefined;
    let cancelled = false;
    const r = pendingOpen;
    const go = async () => {
      setReloading(true);
      try {
        let t = null;
        if (r.source === 'upload') {
          t = tableFromSnapshot(r.snapshot, r.dataRef || {});
          if (!t) {
            throw new Error(r.snapshotOmitted
              ? 'This run fitted an upload too large to keep in the run. Upload the file again to re-run it; the spec is loaded.'
              : 'This run has no stored data. Upload the file again; the spec is loaded.');
          }
        } else if (r.source === 'wells' && r.dataRef?.wellIds?.length) {
          const all = await listWells();
          const wells = r.dataRef.wellIds.map((id) => all.find((w) => w.id === id)).filter(Boolean);
          const gone = r.dataRef.wellIds.length - wells.length;
          if (!wells.length) throw new Error('None of the wells this run used is in the registry you can see.');
          t = await loadWellsTable(wells, r.dataRef.curves || []);
          if (gone) t.notes.unshift(`${gone} of the run's wells ${gone === 1 ? 'is' : 'are'} no longer in the registry you can see.`);
        } else {
          throw new Error('This run names no data source to re-read.');
        }
        if (cancelled) return;
        setTableState(t);
        setDataRef(r.dataRef);
        setSpec(specForTable(t, r.spec));
      } catch (e) {
        if (!cancelled) { setTableState(null); setReloadError(e.message || String(e)); }
      } finally {
        if (!cancelled) { setReloading(false); setPendingOpen(null); }
      }
    };
    go();
    return () => { cancelled = true; };
  }, [pendingOpen]);

  const persistence = useSavedProjects({
    service, serialize, restore, addNotification, describeError,
    watch: { spec, ref: dataRef, evaluated: results.evaluate?.stamp }, noun: 'ML run',
  });

  // the fingerprint walks every fitted row, so it is computed once per design
  const dataChanged = useMemo(() => !!(savedSummary?.fingerprint && design && !design.error && !reloading
    && fingerprint(design) !== savedSummary.fingerprint), [savedSummary, design, reloading]);

  const value = {
    orgId,
    sourceKind, setSourceKind,
    table, setTable, dataRef,
    spec, setSpec, updateSpec,
    task, design, parsed,
    results, runJob, cancelJob, busy, isStale,
    savedSummary, dataChanged, reloading, reloadError,
    persistence, notifications, addNotification, removeNotification,
    createWorker,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
