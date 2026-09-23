// Data Quality Studio state (Data & AI D1).
//
// Holds the loaded dataset, the QC profile (text as typed) and the result of
// the last run. Every number in a result comes from runQcProfile, which calls
// the vendored engine; nothing derived is kept anywhere else. A run is made
// on request, so a large log is not re-checked on every keystroke, and the
// screen says when the parameters have changed since the last run.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { defaultProfile, runQcProfile } from '@/utils/dataAi/qcProfile';
import { suggestLimit, datasetFromSnapshot } from '@/utils/dataAi/qcDatasets';
import { serializeRun, runFromPayload, fingerprint } from '@/utils/dataAi/qcRun';
import {
  QC_RUNS_MIGRATION, QC_RUNS_TABLE, createQcRunsService,
} from '@/utils/dataAi/qcRunsService';
import {
  listWells, listLogs, listPoWells, loadWellDataset, loadProductionDataset,
} from '@/utils/dataAi/qcSources';

const Ctx = createContext(null);

export const useDataQualityStudio = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDataQualityStudio must be used within a DataQualityStudioProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, QC_RUNS_TABLE, QC_RUNS_MIGRATION);

/** Immutable set of one leaf by path. */
export const setIn = (obj, path, value) => {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = setIn(base[k], rest, value);
  return base;
};

/** Suggestions a freshly loaded dataset brings to the profile; each is editable. */
export function profileForDataset(ds, previous) {
  const p = previous ? { ...previous } : defaultProfile();
  const limits = {};
  ds.channels.forEach((c) => { limits[c.key] = previous?.limits?.[c.key] || suggestLimit(c); });
  const keys = new Set(ds.channels.map((c) => c.key));
  const keep = (k) => (k && keys.has(k) ? k : '');
  const byName = (n) => ds.channels.find((c) => c.name === n)?.key || '';
  const rateKeys = ds.channels.filter((c) => limits[c.key]?.channel === 'rate').map((c) => c.key);
  const next = {
    ...p,
    channels: (p.channels || []).filter((k) => keys.has(k)),
    limits,
  };
  if (!previous) {
    next.validity = {
      ...next.validity,
      rate: { enabled: rateKeys.length > 0, rateKeys, hoursOnKey: byName('hours_on') },
    };
    const oil = byName('oil_stb');
    const water = byName('water_stb');
    if (oil && water) next.consistency = { ...next.consistency, waterCut: { ...next.consistency.waterCut, oilKey: oil, waterKey: water } };
  } else {
    next.charts = { ...next.charts, key: keep(next.charts.key) };
    next.mahalanobis = { ...next.mahalanobis, keys: (next.mahalanobis.keys || []).filter((k) => keys.has(k)) };
  }
  return next;
}

