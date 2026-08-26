// Casing & Tubing Design Studio state (D6/U1 rewrite): the wp spine
// (sites -> wellbores -> definitive design stations) replaces the legacy
// public.wells read and every mock generator. The backend is injected —
// the page passes the wp/registry backend, the /dev harness the in-memory
// one — and results recompute synchronously through the pure ctRun service
// on every input change (no stale results state).

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  runAll, defaultCaseDoc, defaultEnvironment, emwKgM3, ENGINE_VERSION,
} from '../services/ctRun';

const CasingTubingDesignContext = createContext();

const docFromRow = (row) => ({
  strings: row.strings && row.strings.casingStrings ? row.strings : defaultCaseDoc().strings,
  environment: { ...defaultEnvironment(), ...(row.environment || {}) },
  loadCases: Array.isArray(row.load_cases) && row.load_cases.length
    ? row.load_cases : defaultCaseDoc().loadCases,
  packer: { ...defaultCaseDoc().packer, ...(row.packer || {}) },
  safetyFactors: { ...defaultCaseDoc().safetyFactors, ...(row.safety_factors || {}) },
});

const rowFromDoc = (doc) => ({
  strings: doc.strings,
  environment: doc.environment,
  load_cases: doc.loadCases,
  packer: doc.packer,
  safety_factors: doc.safetyFactors,
});

