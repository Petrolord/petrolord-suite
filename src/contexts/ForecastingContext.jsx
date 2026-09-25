// Production Forecasting ML Workbench state (Data & AI D4).
//
// Holds the loaded series table, the spec (text as typed) and the results of
// the last runs. Every fit, interval, backtest and field comparison is a job
// run by the vendored engine in a Web Worker (forecastJobs.js), so the page
// stays responsive. A result carries a stamp of the inputs it was made from,
// and the screen says when those inputs have changed since.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { forecastTableFromSnapshot } from '@/utils/dataAi/forecastData';
import { defaultSpec, parseSpec, seriesOf } from '@/utils/dataAi/forecastWorkflows';
import { runForecastAsync } from '@/utils/dataAi/forecastJobs';
import { createForecastWorker } from '@/utils/dataAi/forecastWorkerFactory';
import { serializeStudy, studyFromPayload, fingerprint } from '@/utils/dataAi/forecastStudy';
import { FORECAST_RUNS_MIGRATION, FORECAST_RUNS_TABLE, createForecastRunsService } from '@/utils/dataAi/forecastRunsService';
import { listFields, listProducers, loadSpineTable } from '@/utils/dataAi/forecastSources';

const Ctx = createContext(null);

export const useForecasting = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useForecasting must be used within a ForecastingProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, FORECAST_RUNS_TABLE, FORECAST_RUNS_MIGRATION);

/** Immutable set of one leaf by path. */
export const setIn = (obj, path, value) => {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = setIn(base[k], rest, value);
  return base;
};

/** The well choice follows a newly loaded table. */
export function specForTable(table, previous) {
  const s = previous ? { ...previous } : defaultSpec();
  const names = (table?.wells || []).map((w) => w.name);
  return { ...s, well: names.includes(s.well) ? s.well : (names[0] || '') };
}

/** The part of the inputs a job's result depends on, as a stamp. */
export function stampFor(job, table, spec) {
  const data = { t: table ? table.label : '', f: table ? fingerprint(table) : '' };
  const one = { w: spec.well, m: spec.methods, p: spec.params, h: spec.h, a: spec.arpsModel };
  const params = {
    fit: one,
    intervals: { w: spec.well, p: spec.params, h: spec.h, i: spec.intervals },
    // the typed parameters reach the backtest only when they are held there
    compare: {
      w: spec.well, m: spec.methods, a: spec.arpsModel, b: spec.backtest, p: spec.backtest.holdTyped ? spec.params : null,
    },
    // the field comparison estimates every parameter, so the hold toggle is not part of it
    field: { m: spec.methods, a: spec.arpsModel, b: { ...spec.backtest, holdTyped: undefined } },
  }[job];
  return JSON.stringify({ data, params });
}

export const ForecastingProvider = ({ children, createWorker = createForecastWorker }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [sourceKind, setSourceKind] = useState('upload');
  const [table, setTableState] = useState(null);
  const [dataRef, setDataRef] = useState(null);
  const [spec, setSpec] = useState(defaultSpec);
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [savedSummary, setSavedSummary] = useState(null);
  const [savedEngine, setSavedEngine] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(null);
  const cancelRef = useRef(null);

  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  // orgId is a deliberate dependency: a new service on switch makes the
  // saved-run list reload for the organization now selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const service = useMemo(() => createForecastRunsService(() => orgRef.current), [orgId]);

  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const series = useMemo(() => seriesOf(table, spec.well), [table, spec.well]);

  const isStale = useCallback((key) => !!results[key] && results[key].stamp !== stampFor(key, table, spec), [results, table, spec]);

  /** Run one engine job; the result is kept under its name. */
  const runJob = useCallback(async (job) => {
    if (!table) return null;
    if (job !== 'field' && !series) return null;
    cancelRef.current?.();
    setBusy({ job, done: 0, total: 0 });
    const stamp = stampFor(job, table, spec);
    const payload = job === 'field' ? { table, parsed } : { series, parsed };
    const { promise, cancel } = runForecastAsync(job, payload, {
      createWorker,
      onProgress: (p) => setBusy({
        job, phase: p.phase, done: p.done, total: p.total,
      }),
    });
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
  }, [table, series, parsed, spec, createWorker, addNotification]);

  const cancelJob = useCallback(() => { cancelRef.current?.(); setBusy(null); }, []);

  /** A new table: the spec keeps what still applies, old results go. */
  const setTable = useCallback((t, ref = null) => {
    setTableState(t);
    setDataRef(ref);
    setResults({});
    setSavedSummary(null);
    setSavedEngine(null);
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
    results: freshResults,
  }), [table, sourceKind, dataRef, spec, freshResults]);

  const [pendingOpen, setPendingOpen] = useState(null);

  const restore = useCallback((payload) => {
    const r = studyFromPayload(payload);
    if (!r) return false;
    setSpec(r.spec);
    setSavedSummary(r.summary);
    setSavedEngine(r.engine);
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
          t = forecastTableFromSnapshot(r.snapshot);
          if (!t) {
            throw new Error(r.snapshotOmitted
              ? 'This run used an upload too large to keep in the run. Upload the file again to re-run it; the spec is loaded.'
              : 'This run has no stored data. Upload the file again; the spec is loaded.');
          }
        } else if (r.source === 'spine' && r.dataRef?.fieldId && r.dataRef?.wellIds?.length) {
          const fields = await listFields();
          const field = fields.find((f) => f.id === r.dataRef.fieldId);
          if (!field) throw new Error('The field this run used is not in the production data you can see.');
          const all = await listProducers(field.id);
          const wells = r.dataRef.wellIds.map((id) => all.find((w) => w.id === id)).filter(Boolean);
          const gone = r.dataRef.wellIds.length - wells.length;
          if (!wells.length) throw new Error('None of the wells this run used is in the field you can see.');
          t = await loadSpineTable({
            field, wells, phase: r.dataRef.phase, step: r.dataRef.step, missing: r.dataRef.missing,
          });
          if (gone) t.notes.unshift(`${gone} of the run's wells ${gone === 1 ? 'is' : 'are'} no longer in the field you can see.`);
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
    noun: 'forecast run',
  });

  const dataChanged = useMemo(() => !!(savedSummary?.fingerprint && table && !reloading
    && fingerprint(table) !== savedSummary.fingerprint), [savedSummary, table, reloading]);

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
    parsed,
    series,
    results,
    runJob,
    cancelJob,
    busy,
    isStale,
    savedSummary,
    savedEngine,
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