export const DataQualityStudioProvider = ({ children }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [sourceKind, setSourceKind] = useState('wells');
  const [dataset, setDatasetState] = useState(null);
  const [profile, setProfile] = useState(defaultProfile);
  const [run, setRun] = useState(null);
  const [runStamp, setRunStamp] = useState(null);
  const [savedSummary, setSavedSummary] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(null);

  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  // orgId is a deliberate dependency: a new service on switch makes the
  // saved-run list reload for the organization now selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const service = useMemo(() => createQcRunsService(() => orgRef.current), [orgId]);

  const inputsKey = useMemo(() => JSON.stringify(profile), [profile]);
  const stale = !!run && runStamp !== `${inputsKey}|${dataset ? dataset.label : ''}`;

  const runNow = useCallback((ds = dataset, p = profile) => {
    if (!ds) return null;
    const r = runQcProfile(ds, p);
    setRun(r);
    setRunStamp(`${JSON.stringify(p)}|${ds.label}`);
    setSavedSummary(null);
    return r;
  }, [dataset, profile]);

  /** A new dataset: suggestions applied, the old result cleared. */
  const setDataset = useCallback((ds, { keepProfile = false } = {}) => {
    setDatasetState(ds);
    setRun(null);
    setRunStamp(null);
    setSavedSummary(null);
    setReloadError(null);
    if (ds) setProfile((prev) => profileForDataset(ds, keepProfile ? prev : null));
  }, []);

  const updateProfile = useCallback((path, value) => setProfile((p) => setIn(p, path, value)), []);

  // ---- persistence
  const serialize = useCallback((name) => serializeRun({
    name,
    source: dataset?.source || sourceKind,
    datasetRef: dataset?.ref || null,
    dataset,
    profile,
    run: stale ? null : run,
  }), [dataset, sourceKind, profile, run, stale]);

  const [pendingOpen, setPendingOpen] = useState(null);

  const restore = useCallback((payload) => {
    const r = runFromPayload(payload);
    if (!r) return false;
    setProfile(r.profile);
    setSavedSummary(r.summary);
    setRun(null);
    setRunStamp(null);
    setReloadError(null);
    if (r.source) setSourceKind(r.source);
    setPendingOpen(r);
    return true;
  }, []);

  // Re-read the saved run's data from where it lives, then run it.
  useEffect(() => {
    if (!pendingOpen) return undefined;
    let cancelled = false;
    const r = pendingOpen;
    const go = async () => {
      setReloading(true);
      try {
        let ds = null;
        if (r.source === 'upload') {
          ds = datasetFromSnapshot(r.snapshot, r.datasetRef || {});
          if (!ds) throw new Error(r.snapshotOmitted
            ? 'This run checked an upload too large to keep in the run. Upload the file again to re-run it; the profile is loaded.'
            : 'This run has no stored data to re-check. Upload the file again; the profile is loaded.');
        } else if (r.source === 'wells' && r.datasetRef?.wellId) {
          const [wells, logs] = await Promise.all([listWells(), listLogs(r.datasetRef.wellId)]);
          const well = wells.find((w) => w.id === r.datasetRef.wellId);
          if (!well) throw new Error(`Well ${r.datasetRef.wellName || ''} is no longer in the registry you can see.`);
          const chosen = (r.datasetRef.logIds || []).filter((id) => logs.some((l) => l.id === id));
          if (!chosen.length) throw new Error(`The curves this run checked are no longer stored for ${well.name}.`);
          ds = await loadWellDataset({ well, logs, chosenIds: chosen, wells });
        } else if (r.source === 'production' && r.datasetRef?.fieldId) {
          const fieldWells = await listPoWells(r.datasetRef.fieldId);
          const well = fieldWells.find((w) => w.id === r.datasetRef.wellId) || { id: r.datasetRef.wellId, name: r.datasetRef.wellName };
          ds = await loadProductionDataset({ field: { id: r.datasetRef.fieldId, name: r.datasetRef.fieldName }, well, fieldWells });
        } else {
          throw new Error('This run names no data source to re-read.');
        }
        if (cancelled) return;
        setDatasetState(ds);
        const p = profileForDataset(ds, r.profile);
        setProfile(p);
        const res = runQcProfile(ds, p);
        setRun(res);
        setRunStamp(`${JSON.stringify(p)}|${ds.label}`);
      } catch (e) {
        if (!cancelled) { setDatasetState(null); setReloadError(e.message || String(e)); }
      } finally {
        if (!cancelled) { setReloading(false); setPendingOpen(null); }
      }
    };
    go();
    return () => { cancelled = true; };
  }, [pendingOpen]);

  const persistence = useSavedProjects({
    service, serialize, restore, addNotification, describeError,
    watch: { inputsKey, run, ref: dataset?.ref }, noun: 'QC run',
  });

  const dataChanged = !!(savedSummary?.fingerprint && dataset && !reloading
    && fingerprint(dataset) !== savedSummary.fingerprint);

  const value = {
    orgId,
    sourceKind, setSourceKind,
    dataset, setDataset,
    profile, setProfile, updateProfile,
    run, runNow, stale,
    savedSummary, dataChanged, reloading, reloadError,
    persistence, notifications, addNotification, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
