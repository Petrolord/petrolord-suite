import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { runBasin } from '@/pages/apps/BasinFlowGenesis/services/runClient';
import { getThermalProps } from '@/pages/apps/BasinFlowGenesis/services/ThermalPropertiesLibrary';
import { getCompactionParams } from '@/pages/apps/BasinFlowGenesis/services/CompactionModelLibrary';
import { useMultiWell } from './MultiWellContext';
import { useToast } from '@/components/ui/use-toast';
import { UNITS_KEY, DEPTH_UNITS, TEMP_UNITS, readUnits } from '../services/units';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { engineInputsKey } from '../services/honesty';
import { layerLibrary } from '../services/lithologyMix';

const storage = () => { try { return window.localStorage; } catch { return null; } };

const BasinFlowContext = createContext(null);

/** BF-U1-012: a result remembers the inputs and the model it was run on. */
export const stampRun = (results, inputs, wellId = null) => (results ? { ...results, runOf: { key: engineInputsKey(inputs), wellId, at: new Date().toISOString() } } : results);

// Helper to safely create a layer with all required properties
const createSafeLayer = (overrides = {}) => ({
  id: uuidv4(),
  name: 'New Layer',
  ageStart: 10,
  ageEnd: 0,
  thickness: 1000, // meters
  lithology: 'sandstone',
  lithologyMix: { shale: 0, sandstone: 100, limestone: 0 },
  sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' },
  color: '#f5f5dc',
  thermal: { conductivity: 3.5, radiogenic: 1.2e-6, heatCapacity: 900 },
  compaction: { model: 'exponential', phi0: 0.49, c: 0.00027 },
  ...overrides
});

