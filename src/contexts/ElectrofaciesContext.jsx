// Electrofacies Studio state (Data & AI D3).
//
// Holds the loaded table, the spec (text as typed) and the results of the
// last runs. The design (X, core facies) is built from the table and the
// spec here, on the page; every PCA, clustering, classification and score
// is a job run by the vendored engine in a Web Worker (faciesJobs.js), so
// the page stays responsive. A result carries a stamp of the inputs it was
// made from, and the screen says when those inputs have changed since.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { buildFaciesDesign, faciesTableFromSnapshot } from '@/utils/dataAi/faciesData';
import { defaultSpec, parseSpec } from '@/utils/dataAi/faciesWorkflows';
import { runFaciesAsync } from '@/utils/dataAi/faciesJobs';
import { createFaciesWorker } from '@/utils/dataAi/faciesWorkerFactory';
import { serializeStudy, studyFromPayload, fingerprint } from '@/utils/dataAi/faciesStudy';
import { FACIES_RUNS_MIGRATION, FACIES_RUNS_TABLE, createFaciesRunsService } from '@/utils/dataAi/faciesRunsService';
import { listWells, loadFaciesWellsTable } from '@/utils/dataAi/faciesSources';

const Ctx = createContext(null);

export const useElectrofacies = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useElectrofacies must be used within an ElectrofaciesProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, FACIES_RUNS_TABLE, FACIES_RUNS_MIGRATION);

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
  const facies = { ...defaultSpec().facies, ...(s.facies || {}) };
  if (facies.source === 'curve' && !names.has(facies.curve)) facies.curve = '';
  if (facies.source === 'column' && !table?.facies) facies.source = 'none';
  if (facies.source === 'intervals' && !table?.intervals) facies.source = 'none';
  if (table?.facies && facies.source === 'none') facies.source = 'column';
  const wells = new Set((table?.wells || []).map((w) => w.name));
  return {
    ...s,
    features: (s.features || []).filter((f) => names.has(f.name)),
    facies,
    supervised: { ...s.supervised, chosen: (s.supervised?.chosen || []).filter((w) => wells.has(w)) },
  };
}

/** The part of the spec a job's result depends on, as a stamp. */
export function stampFor(job, table, spec) {
  const data = {
    t: table ? table.label : '', f: spec.features, a: spec.depthMin, b: spec.depthMax, e: spec.every, c: spec.facies, s: spec.scale,
  };
  const params = {
    pca: { matrix: spec.pca.matrix },
    kmeans: spec.kmeans,
    elbow: { elbow: spec.elbow, seed: spec.kmeans.seed, nInit: spec.kmeans.nInit },
    agglomerative: spec.agglomerative,
    knn: spec.supervised,
    cart: spec.supervised,
  }[job];
  return JSON.stringify({ data, params });
}

export const ElectrofaciesProvider = ({ children, createWorker = createFaciesWorker }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [sourceKind, setSourceKind] = useState('wells');
  const [table, setTableState] = useState(null);
  const [dataRef, setDataRef] = useState(null);
  const [spec, setSpec] = useState(defaultSpec);
  const [results, setResults] = useState({});
  const [active, setActive] = useState('');
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
  const service = useMemo(() => createFaciesRunsService(() => orgRef.current), [orgId]);

  const design = useMemo(() => (table ? buildFaciesDesign(table, spec) : null), [table, spec]);
  const parsed = useMemo(() => parseSpec(spec), [spec]);

  const isStale = useCallback((key) => !!results[key] && results[key].stamp !== stampFor(key, table, spec), [results, table, spec]);

  /** Run one engine job on the current design; the result is kept under its name. */
  const runJob = useCallback(async (job) => {
    if (!design || design.error) return null;
    cancelRef.current?.();
    setBusy({ job, done: 0, total: 0 });
    const stamp = stampFor(job, table, spec);
    const { promise, cancel } = runFaciesAsync(job, { design, parsed }, {
      createWorker,
      onProgress: (p) => setBusy({
        job, phase: p.phase, done: p.done, total: p.total,
      }),
    });
    cancelRef.current = cancel;
    try {
      const result = await promise;
      setResults((r) => ({ ...r, [job]: { stamp, result } }));
      if (Array.isArray(result?.labels)) setActive(job);
      setSavedSummary(null);
      return result;
    } catch (e) {
      if (e.message !== 'cancelled') addNotification(`The ${job} run failed: ${e.message}`, 'error');
      return null;
    } finally {
      if (cancelRef.current === cancel) cancelRef.current = null;
      setBusy(null);
    }
  }, [design, parsed, table, spec, createWorker, addNotification]);

  const cancelJob = useCallback(() => { cancelRef.current?.(); setBusy(null); }, []);

  /** A new table: the spec keeps what still applies, old results go. */
  const setTable = useCallback((t, ref = null) => {
    setTableState(t);
    setDataRef(ref);
    setResults({});
    setActive('');
    setSavedSummary(null);
    setReloadError(null);
    if (t) setSpec((prev) => specForTable(t, prev));
  }, []);

  const updateSpec = useCallback((path, value) => setSpec((s) => setIn(s, path, value)), []);

  // ---- persistence
  const freshResults = useMemo(() => {
    const out = {};
    Object.keys(results).forEach((k) => { if (!isStale(k)) out[k] = results[k]; });
    return out;
  }, [results, isStale]);

  const serialize = useCallback((name) => serializeStudy({
    name,
    source: table?.source || sourceKind,
    dataRef,
    table,
    spec,
    design: design && !design.error ? design : null,
    parsed,
    results: freshResults,
  }), [table, sourceKind, dataRef, spec, design, parsed, freshResults]);

  const [pendingOpen, setPendingOpen] = useState(null);

  const restore = useCallback((payload) => {
    const r = studyFromPayload(payload);
    if (!r) return false;
    setSpec(r.spec);
    setSavedSummary(r.summary);
    setResults({});
    setActive('');
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
          t = faciesTableFromSnapshot(r.snapshot, r.dataRef || {});
          if (!t) {
            throw new Error(r.snapshotOmitted
              ? 'This run used an upload too large to keep in the run. Upload the file again to re-run it; the spec is loaded.'
              : 'This run has no stored data. Upload the file again; the spec is loaded.');
          }
        } else if (r.source === 'wells' && r.dataRef?.wellIds?.length) {
          const all = await listWells();
          const wells = r.dataRef.wellIds.map((id) => all.find((w) => w.id === id)).filter(Boolean);
          const gone = r.dataRef.wellIds.length - wells.length;
          if (!wells.length) throw new Error('None of the wells this run used is in the registry you can see.');
          t = await loadFaciesWellsTable(wells, r.dataRef.curves || []);
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
    service,
    serialize,
    restore,
    addNotification,
    describeError,
    watch: { spec, ref: dataRef, ran: Object.keys(results).map((k) => results[k].stamp).join('|') },
    noun: 'facies run',
  });

  // the fingerprint walks every clustered row, so it is computed once per design
  const dataChanged = useMemo(() => !!(savedSummary?.fingerprint && design && !design.error && !reloading
    && fingerprint(design) !== savedSummary.fingerprint), [savedSummary, design, reloading]);

  const value = {
    orgId,
    sourceKind,
    setSourceKind,
    table,
    setTable,
    dataRef,
    spec,
    setSpec,
    updateSpec,
    design,
    parsed,
    results,
    runJob,
    cancelJob,
    busy,
    isStale,
    active,
    setActive,
    savedSummary,
    dataChanged,
    reloading,
    reloadError,
    persistence,
    notifications,
    addNotification,
    removeNotification,
    createWorker,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
