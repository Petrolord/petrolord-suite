// Reservoir Simulation Studio state (S2). Cases are the "projects" of the
// Studio shell; runs poll every 5 s while one is queued/running (the
// DataExport pattern — no Realtime precedent in the codebase). Results are
// fetched on demand from the run's result_path.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import * as sim from '@/lib/simService';

const POLL_MS = 5000;

const SimStudioContext = createContext();

export const useSimStudio = () => {
  const context = useContext(SimStudioContext);
  if (!context) throw new Error('useSimStudio must be used within a SimStudioProvider');
  return context;
};

export const SimStudioProvider = ({ children }) => {
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

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) || null,
    [cases, activeCaseId],
  );

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

  // Load runs + deck text when the active case changes.
  useEffect(() => {
    setSummary(null); setSummaryRunId(null); setPrtText(null); setPrtRunId(null);
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
        else if (latest?.status === 'failed') addNotification('Simulation run failed — see the run log', 'error');
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
    if (!activeCase) return;
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
      addNotification(`${files.length} deck file(s) uploaded`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [activeCase, addNotification]);

  const applyTemplate = useCallback(async (template) => {
    if (!activeCase) return;
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
  }, [activeCase, addNotification]);

  const uploadGeneratedDeck = useCallback(async (deckText, filename = 'MODEL.DATA') => {
    if (!activeCase) return false;
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
      addNotification('Deck generated and attached to the case', 'success');
      return true;
    } catch (e) {
      console.error(e);
      addNotification(sim.friendlyError(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [activeCase, addNotification]);

  // --- run actions ---
  const queueRun = useCallback(async () => {
    if (!activeCase) return;
    try {
      await sim.enqueueRun(activeCase.id);
      addNotification('Run queued — the worker picks it up within ~10 s', 'success');
      refreshRuns(activeCase.id);
    } catch (e) {
      console.error(e);
      // Quota / validation messages from the RPC are user-facing by design.
      addNotification(sim.friendlyError(e), 'error');
    }
  }, [activeCase, refreshRuns, addNotification]);

  const requestCancel = useCallback(async (runId) => {
    try {
      const outcome = await sim.cancelRun(runId);
      addNotification(outcome === 'cancelled' ? 'Run cancelled'
        : outcome === 'cancel_requested' ? 'Cancel requested — stopping the simulator'
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

  const value = {
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