const initialState = {
  project: {
    id: null,
    name: 'Untitled Basin Model',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    settings: { unitSystem: 'metric' }
  },
  // model settings the engine reads (BF0: persisted with the well)
  settings: { surfaceTemp: 20 },
  mode: null, // null | 'guided' | 'expert'
  stratigraphy: [createSafeLayer({ name: 'Layer 1' })],
  heatFlow: {
    type: 'constant',
    value: 60, // mW/m2
    history: [{ age: 0, value: 60 }, { age: 100, value: 60 }]
  },
  erosionEvents: [],
  // Scenario Management
  scenarios: [], // Array of { id, name, results, stratigraphy, heatFlow }
  activeScenarioId: null,
  // Calibration Data
  calibration: {
      ro: [], // { depth, value, well }
      temp: [] // { depth, value, well }
  },
  // Results of current active run: { meta, data } from
  // SimulationEngine.run, or null before the first run.
  results: null,
  ui: {
      leftPanelOpen: true,
      rightPanelOpen: true,
      activeTab: 'stratigraphy'
  },
  // U2-010: the model before the last layer replacement (one level)
  undo: null,
  isLoading: false,
  isSaving: false,
  progress: 0,
  error: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'LOAD_PROJECT':
      // When loading project data, sanitize layers
      const sanitizedStratigraphy = (action.payload.stratigraphy || state.stratigraphy || []).map(layer => {
          // Ensure sourceRock object exists
          if (!layer.sourceRock) {
              return { ...layer, sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } };
          }
          return layer;
      });
      
      // BF-U1-002/003: a model load (it carries stratigraphy) drops the
      // previous model's result and takes its own scenarios when given, so
      // well B never shows well A's result and the auto-save never writes
      // A's scenarios into B
      const isModel = Array.isArray(action.payload.stratigraphy);
      return {
          ...state,
          ...action.payload,
          ...(isModel ? {
              undo: null,
              results: action.payload.results ?? null,
              scenarios: Array.isArray(action.payload.scenarios) ? action.payload.scenarios : state.scenarios,
              activeScenarioId: null,
          } : {}),
          stratigraphy: isModel ? sanitizedStratigraphy : state.stratigraphy,
          // BF0: a well without these keeps the defaults (they used to
          // leak from the previous well)
          erosionEvents: Array.isArray(action.payload.erosionEvents) ? action.payload.erosionEvents : (action.payload.stratigraphy ? [] : state.erosionEvents),
          settings: action.payload.settings ? { ...initialState.settings, ...action.payload.settings } : (action.payload.stratigraphy ? { ...initialState.settings } : state.settings),
      };
    case 'ADD_LAYER':
      const newLayer = createSafeLayer({ name: `Layer ${state.stratigraphy.length + 1}` });
      return { ...state, stratigraphy: [newLayer, ...state.stratigraphy] };
    case 'UPDATE_LAYER':
        return {
            ...state,
            stratigraphy: state.stratigraphy.map(layer => {
                if (layer.id !== action.id) return layer;
                const updated = { ...layer, ...action.payload };
                // Changing lithology re-syncs the per-layer property
                // overrides to the new lithology's library defaults —
                // otherwise the engine would keep applying the old
                // lithology's phi0/c/conductivity as explicit overrides.
                // U2-013: a mixed layer's properties follow its fractions
                const lithChanged = action.payload.lithology && action.payload.lithology !== layer.lithology;
                const mixChanged = updated.lithology === 'mixed' && action.payload.lithologyMix;
                if ((lithChanged || mixChanged) && !action.payload.thermal && !action.payload.compaction) {
                    if (lithChanged && updated.lithology === 'mixed' && !action.payload.lithologyMix) {
                        // start a mix from what the layer was
                        const from = ['sandstone', 'shale', 'limestone'].includes(layer.lithology) ? layer.lithology : 'shale';
                        updated.lithologyMix = { sandstone: 0, shale: 0, limestone: 0, [from]: 100 };
                    }
                    const lib = layerLibrary(updated);
                    updated.thermal = lib.thermal;
                    updated.compaction = lib.compaction;
                }
                return updated;
            })
        };
    case 'DELETE_LAYER':
        return {
            ...state,
            stratigraphy: state.stratigraphy.filter(layer => layer.id !== action.id)
        };
    case 'REORDER_LAYERS':
        return { ...state, stratigraphy: action.payload };
    // U2-010 (BF-U1-023): a template, a tops file or a registry well replaces
    // the model's layers (and with the registry its erosion surfaces and
    // tie); the model as it was is kept so one click puts it back.
    case 'REPLACE_LAYERS': {
        const p = action.payload || {};
        const undo = {
            label: p.label || 'Replace the layers',
            at: new Date().toISOString(),
            stratigraphy: state.stratigraphy,
            erosionEvents: state.erosionEvents,
            settings: state.settings,
        };
        return {
            ...state,
            undo,
            stratigraphy: Array.isArray(p.stratigraphy) ? p.stratigraphy : state.stratigraphy,
            ...(Array.isArray(p.erosionEvents) ? { erosionEvents: p.erosionEvents } : {}),
            ...(p.settings ? { settings: { ...state.settings, ...p.settings } } : {}),
        };
    }
    case 'UNDO_REPLACE':
        if (!state.undo) return state;
        return { ...state, stratigraphy: state.undo.stratigraphy, erosionEvents: state.undo.erosionEvents, settings: state.undo.settings, undo: null };
    case 'UPDATE_HEAT_FLOW':
        return { ...state, heatFlow: { ...state.heatFlow, ...action.payload } };
    case 'SET_EROSION_EVENTS':
        return { ...state, erosionEvents: Array.isArray(action.payload) ? action.payload : [] };
    case 'UPDATE_SETTINGS':
        return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_RESULTS':
        return { ...state, results: action.payload };
    case 'SAVE_SCENARIO':
        const scenario = {
            id: uuidv4(),
            name: action.payload.name || `Scenario ${state.scenarios.length + 1}`,
            timestamp: new Date(),
            stratigraphy: JSON.parse(JSON.stringify(state.stratigraphy)),
            heatFlow: JSON.parse(JSON.stringify(state.heatFlow)),
            // BF-U1-022: the erosion and the surface temperature are inputs too
            erosionEvents: JSON.parse(JSON.stringify(state.erosionEvents || [])),
            settings: JSON.parse(JSON.stringify(state.settings || {})),
            results: state.results,
            parameters: { description: action.payload.description || '' }
        };
        return { ...state, scenarios: [...state.scenarios, scenario], activeScenarioId: scenario.id };
    case 'DELETE_SCENARIO':
        return { ...state, scenarios: state.scenarios.filter(s => s.id !== action.id) };
    case 'LOAD_SCENARIO':
        const targetScenario = state.scenarios.find(s => s.id === action.id);
        if(!targetScenario) return state;
        return { 
            ...state, 
            activeScenarioId: action.id,
            stratigraphy: targetScenario.stratigraphy,
            heatFlow: targetScenario.heatFlow,
            // scenarios saved before U1 carry no erosion or settings: keep the current ones
            ...(Array.isArray(targetScenario.erosionEvents) ? { erosionEvents: targetScenario.erosionEvents } : {}),
            ...(targetScenario.settings ? { settings: { ...state.settings, ...targetScenario.settings } } : {}),
            results: targetScenario.results
        };
    case 'SET_CALIBRATION_DATA':
        return { ...state, calibration: { ...state.calibration, ...action.payload } };
    case 'SET_LOADING':
        return { ...state, isLoading: action.payload };
    case 'SET_SAVING':
        return { ...state, isSaving: action.payload };
    case 'SET_PROGRESS':
        return { ...state, progress: action.payload };
    case 'SET_UI':
        return { ...state, ui: { ...state.ui, ...action.payload } };
    default:
      return state;
  }
}

