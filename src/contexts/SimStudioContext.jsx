// Reservoir Simulation Studio state (S2). Cases are the "projects" of the
// Studio shell; runs poll every 5 s while one is queued/running (the
// DataExport pattern — no Realtime precedent in the codebase). Results are
// fetched on demand from the run's result_path.
//
// SIM-U1: the Model Builder form lives here (it used to be component state,
// lost on a tab switch or a reload) and is saved with the case; the case is
// under the record-sharing rules (view, or edit while holding the
// check-out); the display unit system follows the Suite unit profile for a
// new case and the saved form for an old one.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import * as sim from '@/lib/simService';
import { useRecordSharing } from '@/lib/recordSharing/useRecordSharing';
import { defaultBuilderForm, migrateBuilderForm } from '@/utils/simDeckBuilder';
import { simUnits } from '@/utils/simstudio/simUnits';
import { planDeckUpload } from '@/utils/simstudio/deckUpload';

const POLL_MS = 5000;

const SimStudioContext = createContext();

export const useSimStudio = () => {
  const context = useContext(SimStudioContext);
  if (!context) throw new Error('useSimStudio must be used within a SimStudioProvider');
  return context;
};

const AUTOSAVE_MS = 1500;

/**
 * @param {{children: any, sharingStore?: ?object, profileSystem?: ?('oilfield'|'si'), organizationName?: ?string}} props
 */