export const CasingTubingDesignProvider = ({ backend, children }) => {
  const { toast } = useToast();

  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [wellbores, setWellbores] = useState([]);
  const [selectedWellboreId, setSelectedWellboreId] = useState(null);
  const [trajectory, setTrajectory] = useState(null); // {wellbore, design, stations}
  const [mudWindow, setMudWindow] = useState(null);

  const [caseRows, setCaseRows] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseDoc, setCaseDoc] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState('well-loads');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((message, type = 'info') => {
    setLogs((prev) => [{ timestamp: new Date(), message, type }, ...prev].slice(0, 200));
  }, []);
  const toggleHelp = () => setIsHelpOpen((prev) => !prev);

  // ---- spine loading -------------------------------------------------------

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows = await backend.listSites();
        if (!live) return;
        setSites(rows);
        if (rows.length === 1) setSelectedSiteId(rows[0].id);
      } catch (e) {
        addLog(`Failed to load sites: ${e.message}`, 'error');
      }
    })();
    return () => { live = false; };
  }, [backend, addLog]);

  useEffect(() => {
    if (!selectedSiteId) { setWellbores([]); return undefined; }
    let live = true;
    (async () => {
      try {
        const rows = await backend.listWellbores(selectedSiteId);
        if (!live) return;
        setWellbores(rows);
        if (rows.length === 1) setSelectedWellboreId(rows[0].id);
      } catch (e) {
        addLog(`Failed to load wellbores: ${e.message}`, 'error');
      }
    })();
    return () => { live = false; };
  }, [backend, selectedSiteId, addLog]);

  useEffect(() => {
    if (!selectedWellboreId) {
      setTrajectory(null); setCaseRows([]); setSelectedCaseId(null);
      setCaseDoc(null); setMudWindow(null);
      return undefined;
    }
    let live = true;
    (async () => {
      setBusy(true);
      try {
        const traj = await backend.getDefinitiveTrajectory(selectedWellboreId);
        if (!live) return;
        setTrajectory(traj);
        if (!traj.stations.length) {
          addLog('No definitive design with saved stations on this wellbore — save one in Well Design Studio first.', 'error');
        } else {
          addLog(`Definitive trajectory loaded: ${traj.design?.name || 'design'} (${traj.stations.length} stations).`);
        }
        const rows = await backend.listCases(selectedWellboreId);
        if (!live) return;
        setCaseRows(rows);
        if (rows.length) {
          setSelectedCaseId(rows[0].id);
          setCaseDoc(docFromRow(rows[0]));
          setDirty(false);
        } else {
          setSelectedCaseId(null);
          setCaseDoc(null);
        }
        try {
          const mw = await backend.loadMudWindow(traj.wellbore, traj.stations);
          if (live) setMudWindow(mw && mw.length ? mw : null);
        } catch {
          if (live) setMudWindow(null);
        }
      } catch (e) {
        addLog(`Failed to load wellbore data: ${e.message}`, 'error');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [backend, selectedWellboreId, addLog]);

  // ---- case CRUD -----------------------------------------------------------

  const stations = trajectory?.stations || [];
  const depthUnit = trajectory?.wellbore?.depth_unit === 'ft' ? 'ft' : 'm';

  const selectCase = useCallback((id) => {
    const row = caseRows.find((r) => r.id === id);
    if (!row) return;
    setSelectedCaseId(id);
    setCaseDoc(docFromRow(row));
    setDirty(false);
  }, [caseRows]);

  const createCase = useCallback(async (name) => {
    if (!selectedWellboreId || !stations.length) {
      toast({ title: 'No trajectory', description: 'Select a wellbore with a definitive design first.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const shoeMdM = stations[stations.length - 1].md;
      const doc = defaultCaseDoc({ shoeMdM });
      const created = await backend.saveCase({
        wellbore_id: selectedWellboreId,
        design_id: trajectory?.design?.id || null,
        name: name || 'New Design Case',
        ...rowFromDoc(doc),
      });
      setCaseRows((prev) => [...prev, created]);
      setSelectedCaseId(created.id);
      setCaseDoc(docFromRow(created));
      setDirty(false);
      addLog(`Created design case: ${created.name}`);
      toast({ title: 'Case created', description: created.name });
    } catch (e) {
      toast({ title: 'Create failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [backend, selectedWellboreId, stations, trajectory, toast, addLog]);

  const saveCase = useCallback(async (resultsSummary) => {
    if (!selectedCaseId || !caseDoc) return;
    setBusy(true);
    try {
      const updated = await backend.updateCase(selectedCaseId, rowFromDoc(caseDoc));
      setCaseRows((prev) => prev.map((r) => (r.id === selectedCaseId ? updated : r)));
      setDirty(false);
      if (resultsSummary) {
        await backend.saveRun({
          case_id: selectedCaseId,
          design_id: trajectory?.design?.id || null,
          params: rowFromDoc(caseDoc),
          results: resultsSummary.results,
          summary: resultsSummary.summary,
          engine_version: ENGINE_VERSION,
        });
      }
      addLog('Design case saved.');
      toast({ title: 'Saved', description: 'Design case saved.' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [backend, selectedCaseId, caseDoc, trajectory, toast, addLog]);

  const duplicateCase = useCallback(async () => {
    const row = caseRows.find((r) => r.id === selectedCaseId);
    if (!row || !caseDoc) return;
    setBusy(true);
    try {
      const created = await backend.saveCase({
        wellbore_id: row.wellbore_id,
        design_id: row.design_id,
        name: `${row.name} (copy)`,
        ...rowFromDoc(caseDoc),
      });
      setCaseRows((prev) => [...prev, created]);
      setSelectedCaseId(created.id);
      setCaseDoc(docFromRow(created));
      setDirty(false);
      toast({ title: 'Duplicated', description: created.name });
    } catch (e) {
      toast({ title: 'Duplicate failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [backend, caseRows, selectedCaseId, caseDoc, toast]);

  const deleteCase = useCallback(async (id) => {
    setBusy(true);
    try {
      await backend.deleteCase(id);
      setCaseRows((prev) => prev.filter((r) => r.id !== id));
      if (selectedCaseId === id) {
        setSelectedCaseId(null);
        setCaseDoc(null);
      }
      toast({ title: 'Deleted', description: 'Design case removed.' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [backend, selectedCaseId, toast]);

  // ---- doc updaters --------------------------------------------------------

  const patchDoc = useCallback((patch) => {
    setCaseDoc((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }, []);

  const setStrings = useCallback((updater) => {
    setCaseDoc((prev) => {
      if (!prev) return prev;
      const strings = typeof updater === 'function' ? updater(prev.strings) : updater;
      return { ...prev, strings };
    });
    setDirty(true);
  }, []);

  const setEnvironment = useCallback((patch) => {
    setCaseDoc((prev) => (prev
      ? { ...prev, environment: { ...prev.environment, ...patch } } : prev));
    setDirty(true);
  }, []);

  const setPacker = useCallback((patch) => {
    setCaseDoc((prev) => (prev ? { ...prev, packer: { ...prev.packer, ...patch } } : prev));
    setDirty(true);
  }, []);

  const setSafetyFactors = useCallback((patch) => {
    setCaseDoc((prev) => (prev
      ? { ...prev, safetyFactors: { ...prev.safetyFactors, ...patch } } : prev));
    setDirty(true);
  }, []);

  const saveLoadCase = useCallback((lc) => {
    setCaseDoc((prev) => {
      if (!prev) return prev;
      const exists = prev.loadCases.some((x) => x.id === lc.id);
      const loadCases = exists
        ? prev.loadCases.map((x) => (x.id === lc.id ? lc : x))
        : [...prev.loadCases, { ...lc, id: lc.id || `lc-${Date.now()}` }];
      return { ...prev, loadCases };
    });
    setDirty(true);
  }, []);

  const deleteLoadCase = useCallback((id) => {
    setCaseDoc((prev) => (prev
      ? { ...prev, loadCases: prev.loadCases.filter((x) => x.id !== id) } : prev));
    setDirty(true);
  }, []);

  // PPFG hint: sample the published mud window at the deepest casing shoe.
  const syncPpfgFromPublished = useCallback(() => {
    if (!mudWindow || !mudWindow.length || !caseDoc) {
      toast({ title: 'No published PPFG', description: 'This wellbore has no bridged pp-1.0.0 curves — enter EMWs manually.', variant: 'destructive' });
      return;
    }
    const last = mudWindow[mudWindow.length - 1];
    const pp = last.ppEmw != null ? last.ppEmw * 1000 : null;
    const fp = last.fpEmw != null ? last.fpEmw * 1000 : null;
    setEnvironment({
      ppfg: {
        source: 'published',
        geoWellId: trajectory?.wellbore?.geo_well_id || null,
        ppEmwAtShoeKgM3: pp ?? caseDoc.environment.ppfg?.ppEmwAtShoeKgM3 ?? null,
        fracEmwAtShoeKgM3: fp ?? caseDoc.environment.ppfg?.fracEmwAtShoeKgM3 ?? null,
      },
    });
    addLog(`PPFG synced from published curves (pp ${pp ? Math.round(pp) : 'n/a'} / frac ${fp ? Math.round(fp) : 'n/a'} kg/m3 at ${Math.round(last.md)} m MD).`);
  }, [mudWindow, caseDoc, trajectory, setEnvironment, toast, addLog]);

  // ---- results (synchronous, pure) ----------------------------------------

  const { results, runError } = useMemo(() => {
    if (!caseDoc || !stations.length) return { results: null, runError: null };
    try {
      return { results: runAll({ caseDoc, stations }), runError: null };
    } catch (e) {
      return { results: null, runError: e.message };
    }
  }, [caseDoc, stations]);

  const warnings = results?.warnings || [];

  const value = {
    backend,
    // spine
    sites,
    selectedSite: sites.find((s) => s.id === selectedSiteId) || null,
    selectSite: setSelectedSiteId,
    wellbores,
    selectedWellbore: wellbores.find((w) => w.id === selectedWellboreId) || null,
    selectWellbore: setSelectedWellboreId,
    trajectory,
    stations,
    mudWindow,
    depthUnit,
    // cases
    caseRows,
    selectedCase: caseRows.find((r) => r.id === selectedCaseId) || null,
    selectCase,
    createCase,
    saveCase,
    duplicateCase,
    deleteCase,
    dirty,
    busy,
    // doc + updaters
    caseDoc,
    patchDoc,
    setStrings,
    setEnvironment,
    setPacker,
    setSafetyFactors,
    saveLoadCase,
    deleteLoadCase,
    syncPpfgFromPublished,
    // results
    results,
    runError,
    warnings,
    // UX
    activeTab,
    setActiveTab,
    isHelpOpen,
    toggleHelp,
    logs,
    addLog,
  };

  return (
    <CasingTubingDesignContext.Provider value={value}>
      {children}
    </CasingTubingDesignContext.Provider>
  );
};

export const useCasingTubingDesign = () => {
  const context = useContext(CasingTubingDesignContext);
  if (!context) {
    throw new Error('useCasingTubingDesign must be used within a CasingTubingDesignProvider');
  }
  return context;
};

export { emwKgM3 };