export const BasinFlowProvider = ({ children, appPaths = {} }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { updateWell, state: mwState, backend } = useMultiWell();
  const { toast } = useToast();

  // BF3: display units (depth m|ft, temperature C|F) convert at the UI
  // edge. Every stored value stays SI.
  // Suite unit profile: depth and temperature start from the profile; the
  // units bar changes this view for the session only, and the older
  // remembered 'bf.units' choice no longer beats the profile
  const unitsHook = useAppUnits('basin', {
    depth: { family: 'depth', allowed: DEPTH_UNITS },
    temp: { family: 'temperature', allowed: TEMP_UNITS },
  }, { fallback: readUnits(storage()), legacyKeys: [UNITS_KEY] });
  const { units, setUnit } = unitsHook;
  
  // Auto-save Debounce Ref
  const saveTimeoutRef = useRef(null);
  const savedWellRef = useRef(null);
  const savedKeyRef = useRef(null);
  const isFirstRender = useRef(true);

  // Helper to calculate total thickness/age just for quick reference
  const totalThickness = (state.stratigraphy || []).reduce((acc, layer) => acc + (layer.thickness || 0), 0);
  const maxAge = state.stratigraphy && state.stratigraphy.length > 0 
    ? Math.max(...state.stratigraphy.map(l => l.ageStart || 0), 0) 
    : 0;

  // Auto-Save Effect
  useEffect(() => {
      if (isFirstRender.current) {
          isFirstRender.current = false;
          return;
      }

      // Only save if we have an active well context
      if (mwState.activeWellId) {
          dispatch({ type: 'SET_SAVING', payload: true });
          
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          
          saveTimeoutRef.current = setTimeout(() => {
              // BF-U1-002: opening a model is not an edit; its status (say
              // Calibrated) is kept until an input really changes
              const key = engineInputsKey(state);
              const opened = savedWellRef.current !== mwState.activeWellId;
              const edited = !opened && savedKeyRef.current !== key;
              savedWellRef.current = mwState.activeWellId;
              savedKeyRef.current = key;
              const updates = {
                  stratigraphy: state.stratigraphy,
                  heatFlow: state.heatFlow,
                  erosionEvents: state.erosionEvents,
                  settings: state.settings,
                  calibration: state.calibration,
                  scenarios: state.scenarios,
                  ...(edited ? { status: 'in-progress' } : {}),
              };
              
              updateWell(mwState.activeWellId, updates);
              dispatch({ type: 'SET_SAVING', payload: false });
          }, 1500); // 1.5s debounce
      }
      
      return () => clearTimeout(saveTimeoutRef.current);
  }, [state.stratigraphy, state.heatFlow, state.erosionEvents, state.settings, state.calibration, state.scenarios, mwState.activeWellId, updateWell]);


  // BF-U1-007: a caller that has just dispatched new inputs passes them, since
  // this closure still holds the previous render's state (the guided run
  // computed the PREVIOUS model and showed it under the guided inputs)
  // BF-U2-009: the run goes to a Web Worker (progress, Cancel); the page
  // path stays where no worker can start
  const abortRef = useRef(null);
  const cancelSimulation = () => { if (abortRef.current) abortRef.current.abort(); };
  const runSimulation = async (override = null) => {
      const inputs = override ? { ...state, ...override } : state;
      if (abortRef.current) abortRef.current.abort();
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortRef.current = ctl;
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_PROGRESS', payload: 0 });
      
      try {
          if(mwState.activeWellId) {
              updateWell(mwState.activeWellId, { status: 'in-progress' });
          }

          // Use the SimulationEngine
          const results = stampRun(await runBasin(inputs, {
              signal: ctl?.signal,
              onProgress: (progress) => dispatch({ type: 'SET_PROGRESS', payload: progress }),
          }), inputs, override?.wellId ?? mwState.activeWellId);
          
          dispatch({ type: 'SET_RESULTS', payload: results });
          
          return results;
      } catch (e) {
          if (e?.cancelled) {
              toast({ title: 'Run cancelled', description: 'The previous result, if any, is kept.' });
              throw e;
          }
          console.error("Simulation Failed", e);
          toast({ variant: "destructive", title: "Simulation Error", description: e.message });
          throw e;
      } finally {
          if (abortRef.current === ctl) abortRef.current = null;
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({ type: 'SET_PROGRESS', payload: 100 });
      }
  };

  return (
    <BasinFlowContext.Provider value={{ state, dispatch, runSimulation, cancelSimulation, stats: { totalThickness, maxAge }, units, setUnit, unitsHook, appPaths }}>
      {children}
    </BasinFlowContext.Provider>
  );
};

export const useBasinFlow = () => {
  const context = useContext(BasinFlowContext);
  if (!context) {
    throw new Error('useBasinFlow must be used within a BasinFlowProvider');
  }
  return context;
};