export const SimStudioProvider = ({ children, sharingStore = null, profileSystem = null, organizationName = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [cases, setCases] = useState([]);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [runs, setRuns] = useState([]);
  const [deckText, setDeckText] = useState(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [summary, setSummary] = useState(null);        // parsed summary.json
  const [summaryRunId, setSummaryRunId] = useState(null);
  const [prtText, setPrtText] = useState(null);
  const [prtRunId, setPrtRunId] = useState(null);
  const [busy, setBusy] = useState(false);
  // SIM-U2-005: the runs picked for comparison (the first is the base) and their summaries
  const [compareIds, setCompareIds] = useState([]);
  const [compareSummaries, setCompareSummaries] = useState({});

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) || null,
    [cases, activeCaseId],
  );

  // --- record sharing (sim_cases, migration 20261002130000) ---
  const patchCase = useCallback((patch) => {
    setCases((prev) => prev.map((c) => (c.id === activeCaseId ? { ...c, ...patch } : c)));
  }, [activeCaseId]);
  const sharing = useRecordSharing({ store: sharingStore, table: 'sim_cases', record: activeCase, onChange: patchCase });
  const myId = sharing.userId;
  const isOwner = !activeCase || !myId || !activeCase.user_id || activeCase.user_id === myId;
  // an own case is writable until the rules say otherwise; a colleague's case
  // stays read-only until the rules say this user holds its check-out
  const canWrite = !activeCase || (isOwner ? (!sharing.ready || sharing.canWrite) : (sharing.ready && sharing.canWrite));
  // the deck files and the run queue sit in the owner's storage folder and
  // behind the owner-only enqueue function: a colleague never writes them
  const ownerOnlyReason = isOwner ? null
    : 'Decks and runs stay with the case owner: the deck files sit in the owner\'s storage folder and the run queue accepts the owner\'s runs only. You can read every run and report of this case.';
  const readOnlyReason = canWrite ? null
    : `${sharing.readOnlyReason || 'This case belongs to a colleague and is shared for viewing.'} Nothing you change here is saved to it.`;

  // --- the Model Builder form, saved with the case (SIM-U1-005) ---
  const [form, setFormState] = useState(defaultBuilderForm);
  const [formSave, setFormSave] = useState({ state: 'idle', where: null, error: null });
  const formDirty = useRef(false);
  const formCaseRef = useRef(null);
  const system = form.unitSystem === 'si' ? 'si' : 'oilfield';
  const u = useMemo(() => simUnits(system), [system]);

  const initializedRef = useRef(false);
  const refreshCases = useCallback(async () => {
    try {
      const rows = await sim.listCases();
      setCases(rows);
      // First load: open the most recent case so returning users land in
      // their work (cases are read-open, nothing autosaves on open).
      if (!initializedRef.current) {
        initializedRef.current = true;
        if (rows.length) setActiveCaseId((cur) => cur || rows[0].id);
      }
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [addNotification]);

  useEffect(() => { refreshCases(); }, [refreshCases]);

  const refreshRuns = useCallback(async (caseId) => {
    if (!caseId) { setRuns([]); return []; }
    try {
      const rows = await sim.listRuns(caseId);
      setRuns(rows);
      return rows;
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
      return [];
    }
  }, [addNotification]);

  // Load the builder form when the active case changes: the saved one, or a
  // new form in the profile's unit system.
  useEffect(() => {
    let alive = true;
    formDirty.current = false;
    formCaseRef.current = activeCaseId;
    setFormSave({ state: 'idle', where: null, error: null });
    const fresh = () => ({ ...defaultBuilderForm(), unitSystem: profileSystem === 'si' ? 'si' : 'oilfield' });
    if (!activeCase) { setFormState(fresh()); return undefined; }
    sim.loadBuilderForm(activeCase).then(({ form: saved, where }) => {
      if (!alive || formCaseRef.current !== activeCaseId) return;
      setFormState(saved ? migrateBuilderForm(saved) : fresh());
      setFormSave({ state: saved ? 'saved' : 'idle', where, error: null });
    });
    return () => { alive = false; };
    // keyed on the case id: a refreshed case row does not reload the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const saveForm = useCallback(async (next) => {
    if (!activeCase) return false;
    if (!canWrite) {
      setFormSave({ state: 'error', where: null, error: readOnlyReason });
      return false;
    }
    setFormSave((p) => ({ ...p, state: 'saving' }));
    const update = sharingStore && sharing.available ? (table, id, patch) => sharingStore.update(table, id, patch) : null;
    const res = await sim.saveBuilderForm(activeCase, next, { update });
    if (!res.ok) {
      setFormSave({ state: 'error', where: null, error: res.error });
      return false;
    }
    formDirty.current = false;
    if (res.row) setCases((prev) => prev.map((c) => (c.id === res.row.id ? { ...c, ...res.row } : c)));
    setFormSave({ state: 'saved', where: res.where, error: null });
    return true;
  }, [activeCase, canWrite, readOnlyReason, sharingStore, sharing.available]);

  /** Change the form (functional update); autosaved after a pause. */
  const setForm = useCallback((updater) => {
    setFormState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    formDirty.current = true;
  }, []);
  const autosaveRef = useRef(null);
  useEffect(() => {
    if (!formDirty.current || !activeCase || !canWrite) return undefined;
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => { saveForm(form); }, AUTOSAVE_MS);
    return () => clearTimeout(autosaveRef.current);
  }, [form, activeCase, canWrite, saveForm]);

  // Load runs + deck text when the active case changes.
  useEffect(() => {
    setSummary(null); setSummaryRunId(null); setPrtText(null); setPrtRunId(null);
    setCompareIds([]); setCompareSummaries({});
    setDeckText(null);
    if (!activeCaseId) { setRuns([]); return; }
    refreshRuns(activeCaseId);
    const row = cases.find((c) => c.id === activeCaseId);
    if (row?.deck_path) {
      setDeckLoading(true);
      sim.downloadText(row.deck_path)
        .then(setDeckText)
        .catch((e) => { console.error(e); setDeckText(null); })
        .finally(() => setDeckLoading(false));
    }
    // cases identity changes on refresh; keyed on id + deck_path only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId, activeCase?.deck_path]);

  // 5 s polling while any run of the active case is in flight.
  const hasInFlight = runs.some((r) => r.status === 'queued' || r.status === 'running');
  const pollRef = useRef(null);
  useEffect(() => {
    if (!hasInFlight || !activeCaseId) return undefined;
    pollRef.current = setInterval(async () => {
      const rows = await refreshRuns(activeCaseId);
      const still = rows.some((r) => r.status === 'queued' || r.status === 'running');
      if (!still) {
        const latest = rows[0];
        if (latest?.status === 'complete') addNotification('Simulation run complete', 'success');
        else if (latest?.status === 'failed') addNotification('Simulation run failed. See the run log on the Runs tab.', 'error');
      }
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [hasInFlight, activeCaseId, refreshRuns, addNotification]);

  // --- case actions (drive the StudioProjectManager) ---
  const createCase = useCallback(async (name) => {
    try {
      const row = await sim.createCase(name);
      setCases((prev) => [row, ...prev]);
      setActiveCaseId(row.id);
      addNotification(`Case "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [addNotification]);

  const openCase = useCallback((id) => setActiveCaseId(id), []);

  const deleteCase = useCallback(async (id) => {
    try {
      await sim.deleteCase(id);
      setCases((prev) => prev.filter((c) => c.id !== id));
      if (id === activeCaseId) setActiveCaseId(null);
      addNotification('Case deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [activeCaseId, addNotification]);

  // --- deck actions ---
  const uploadDeck = useCallback(async (files) => {
    if (!activeCase) return null;
    if (ownerOnlyReason) { addNotification(ownerOnlyReason, 'error'); return null; }
    // SIM-U1-012: read the picked files first and say what they are
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, text: await f.text() })));
    const plan = planDeckUpload(read, { currentMain: activeCase.deck_path, existingBytes: 0 });
    if (!plan.ok) {
      plan.errors.forEach((e) => addNotification(e, 'error'));
      return plan;
    }
    setBusy(true);
    try {
      let mainPath = activeCase.deck_path;
      let total = 0;
      for (const file of files) {
        const path = await sim.uploadDeckFile(activeCase, file, file.name);
        total += file.size;
        if (file.name.toUpperCase().endsWith('.DATA')) mainPath = path;
      }
      const updated = await sim.updateCase(activeCase.id, {
        deck_source: 'upload',
        template_slug: null,
        deck_path: mainPath,
        deck_bytes: (activeCase.deck_bytes || 0) + total,
      });
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      addNotification(`${files.length} deck file(s) uploaded. ${plan.readBack.join(' ')}`, 'success');
      plan.warnings.forEach((w) => addNotification(w, 'info'));
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
    return plan;
  }, [activeCase, addNotification, ownerOnlyReason]);

  const applyTemplate = useCallback(async (template) => {
    if (!activeCase) return;
    if (ownerOnlyReason) { addNotification(ownerOnlyReason, 'error'); return; }
    setBusy(true);
    try {
      const updated = await sim.installTemplate(activeCase, template);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      addNotification(`Template ${template.slug} installed`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [activeCase, addNotification, ownerOnlyReason]);

  const uploadGeneratedDeck = useCallback(async (deckText, filename = 'MODEL.DATA') => {
    if (!activeCase) return false;
    if (ownerOnlyReason) { addNotification(ownerOnlyReason, 'error'); return false; }
    setBusy(true);
    try {
      const blob = new Blob([deckText], { type: 'text/plain' });
      const path = await sim.uploadDeckFile(activeCase, blob, filename);
      const updated = await sim.updateCase(activeCase.id, {
        deck_source: 'generated',
        template_slug: null,
        deck_path: path,
        deck_bytes: deckText.length,
      });
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      // the form records the deck it made, so a report can tell whether the
      // run's deck (hashed by the worker) is this one
      const sha = await sim.sha256Hex(deckText);
      const next = { ...form, lastGenerated: { at: new Date().toISOString(), deckSha256: sha, fileName: filename } };
      setFormState(next);
      await saveForm(next);
      addNotification('Deck generated and attached to the case', 'success');
      return true;
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [activeCase, addNotification, ownerOnlyReason, form, saveForm]);

  // --- run actions ---
  const queueRun = useCallback(async () => {
    if (!activeCase) return;
    if (ownerOnlyReason) { addNotification(ownerOnlyReason, 'error'); return; }
    try {
      await sim.enqueueRun(activeCase.id);
      addNotification('Run queued. The worker picks it up within about 10 seconds.', 'success');
      refreshRuns(activeCase.id);
    } catch (e) {
      console.error(e);
      // Quota / validation messages from the RPC are user-facing by design.
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [activeCase, refreshRuns, addNotification, ownerOnlyReason]);

  const requestCancel = useCallback(async (runId) => {
    try {
      const outcome = await sim.cancelRun(runId);
      addNotification(outcome === 'cancelled' ? 'Run cancelled'
        : outcome === 'cancel_requested' ? 'Cancel requested. Stopping the simulator.'
          : `Run already ${outcome}`, 'info');
      refreshRuns(activeCaseId);
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [activeCaseId, refreshRuns, addNotification]);

  // --- results ---
  const loadResults = useCallback(async (run) => {
    try {
      setSummary(await sim.fetchSummary(run));
      setSummaryRunId(run.id);
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [addNotification]);

  const loadPrt = useCallback(async (run) => {
    try {
      setPrtText(await sim.fetchPrtExcerpt(run));
      setPrtRunId(run.id);
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [addNotification]);

  /** Pick or drop a run for the comparison; its summary is read once. */
  const toggleCompare = useCallback(async (run) => {
    if (!run?.id) return;
    const on = compareIds.includes(run.id);
    setCompareIds((ids) => (on ? ids.filter((x) => x !== run.id) : [...ids, run.id]));
    if (on || compareSummaries[run.id]) return;
    try {
      const doc = await sim.fetchSummary(run);
      setCompareSummaries((m) => ({ ...m, [run.id]: doc }));
    } catch (e) {
      console.error(e);
      setCompareIds((ids) => ids.filter((x) => x !== run.id));
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [compareIds, compareSummaries, addNotification]);
  const compareEntries = useMemo(() => compareIds
    .map((id) => ({ run: runs.find((r) => r.id === id), summary: compareSummaries[id] }))
    .filter((e) => e.run && e.summary), [compareIds, compareSummaries, runs]);

  const value = {
    compareIds, compareEntries, toggleCompare,
    form, setForm, saveForm, formSave, system, u, organizationName,
    sharing, sharingStore, canWrite, isOwner, ownerOnlyReason, readOnlyReason,
    cases, activeCase, activeCaseId, runs, hasInFlight,
    deckText, deckLoading, busy,
    summary, summaryRunId, prtText, prtRunId,
    createCase, openCase, deleteCase,
    uploadDeck, applyTemplate, uploadGeneratedDeck,
    queueRun, requestCancel, refreshRuns,
    loadResults, loadPrt,
    notifications, addNotification, removeNotification,
  };

  return <SimStudioContext.Provider value={value}>{children}</SimStudioContext.Provider>;
};
