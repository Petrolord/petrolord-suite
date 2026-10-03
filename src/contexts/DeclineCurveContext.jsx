import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { fitArpsModel, getFitQuality } from '@/utils/declineCurve/dcaEngine';
import { scenarioForecastSnapshot } from '@/utils/declineCurve/forecastFromHistory';
import { runMonteCarloSimulation } from '@/utils/dcaMonteCarlo';
import { normalizeByTime, normalizeByRate, normalizeByTimeAndRate, applyTypeCurve } from '@/utils/declineCurve/typeCurveEngine';
import {
  saveProject, loadProject, listProjects, deleteProject as deleteProjectRow, service as dcaService,
  migrateLegacyLocalProjects,
} from '@/utils/declineCurve/dcaDataPersistence';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { getErrorMessage } from '@/utils/declineCurve/dcaErrorHandling';
import { useSharedSavedProjects } from '@/lib/recordSharing/useSharedSavedProjects';

export const DCA_PROJECTS_TABLE = 'saved_dca_projects';
import { fitWell, forecastWell } from '@/utils/declineCurve/dcaAnalysis';
import { formatNominalAnnual } from '@/utils/declineCurve/declineDisplay';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { terminalDeclinePerDay } from '@/utils/declineCurve/declineInput';
import { fitRateCumWell, rateCumOf, rateCumStatus } from '@/utils/declineCurve/rateCumFit';
import {
  analysisOf, migrateDcaPayload, analysisStatus, staleText,
  DCA_PAYLOAD_VERSION, DEFAULT_MC_SEED as MODEL_MC_SEED, DEFAULT_ECON_LIMIT_UNCERTAINTY as MODEL_ECON_UNC,
} from '@/utils/declineCurve/dcaModel';

const DeclineCurveContext = createContext();

// Default Monte Carlo seed. Every draw in runMonteCarloSimulation goes through
// it, so the same fit, the same forecast config and the same seed give back the
// same P10/P50/P90. Before this was wired, the sampler drew from Math.random
// and a reported EUR could not be re-derived by anyone holding the same inputs,
// not even by the same user clicking Run Monte Carlo twice. Change the seed
// from Forecast Settings to look at a different realization.
export const DEFAULT_MC_SEED = MODEL_MC_SEED;

// Default half-width of the Monte Carlo economic-limit draw, as a fraction of
// the limit the user set. The engine has always varied the limit, but on a
// hardcoded +-20 percent that no one chose and nothing displayed; it is a user
// setting now, and 0 switches the draw off.
export const DEFAULT_ECON_LIMIT_UNCERTAINTY = MODEL_ECON_UNC;

export const useDeclineCurve = () => {
  const context = useContext(DeclineCurveContext);
  if (!context) throw new Error("useDeclineCurve must be used within a DeclineCurveProvider");
  return context;
};

