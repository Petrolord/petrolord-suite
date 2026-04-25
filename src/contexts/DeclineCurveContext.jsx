import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { fitArpsModel, getFitQuality, generateForecast } from '@/utils/declineCurve/dcaEngine';
import { runMonteCarloSimulation } from '@/utils/dcaMonteCarlo';
import { normalizeByTimeAndRate, fitTypeCurve } from '@/utils/declineCurve/typeCurveEngine';
import { saveProjectToIndexedDB, loadProjectFromIndexedDB } from '@/utils/declineCurve/dcaDataPersistence';
import { useKeyboardShortcuts } from '@/utils/declineCurve/dcaKeyboardShortcuts';
import { createUndoRedoManager } from '@/utils/declineCurve/dcaUndoRedo';
import { validateFitInput, getErrorMessage } from '@/utils/declineCurve/dcaErrorHandling';

const DeclineCurveContext = createContext();

export const useDeclineCurve = () => {
  const context = useContext(DeclineCurveContext);
  if (!context) throw new Error("useDeclineCurve must be used within a DeclineCurveProvider");
  return context;
};

export const DeclineCurveProvider = ({ children }) => {
  // --- Global Project State ---
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentWellId, setCurrentWellId] = useState(null);
  const [wells, setWells] = useState({}); 

  // --- Analysis State ---
  const [selectedStream, setSelectedStream] = useState('oil'); 
  const [fitWindow, setFitWindow] = useState({ startDate: null, endDate: null });
  
  const [dataQuality, setDataQuality] = useState({ issues: {}, score: 100, summary: null });

  const [streamState, setStreamState] = useState({
    oil: { 
      fitResults: null, 
      modelType: 'Auto', 
      constraints: { minB: 0, maxB: 1.0 },
      forecastConfig: { economicLimit: 10, durationDays: 3650, facilityLimit: 0, stopAtLimit: true },
      forecastResults: null
    },
    gas: { 
      fitResults: null, 
      modelType: 'Auto', 
      constraints: { minB: 0, maxB: 1.0 },
      forecastConfig: { economicLimit: 100, durationDays: 3650, facilityLimit: 0, stopAtLimit: true },
      forecastResults: null
    },
    water: { 
      fitResults: null, 
      modelType: 'Auto', 
      constraints: { minB: 0, maxB: 1.0 },
      forecastConfig: { economicLimit: 0, durationDays: 3650, facilityLimit: 0, stopAtLimit: false },
      forecastResults: null
    }
  });

  const [scenarios, setScenarios] = useState([]); 
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [groups, setGroups] = useState([]); 

  // --- Phase 4 New State ---
  const [typeCurves, setTypeCurves] = useState([]);
  const [selectedTypeCurve, setSelectedTypeCurve] = useState(null);
  const [wellGroups, setWellGroups] = useState([]);
  const [selectedWellGroup, setSelectedWellGroup] = useState(null);

  const [isFitting, setIsFitting] = useState(false);
  const [isForecasting, setIsForecasting] = useState(false);

  // --- Phase 5 New State ---
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const undoStack = useRef(createUndoRedoManager());

  // --- Helpers ---
  const currentProject = projects.find(p => p.id === currentProjectId);
  const currentWell = wells[currentWellId];
  const currentData = currentWell?.data || [];
  
  // --- Actions ---

  const addNotification = useCallback((message, type = 'info') => {
    const id = uuidv4();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeNotification(id), 5000);
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Persistence
  useEffect(() => {
    const init = async () => {
      const saved = localStorage.getItem('dca_projects');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setProjects(parsed);
          if (parsed.length > 0 && !currentProjectId) {
             openProject(parsed[0].id);
          }
        } catch(e) { console.error(e); }
      }
    };
    init();
  }, []);

  // Auto-Save
  useEffect(() => {
    if (!currentProjectId) return;
    
    const saveTimer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const projectData = {
          id: currentProjectId,
          name: currentProject?.name,
          wells,
          streamState,
          scenarios,
          typeCurves,
          wellGroups,
          dataQuality, 
          fitWindow,
          modified: new Date().toISOString()
        };
        
        await saveProjectToIndexedDB(currentProjectId, projectData);
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (err) {
        setSaveError("Auto-save failed");
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    }, 10000); 

    return () => clearTimeout(saveTimer);
  }, [wells, streamState, scenarios, typeCurves, wellGroups, dataQuality, fitWindow, currentProjectId]);

  const manualSave = async () => {
    if (!currentProjectId) return;
    setIsSaving(true);
    try {
        const projectData = {
          id: currentProjectId,
          name: currentProject?.name,
          wells,
          streamState,
          scenarios,
          typeCurves,
          wellGroups,
          dataQuality,
          fitWindow,
          modified: new Date().toISOString()
        };
        await saveProjectToIndexedDB(currentProjectId, projectData);
        setLastSaveTime(new Date());
        addNotification("Project saved successfully", "success");
    } catch (err) {
        setSaveError("Manual save failed");
        addNotification("Failed to save project", "error");
    } finally {
        setIsSaving(false);
    }
  };

  const savePersistence = (updatedProjects) => {
    setProjects(updatedProjects);
    localStorage.setItem('dca_projects', JSON.stringify(updatedProjects));
  };

  const createProject = (name) => {
    const newProject = { id: uuidv4(), name, createdAt: new Date().toISOString(), wellIds: [] };
    savePersistence([...projects, newProject]);
    setCurrentProjectId(newProject.id);
    setWells({});
    setScenarios([]);
    setTypeCurves([]);
    setDataQuality({ issues: {}, score: 100, summary: null });
    setFitWindow({ startDate: null, endDate: null });
    addNotification(`Project "${name}" created`, "success");
  };

  const openProject = async (id) => {
    setIsSaving(true);
    try {
      const data = await loadProjectFromIndexedDB(id);
      if (data) {
        setCurrentProjectId(id);
        setWells(data.wells || {});
        setStreamState(data.streamState || streamState); 
        setScenarios(data.scenarios || []);
        setTypeCurves(data.typeCurves || []);
        setWellGroups(data.wellGroups || []);
        setDataQuality(data.dataQuality || { issues: {}, score: 100, summary: null });
        if (data.fitWindow) {
          setFitWindow(data.fitWindow);
        }
        
        if (Object.keys(data.wells || {}).length > 0) {
            setCurrentWellId(Object.keys(data.wells)[0]);
        }
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

  const addWell = (name, type='oil') => {
    if (!currentProjectId) return;
    const newWell = { id: uuidv4(), name, type, data: [], projectId: currentProjectId, notes: '', tags: [] };
    setWells(prev => ({ ...prev, [newWell.id]: newWell }));
    const updated = projects.map(p => p.id === currentProjectId ? { ...p, wellIds: [...(p.wellIds||[]), newWell.id] } : p);
    savePersistence(updated);
    setCurrentWellId(newWell.id);
  };

  const removeWell = (id) => {
    const newWells = {...wells}; delete newWells[id];
    setWells(newWells);
    const updated = projects.map(p => ({ ...p, wellIds: p.wellIds.filter(wid => wid !== id) }));
    savePersistence(updated);
    if (currentWellId === id) setCurrentWellId(null);
  };

  const updateWellMetadata = (wellId, metadata) => {
    setWells(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], ...metadata }
    }));
  };

  const importProductionData = (wellId, data) => {
    setWells(prev => ({ ...prev, [wellId]: { ...prev[wellId], data } }));
    if (data.length > 0) {
      setFitWindow({ startDate: data[0].date, endDate: data[data.length-1].date });
    }
    // Auto-set the uploaded well as current selection if none selected
    if (!currentWellId) {
      setCurrentWellId(wellId);
    }
    addNotification(`Imported ${data.length} production records`, "success");
  };

  // --- Analysis Logic ---

  const updateStreamConfig = (key, value) => {
    setStreamState(prev => ({
      ...prev,
      [selectedStream]: { ...prev[selectedStream], [key]: value }
    }));
  };

  const updateForecastConfig = (key, value) => {
    setStreamState(prev => ({
      ...prev,
      [selectedStream]: { 
        ...prev[selectedStream], 
        forecastConfig: { ...prev[selectedStream].forecastConfig, [key]: value }
      }
    }));
  };

  const runFit = useCallback(async () => {
    if (isFitting) return;
    setIsFitting(true);

    try {
      // 1. Validate Input
      const streamData = currentData.map(d => ({
        date: d.date,
        rate: selectedStream === 'oil' ? d.rate : (selectedStream === 'gas' ? d.gasRate : d.waterRate) || d.rate 
      })).filter(d => d.rate != null);

      const config = streamState[selectedStream];
      
      const validation = validateFitInput(streamData, fitWindow, config.modelType);
      
      if (!validation.valid) {
        addNotification(validation.error, "error");
        setIsFitting(false);
        return;
      }

      // 2. Run Fit (wrapped in timeout to allow UI to update spinner)
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = fitArpsModel(streamData, config.modelType, fitWindow, config.constraints);
      
      if (result) {
        const quality = getFitQuality(result.R2, result.RMSE);
        
        updateStreamConfig('fitResults', result);
        addNotification(`${quality.label} fit completed (R²=${(result.R2*100).toFixed(1)}%)`, quality.level);
      } else {
        addNotification("Fit failed - check data quality", "error");
      }
    } catch (error) {
      console.error(error);
      addNotification(getErrorMessage(error), "error");
    } finally {
      setIsFitting(false);
    }
  }, [currentData, selectedStream, streamState, fitWindow, addNotification]);

  const runForecast = useCallback(async () => {
    if (isForecasting || !streamState[selectedStream].fitResults) return;
    
    setIsForecasting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const fit = streamState[selectedStream].fitResults;
      const config = streamState[selectedStream].forecastConfig;

      // Always run the deterministic forecast — gives us the central curve
      const deterministic = generateForecast(
        fit, config,
        fit.t0 || new Date().toISOString()
      );

      let combined = deterministic;

      // If probabilistic mode is on AND we have confidence intervals, also run Monte Carlo
      if (config.probabilisticMode && fit.confidenceIntervals && fit.confidenceIntervals.hasIntervals) {
        const baseParams = { qi: fit.qi, Di: fit.Di, b: fit.b };
        const mcResult = await runMonteCarloSimulation(
          baseParams,
          fit.confidenceIntervals,
          config,
          1000  // iterations
        );
        // Attach probabilistic results next to the deterministic forecast
        combined = {
          ...deterministic,
          probabilistic: {
            p10: mcResult.p10,
            p50: mcResult.p50,
            p90: mcResult.p90,
            mean: mcResult.mean,
            distribution: mcResult.distribution,
            sampleCurves: mcResult.sampleCurves,
            iterations: mcResult.iterations
          }
        };
        addNotification(`Monte Carlo complete — P10/P50/P90 EUR computed (${mcResult.iterations} sims)`, "success");
      } else {
        addNotification("Forecast completed successfully", "success");
      }

      if (combined) {
        updateStreamConfig('forecastResults', combined);
      }
    } catch (error) {
      console.error('Forecast error:', error);
      addNotification("Forecast generation failed: " + (error.message || 'unknown'), "error");
    } finally {
      setIsForecasting(false);
    }
  }, [selectedStream, streamState, isForecasting]);

  // --- Context Value ---
  const contextValue = {
    // State
    projects,
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
    scenarios,
    selectedScenarios,
    groups,
    dataQuality,
    
    // Phase 4
    typeCurves,
    selectedTypeCurve,
    wellGroups,
    selectedWellGroup,
    
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
    manualSave,
    
    // Well Management
    addWell,
    removeWell,
    updateWellMetadata,
    importProductionData,
    
    // Analysis
    updateStreamConfig,
    updateForecastConfig,
    runFit,
    runForecast,
    
    // Phase 4 Actions
    setTypeCurves,
    setSelectedTypeCurve,
    setWellGroups,
    setSelectedWellGroup,
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