export const DeclineCurveProvider = ({ children, sharingStore = null }) => {
  // --- Global Project State ---
  const [projectsState, setProjects] = useState([]);
  // DCA-U1-011: record sharing (saved_dca_projects is under the sharing
  // rules since 20261002130000). With a store the picker lists own projects
  // and then those shared with me; a save carries the version it was made
  // from and happens only while I may write. Without one (tests, the plain
  // harness) saves are the owner saves they always were.
  const persistence = useMemo(() => dcaService || { list: listProjects, load: loadProject, save: saveProject, remove: deleteProjectRow }, []);
  const shared = useSharedSavedProjects({ table: DCA_PROJECTS_TABLE, service: persistence, sharingStore });
  const myId = shared.sharing.userId;
  const projects = useMemo(() => projectsState.filter((p) => !sharingStore || !myId || !p.userId || p.userId === myId), [projectsState, sharingStore, myId]);
  const sharedProjects = useMemo(() => (sharingStore && myId ? projectsState.filter((p) => p.userId && p.userId !== myId) : []), [projectsState, sharingStore, myId]);
  const canWrite = shared.canWrite;
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentWellId, setCurrentWellId] = useState(null);
  const [wells, setWells] = useState({}); 

  // --- Analysis State ---
  const [selectedStream, setSelectedStream] = useState('oil'); 
  // DCA-U1-001: the fit, the forecast, their settings and the fit window
  // belong to a well (well.analysis, src/utils/declineCurve/dcaModel.js).
  // streamState and fitWindow are the current well's, read through here so
  // the panels keep their shape.

  const [dataQuality, setDataQuality] = useState({ issues: {}, score: 100, summary: null });

  const [scenarios, setScenarios] = useState([]); 
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [groups, setGroups] = useState([]); 

  // --- Phase 4 New State ---
  const [typeCurves, setTypeCurves] = useState([]);
  const [selectedTypeCurve, setSelectedTypeCurve] = useState(null);
  const [wellGroups, setWellGroups] = useState([]);
  const [selectedWellGroup, setSelectedWellGroup] = useState(null);

  // Well filters (R1: real filters over what wells actually carry —
  // name/tag search, fluid type, has-data), applied wherever a well
  // list is offered (grouping, type curves).
  const [wellFilters, setWellFilters] = useState({ search: '', fluidType: 'all', onlyWithData: false });
  const filteredWellIds = Object.values(wells)
    .filter(w => {
      if (wellFilters.fluidType !== 'all' && w.type !== wellFilters.fluidType) return false;
      if (wellFilters.onlyWithData && !(w.data && w.data.length > 0)) return false;
      if (wellFilters.search) {
        const q = wellFilters.search.toLowerCase();
        const inName = (w.name || '').toLowerCase().includes(q);
        const inTags = (Array.isArray(w.tags) ? w.tags.join(' ') : String(w.tags || '')).toLowerCase().includes(q);
        if (!inName && !inTags) return false;
      }
      return true;
    })
    .map(w => w.id);

  const [isFitting, setIsFitting] = useState(false);
  const [isForecasting, setIsForecasting] = useState(false);

  // --- Phase 5 New State ---
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  // W5: notifications come from the shared Studio shell hook (same 5s
  // auto-dismiss semantics this context originally hand-rolled).
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // --- Helpers ---
  // my projects and those shared with me: a colleague's project keeps its name when I save it
  const currentProject = projectsState.find(p => p.id === currentProjectId);
  const currentWell = wells[currentWellId];
  const currentData = useMemo(() => currentWell?.data || [], [currentWell]);
  const currentAnalysis = analysisOf(currentWell);
  const streamState = currentAnalysis.streams;
  const fitWindow = currentAnalysis.fitWindow;
  const status = analysisStatus(currentWell, selectedStream);

  // write into one well's analysis; a no-op without a well
  const updateAnalysis = useCallback((wellId, fn) => {
    if (!wellId) return;
    setWells((prev) => {
      const w = prev[wellId];
      if (!w) return prev;
      return { ...prev, [wellId]: { ...w, analysis: fn(analysisOf(w)) } };
    });
  }, []);
  const setFitWindow = useCallback((next) => {
    updateAnalysis(currentWellId, (a) => ({ ...a, fitWindow: typeof next === 'function' ? next(a.fitWindow) : next }));
  }, [currentWellId, updateAnalysis]);
  const updateStream = useCallback((wellId, stream, fn) => {
    updateAnalysis(wellId, (a) => ({ ...a, streams: { ...a.streams, [stream]: fn(a.streams[stream]) } }));
  }, [updateAnalysis]);
  
  // --- Actions ---

  // Persistence (R1): projects live in saved_dca_projects. Any pre-R1
  // localStorage/IndexedDB projects are lifted into Supabase once first.
  useEffect(() => {
    const init = async () => {
      try {
        const migrated = await migrateLegacyLocalProjects().catch(() => 0);
        const list = await shared.refreshList();
        setProjects(list);
        if (migrated > 0) {
          addNotification(`Moved ${migrated} local project${migrated === 1 ? '' : 's'} to your account`, 'success');
        }
        if (list.length > 0 && !currentProjectId) {
          openProject(list[0].id);
        }
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    };
    init();
  }, []);

  // The saved payload (version 2: the analysis lives on each well).
  const projectPayload = () => ({
    id: currentProjectId,
    name: currentProject?.name,
    payloadVersion: DCA_PAYLOAD_VERSION,
    wells,
    scenarios,
    typeCurves,
    wellGroups,
    dataQuality,
    modified: new Date().toISOString(),
  });

  // Auto-Save: never while the project is open read-only (a colleague's,
  // or shared for editing and not checked out by me)
  useEffect(() => {
    if (!currentProjectId || !canWrite) return;
    
    const saveTimer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await shared.write(currentProjectId, projectPayload());
        if (res.ok) {
          setLastSaveTime(new Date());
          setSaveError(null);
        } else if (!res.readOnly) {
          setSaveError('Auto-save failed');
          addNotification(res.message, 'error');
        }
      } catch (err) {
        setSaveError("Auto-save failed");
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    }, 10000);

    return () => clearTimeout(saveTimer);
  }, [wells, scenarios, typeCurves, wellGroups, dataQuality, currentProjectId, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualSave = async () => {
    if (!currentProjectId) return false;
    setIsSaving(true);
    try {
        const res = await shared.write(currentProjectId, projectPayload());
        if (!res.ok) {
          setSaveError(res.readOnly ? 'Read-only' : 'Save failed');
          addNotification(res.message, res.readOnly ? 'info' : 'error');
          return false;
        }
        setLastSaveTime(new Date());
        setSaveError(null);
        addNotification("Project saved successfully", "success");
        return true;
    } catch (err) {
        setSaveError("Manual save failed");
        addNotification("Failed to save project", "error");
        return false;
    } finally {
        setIsSaving(false);
    }
  };

  // "Save a copy": the project on screen as my own new project
  const saveCopy = async () => {
    const name = shared.copyNameFor(currentProject?.name || 'DCA project');
    const id = uuidv4();
    try {
      await persistence.save(id, { ...projectPayload(), id, name });
      setProjects(await shared.refreshList());
      await openProject(id);
      addNotification(`Saved a copy as "${name}"`, 'success');
    } catch (e) {
      addNotification(`Could not save a copy: ${e.message}`, 'error');
    }
  };

  const createProject = async (name) => {
    const newProject = { id: uuidv4(), name, createdAt: new Date().toISOString(), wellIds: [] };
    try {
      await persistence.save(newProject.id, { id: newProject.id, name, payloadVersion: DCA_PAYLOAD_VERSION, wells: {}, scenarios: [], typeCurves: [], wellGroups: [] });
      await shared.adoptRow(newProject.id);
    } catch (e) {
      console.error(e);
      addNotification(`Could not create project: ${e.message}`, 'error');
      return;
    }
    setProjects(prev => [newProject, ...prev]);
    setCurrentProjectId(newProject.id);
    setWells({});
    setScenarios([]);
    setTypeCurves([]);
    setDataQuality({ issues: {}, score: 100, summary: null });
    setCurrentWellId(null);
    addNotification(`Project "${name}" created`, "success");
  };

  // Recoverable delete: the project disappears from the UI immediately, but
  // the database row is only removed after the undo window closes. Undo
  // cancels the pending delete and reloads the untouched row. If the app is
  // closed mid-window the delete never lands and the project survives —
  // erring on the side of keeping data.
  const PROJECT_UNDO_WINDOW_MS = 10000;
  const pendingProjectDeletes = useRef({});

  const deleteProject = async (id) => {
    if (pendingProjectDeletes.current[id]) return; // delete already pending
    const listEntry = projects.find(p => p.id === id);
    const wasCurrent = currentProjectId === id;

    setProjects(prev => prev.filter(p => p.id !== id));
    if (wasCurrent) {
      setCurrentProjectId(null);
      setCurrentWellId(null);
      setWells({});
      setScenarios([]);
      setTypeCurves([]);
      setWellGroups([]);
    }

    pendingProjectDeletes.current[id] = setTimeout(async () => {
      delete pendingProjectDeletes.current[id];
      try {
        await deleteProjectRow(id);
      } catch (e) {
        console.error(e);
        addNotification(`Could not delete project: ${e.message}`, 'error');
        if (listEntry) setProjects(prev => prev.some(p => p.id === id) ? prev : [listEntry, ...prev]);
      }
    }, PROJECT_UNDO_WINDOW_MS);

    addNotification(`Project "${listEntry?.name || 'Untitled'}" deleted`, 'info', {
      duration: PROJECT_UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const timer = pendingProjectDeletes.current[id];
          if (!timer) return; // window already closed; row is gone
          clearTimeout(timer);
          delete pendingProjectDeletes.current[id];
          if (listEntry) setProjects(prev => prev.some(p => p.id === id) ? prev : [listEntry, ...prev]);
          if (wasCurrent) openProject(id);
        },
      },
    });
  };

  const openProject = async (id) => {
    setIsSaving(true);
    try {
      const raw = await shared.loadForOpen(id);
      // version 1 kept one analysis per project: it moves onto its well
      const data = raw ? migrateDcaPayload(raw) : null;
      if (data) {
        setCurrentProjectId(id);
        setWells(data.wells || {});
        setScenarios(data.scenarios || []);
        setTypeCurves(data.typeCurves || []);
        setWellGroups(data.wellGroups || []);
        setDataQuality(data.dataQuality || { issues: {}, score: 100, summary: null });
        const ids = Object.keys(data.wells || {});
        setCurrentWellId(ids.length > 0 ? ids[0] : null);
        addNotification("Project loaded", "success");
      } else {
        setCurrentProjectId(id);
      }
    } catch (e) {
      addNotification("Failed to open project", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Wells live inside the project payload; the auto-save effect
  // persists them (the pre-R1 localStorage index is gone).
  const addWell = (name, type='oil') => {
    if (!currentProjectId) {
      addNotification('Create or open a project before adding a well', 'warning');
      return;
    }
    const newWell = { id: uuidv4(), name, type, data: [], projectId: currentProjectId, notes: '', tags: [] };
    setWells(prev => ({ ...prev, [newWell.id]: newWell }));
    setCurrentWellId(newWell.id);
    addNotification(`Well "${name}" added`, 'success');
  };

  // PL11: a labelled sample well, Ekene-1's primary decline (sampleWell.js)
  const addSampleWell = () => {
    if (!currentProjectId) {
      addNotification('Create or open a project before adding the sample well', 'warning');
      return;
    }
    const w = sampleWell(currentProjectId);
    setWells(prev => ({ ...prev, [w.id]: w }));
    setCurrentWellId(w.id);
    setSelectedStream('oil');
    addNotification(`Sample well "${w.name}" added: Ekene-1 primary decline, not field data`, 'info');
  };

  // RL4: what the report names the well by
  const updateIdentification = (wellId, key, value) => {
    setWells(prev => (prev[wellId] ? { ...prev, [wellId]: { ...prev[wellId], identification: { ...(prev[wellId].identification || {}), [key]: value } } } : prev));
  };

  // Recoverable delete: the removed well (data included) is held in the
  // toast's Undo closure; restoring it re-triggers auto-save, so the project
  // payload converges either way.
  const removeWell = (id) => {
    const well = wells[id];
    if (!well) return;
    const wasCurrent = currentWellId === id;
    const newWells = {...wells}; delete newWells[id];
    setWells(newWells);
    if (wasCurrent) setCurrentWellId(null);
    addNotification(`Well "${well.name}" deleted`, 'info', {
      duration: 10000,
      action: {
        label: 'Undo',
        onClick: () => {
          setWells(prev => ({ ...prev, [id]: well }));
          if (wasCurrent) setCurrentWellId(id);
        },
      },
    });
  };

  const updateWellMetadata = (wellId, metadata) => {
    setWells(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], ...metadata }
    }));
  };

  const importProductionData = (wellId, data, dataMeta = null) => {
    setWells(prev => {
      const w = prev[wellId];
      if (!w) return prev;
      const a = analysisOf(w);
      const fitWindow = data.length > 0 ? { startDate: data[0].date, endDate: data[data.length - 1].date } : a.fitWindow;
      return { ...prev, [wellId]: { ...w, data, dataMeta, analysis: { ...a, fitWindow } } };
    });
    // Auto-set the uploaded well as current selection if none selected
    if (!currentWellId) {
      setCurrentWellId(wellId);
    }
    addNotification(`Imported ${data.length} production records`, "success");
  };

  const clearWellData = (wellId) => {
    setWells(prev => {
      const updated = { ...prev };
      if (updated[wellId]) {
        updated[wellId] = { ...updated[wellId], data: [], dataMeta: null };
      }
      return updated;
    });
    setDataQuality({ issues: {}, score: 100, summary: null });
  };

  // --- Analysis Logic ---

  const updateStreamConfig = (key, value) => {
    updateStream(currentWellId, selectedStream, (st) => ({ ...st, [key]: value }));
  };

  const updateForecastConfig = (key, value) => {
    updateStream(currentWellId, selectedStream, (st) => ({ ...st, forecastConfig: { ...st.forecastConfig, [key]: value } }));
  };

  // RL5: a point left out of the fit is left out by the analyst, with a reason
  const excludePoint = (date, reason) => {
    updateStream(currentWellId, selectedStream, (st) => ({
      ...st,
      excluded: [...st.excluded.filter((e) => String(e.date).slice(0, 10) !== String(date).slice(0, 10)), { date, reason: (reason || '').trim() || 'excluded by the analyst' }],
    }));
  };
  const restorePoint = (date) => {
    updateStream(currentWellId, selectedStream, (st) => ({
      ...st, excluded: st.excluded.filter((e) => String(e.date).slice(0, 10) !== String(date).slice(0, 10)),
    }));
  };

  const runFit = useCallback(async () => {
    if (isFitting) return;
    if (!currentWellId) {
      addNotification('Select a well before fitting.', 'warning');
      return;
    }
    setIsFitting(true);

    try {
      // one pure path (dcaAnalysis.fitWell): the window, the exclusions, the
      // validation, the engine and the record of what the fit was made on
      await new Promise(resolve => setTimeout(resolve, 100));
      const res = fitWell(currentWell, selectedStream);
      if (!res.ok) {
        addNotification(res.error, "error");
        return;
      }
      const quality = getFitQuality(res.fit.R2, res.fit.RMSE);
      const level = quality.tier === 'Excellent' || quality.tier === 'Good'
        ? 'success' : quality.tier === 'Fair' ? 'info' : 'warning';
      updateStream(currentWellId, selectedStream, (st) => ({ ...st, fitResults: res.fit }));
      addNotification(`${quality.tier} fit completed (R²=${(res.fit.R2*100).toFixed(1)}%, ${res.summary.used} points)`, level);
    } catch (error) {
      console.error(error);
      addNotification(getErrorMessage(error), "error");
    } finally {
      setIsFitting(false);
    }
  }, [currentWell, currentWellId, selectedStream, addNotification, isFitting, updateStream]);

  // DCA U2-002: the rate against cumulative fit, a cross-check with its own window
  const rateCum = rateCumOf(streamState[selectedStream]);
  const rateCumState = rateCumStatus(currentWell, selectedStream);
  const setRateCumWindow = useCallback((key, value) => {
    updateStream(currentWellId, selectedStream, (st) => {
      const rc = rateCumOf(st);
      return { ...st, rateCum: { ...rc, window: { ...rc.window, [key]: Number.isFinite(value) ? value : null } } };
    });
  }, [currentWellId, selectedStream, updateStream]);
  const runRateCumFit = useCallback(() => {
    if (!currentWellId) {
      addNotification('Select a well before fitting.', 'warning');
      return false;
    }
    const res = fitRateCumWell(currentWell, selectedStream);
    if (!res.ok) {
      addNotification(res.error, 'error');
      return false;
    }
    updateStream(currentWellId, selectedStream, (st) => ({ ...st, rateCum: { ...rateCumOf(st), results: res.results } }));
    addNotification(`Rate against cumulative fit: ${res.results.modelType}, R² ${(res.results.R2 * 100).toFixed(1)}%, ${res.results.n} points`, 'success');
    return true;
  }, [currentWell, currentWellId, selectedStream, updateStream, addNotification]);

  const runForecast = useCallback(async () => {
    if (isForecasting || !streamState[selectedStream].fitResults) return;
    const fitState = analysisStatus(currentWell, selectedStream);
    if (fitState.fit === 'stale') {
      addNotification(staleText(fitState, 'fit'), 'warning');
      return;
    }

    setIsForecasting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const wellId = currentWellId;
      const stream = selectedStream;
      const fit = streamState[stream].fitResults;
      const config = streamState[stream].forecastConfig;

      // Always run the deterministic forecast: the central curve from the
      // last history date (T1: the engine curve runs from the fit's t0, and
      // its whole sum was labelled remaining reserves)
      const deterministic = forecastWell(currentWell, stream);

      let combined = deterministic;

      // If probabilistic mode is on AND we have confidence intervals, also run Monte Carlo
      if (config.probabilisticMode && fit.confidenceIntervals && fit.confidenceIntervals.hasIntervals) {
        // DCA U2-001: the terminal decline travels with every draw (not sampled)
        const Dmin = terminalDeclinePerDay(config);
        const baseParams = Dmin ? { qi: fit.qi, Di: fit.Di, b: fit.b, Dmin } : { qi: fit.qi, Di: fit.Di, b: fit.b };
        const seed = Number.isFinite(config.mcSeed) ? config.mcSeed : DEFAULT_MC_SEED;
        // startDate anchors the sampled curves to the fit's t0, the same
        // origin the deterministic forecast above uses; the same span as the
        // deterministic curve (history plus the horizon), so the P10/P50/P90
        // are EURs from first production over the same end date
        const histDays = Math.max(0, Math.round((new Date(deterministic.historyEndDate) - new Date(fit.t0 || Date.now())) / 86400000));
        const mcConfig = {
          ...config,
          forecastDurationDays: histDays + (config.forecastDurationDays || config.durationDays || 3653),
          startDate: fit.t0 || new Date().toISOString(),
          economicLimitUncertainty: Number.isFinite(config.economicLimitUncertainty)
            ? config.economicLimitUncertainty
            : DEFAULT_ECON_LIMIT_UNCERTAINTY,
        };
        const mcResult = await runMonteCarloSimulation(
          baseParams,
          fit.confidenceIntervals,
          mcConfig,
          1000,  // iterations
          null,  // onProgress
          seed   // reproducible run: same inputs and seed, same P10/P50/P90
        );
        combined = {
          ...deterministic,
          probabilistic: {
            p10: mcResult.p10,
            p50: mcResult.p50,
            p90: mcResult.p90,
            mean: mcResult.mean,
            distribution: mcResult.distribution,
            sampleCurves: mcResult.sampleCurves,
            iterations: mcResult.iterations,
            // Carried so the numbers can be quoted with the settings that
            // produced them, and re-run later from a saved scenario.
            seed: mcResult.seed,
            economicLimitUncertainty: mcConfig.economicLimitUncertainty
          }
        };
        addNotification(`Monte Carlo complete. P10/P50/P90 EUR computed (${mcResult.iterations} sims, seed ${mcResult.seed})`, "success");
      } else {
        addNotification("Forecast completed successfully", "success");
      }

      if (combined) {
        // DCA-U1-003: the forecast records the fit and settings it was run on (forecastWell)
        updateStream(wellId, stream, (st) => ({ ...st, forecastResults: combined }));
      }
    } catch (error) {
      console.error('Forecast error:', error);
      addNotification("Forecast generation failed: " + (error.message || 'unknown'), "error");
    } finally {
      setIsForecasting(false);
    }
  }, [selectedStream, streamState, isForecasting, currentData, currentWell, currentWellId, updateStream, addNotification]);

  // ===== Type Curve Actions =====
  const createTypeCurve = useCallback(async ({ name, wellIds, normalizationMethod, modelType }) => {
    try {
      // Step 1: Gather all selected wells' production data
      const wellData = wellIds
        .map(id => wells[id])
        .filter(w => w && w.data && w.data.length > 0);
      
      if (wellData.length < 2) {
        addNotification("Type curve requires at least 2 wells with data", "warning");
        return;
      }
      
      // Step 2: Normalize each well individually, then aggregate
      const normalizeFn = normalizationMethod === 'TimeOnly' 
        ? normalizeByTime
        : normalizationMethod === 'RateOnly'
          ? normalizeByRate
          : normalizeByTimeAndRate;
      
      const cloud = [];
      wellData.forEach(well => {
        const normalized = normalizeFn(well.data);
        normalized.forEach(point => {
          // Build a synthetic date from t_normalized (days from first prod) for fitArpsModel
          // This lets us reuse the existing engine without changes.
          const syntheticDate = new Date('2000-01-01');
          syntheticDate.setDate(syntheticDate.getDate() + Math.round(point.t_normalized || 0));
          cloud.push({
            date: syntheticDate.toISOString(),
            rate: point.rate_normalized
          });
        });
      });
      
      if (cloud.length < 30) {
        addNotification("Insufficient data points for type curve fit", "warning");
        return;
      }
      
      // Step 3: Sort by synthetic date so the engine sees an ordered series
      cloud.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Step 4: Fit using our proven Arps engine (same one DCA uses)
      const fit = fitArpsModel(cloud, modelType || 'Hyperbolic', null, null);
      
      if (!fit || !fit.qi) {
        addNotification("Type curve fit failed to converge", "error");
        return;
      }
      
      // Step 5: Determine fit quality
      const quality = fit.R2 >= 0.85 ? 'Good' : fit.R2 >= 0.6 ? 'Fair' : 'Poor';
      
      // Step 6: Build the type curve record
      const newCurve = {
        id: `tc_${Date.now()}`,
        name,
        wellIds,
        normalizationMethod,
        modelType: fit.modelType,
        createdAt: new Date().toISOString(),
        fit: {
          qi: fit.qi,
          Di: fit.Di,
          b: fit.b,
          R2: fit.R2,
          RMSE: fit.RMSE,
          quality,
          n: cloud.length,
          wellCount: wellData.length
        },
        cloud: cloud  // Keep the normalized data cloud for plotting
      };
      
      // Step 7: Push and select
      setTypeCurves(prev => [...prev, newCurve]);
      setSelectedTypeCurve(newCurve.id);
      addNotification(`Type curve "${name}" fitted (R²: ${fit.R2.toFixed(3)}, ${quality})`, "success");
    } catch (error) {
      console.error('createTypeCurve error:', error);
      addNotification(`Type curve creation failed: ${error.message || 'unknown'}`, "error");
    }
  }, [wells, addNotification]);

  const deleteTypeCurve = useCallback((id) => {
    setTypeCurves(prev => prev.filter(tc => tc.id !== id));
    setSelectedTypeCurve(prev => prev === id ? null : prev);
    addNotification("Type curve deleted", "info");
  }, [addNotification]);

  const applyTypeCurveToWell = useCallback(({ typeCurveId, targetWellId }) => {
    try {
      const tc = typeCurves.find(t => t.id === typeCurveId);
      if (!tc || !tc.fit) {
        addNotification("Type curve not found", "error");
        return null;
      }
      const targetWell = wells[targetWellId];
      if (!targetWell || !targetWell.data || targetWell.data.length === 0) {
        addNotification("Target well has no production data", "error");
        return null;
      }

      const result = applyTypeCurve(tc.fit, targetWell.data);

      if (!result) {
        addNotification("Type curve application failed (insufficient data or non-hyperbolic shape)", "error");
        return null;
      }

      // Attach the application result to the type curve so a single TC can have many applications
      setTypeCurves(prev => prev.map(t => {
        if (t.id !== typeCurveId) return t;
        const applications = { ...(t.applications || {}) };
        applications[targetWellId] = {
          appliedAt: new Date().toISOString(),
          targetWellName: targetWell.name,
          result
        };
        return { ...t, applications };
      }));

      addNotification(
        `Applied "${tc.name}" to ${targetWell.name}: qi=${result.qi.toFixed(0)}, Di=${formatNominalAnnual(result.Di, 1)} %/yr nominal, R²=${result.R2.toFixed(3)} (${result.quality})`,
        "success"
      );

      return result;
    } catch (error) {
      console.error('applyTypeCurveToWell error:', error);
      addNotification(`Application failed: ${error.message || 'unknown'}`, "error");
      return null;
    }
  }, [typeCurves, wells, addNotification]);

  // ===== Well Group Actions =====
  const createWellGroup = useCallback(({ name, wellIds }) => {
    if (!name || !wellIds || wellIds.length === 0) {
      addNotification("Well group requires a name and at least one well", "warning");
      return;
    }
    const newGroup = {
      id: `wg_${Date.now()}`,
      name,
      wellIds,
      createdAt: new Date().toISOString()
    };
    setWellGroups(prev => [...prev, newGroup]);
    setSelectedWellGroup(newGroup.id);
    addNotification(`Well group "${name}" created`, "success");
  }, [addNotification]);

  const deleteWellGroup = useCallback((id) => {
    setWellGroups(prev => prev.filter(g => g.id !== id));
    setSelectedWellGroup(prev => prev === id ? null : prev);
    addNotification("Well group deleted", "info");
  }, [addNotification]);

  // ===== Scenario Actions =====
  const createScenario = useCallback((name) => {
    if (!name) {
      addNotification("Scenario needs a name", "warning");
      return;
    }
    const stream = selectedStream;
    const fit = streamState[stream]?.fitResults;
    const fcResults = streamState[stream]?.forecastResults;
    const fcConfig = streamState[stream]?.forecastConfig;

    if (!fit || !fcResults) {
      addNotification("Run a fit and forecast before saving a scenario", "warning");
      return;
    }
    const st = analysisStatus(wells[currentWellId], stream);
    if (st.fit !== 'current' || st.forecast !== 'current') {
      addNotification(staleText(st, st.fit !== 'current' ? 'fit' : 'forecast') || 'Run the fit and the forecast again before saving a scenario.', 'warning');
      return;
    }

    const wellId = currentWellId;
    const wellName = wells[wellId]?.name || 'Unknown';

    const newScenario = {
      id: `sc_${Date.now()}`,
      name,
      stream,
      wellId,
      wellName,
      createdAt: new Date().toISOString(),
      fitResults: {
        qi: fit.qi,
        Di: fit.Di,
        b: fit.b,
        modelType: fit.modelType,
        R2: fit.R2,
        RMSE: fit.RMSE,
        t0: fit.t0,
        confidenceIntervals: fit.confidenceIntervals,
        fittedAt: fit.fittedAt,
        points: fit.points,
      },
      forecastConfig: { ...fcConfig },
      // H3: produced, remaining and EUR are kept apart so the workbook and
      // the comparison table never print one of them under another's name
      forecastResults: scenarioForecastSnapshot(fcResults)
    };

    setScenarios(prev => [...prev, newScenario]);
    addNotification(`Scenario "${name}" saved (${stream}, remaining: ${Math.round(fcResults.eur).toLocaleString()})`, "success");
  }, [selectedStream, streamState, currentWellId, wells, addNotification]);

  const deleteScenario = useCallback((id) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    setSelectedScenarios(prev => prev.filter(sId => sId !== id));
    addNotification("Scenario deleted", "info");
  }, [addNotification]);

  const toggleScenarioSelection = useCallback((id) => {
    setSelectedScenarios(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  }, []);




  // --- Context Value ---
  const contextValue = {
    // State
    projects,
    sharedProjects,
    projectRow: shared.projectRow,
    sharing: shared.sharing,
    viewingShared: shared.viewingShared,
    canWrite,
    saveCopy,
    currentProjectId,
    currentWellId,
    wells,
    currentWell,
    currentProject,
    currentData,
    
    // UI State
    selectedStream,
    fitWindow,
    streamState,
    currentAnalysis,
    status,
    scenarios,
    selectedScenarios,
    groups,
    dataQuality,
    
    // Phase 4
    typeCurves,
    selectedTypeCurve,
    wellGroups,
    selectedWellGroup,
    wellFilters,
    setWellFilters,
    filteredWellIds,
    
    // Loading states
    isFitting,
    isForecasting,
    isSaving,
    saveError,
    lastSaveTime,
    
    // Actions
    setCurrentProjectId, // FIXED: Added missing export
    setCurrentWellId,
    setSelectedStream,
    setFitWindow,
    setDataQuality,
    
    // Project Management
    createProject,
    openProject,
    deleteProject,
    manualSave,
    
    // Well Management
    addWell,
    addSampleWell,
    updateIdentification,
    removeWell,
    updateWellMetadata,
    importProductionData,
    clearWellData,
    
    // Analysis
    updateStreamConfig,
    updateForecastConfig,
    excludePoint,
    restorePoint,
    runFit,
    runForecast,
    rateCum,
    rateCumState,
    setRateCumWindow,
    runRateCumFit,
    
    // Phase 4 Actions
    setTypeCurves,
    setSelectedTypeCurve,
    createTypeCurve,
    deleteTypeCurve,
    applyTypeCurveToWell,
    setWellGroups,
    setSelectedWellGroup,
    createWellGroup,
    deleteWellGroup,
    createScenario,
    deleteScenario,
    toggleScenarioSelection,
    setSelectedScenarios,
    setScenarios,
    
    // Notifications
    notifications,
    addNotification,
    removeNotification
  };

  return (
    <DeclineCurveContext.Provider value={contextValue}>
      {children}
    </DeclineCurveContext.Provider>
  );
};