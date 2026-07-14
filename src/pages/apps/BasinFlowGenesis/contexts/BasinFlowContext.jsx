import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SimulationEngine } from '@/pages/apps/BasinFlowGenesis/services/SimulationEngine';
import { getThermalProps } from '@/pages/apps/BasinFlowGenesis/services/ThermalPropertiesLibrary';
import { getCompactionParams } from '@/pages/apps/BasinFlowGenesis/services/CompactionModelLibrary';
import { useMultiWell } from './MultiWellContext';
import { useToast } from '@/components/ui/use-toast';

const BasinFlowContext = createContext(null);

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
      const sanitizedStratigraphy = (action.payload.stratigraphy || []).map(layer => {
          // Ensure sourceRock object exists
          if (!layer.sourceRock) {
              return { ...layer, sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } };
          }
          return layer;
      });
      
      return { 
          ...state, 
          ...action.payload, 
          stratigraphy: sanitizedStratigraphy 
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
                if (action.payload.lithology && action.payload.lithology !== layer.lithology
                    && !action.payload.thermal && !action.payload.compaction) {
                    const t = getThermalProps(action.payload.lithology);
                    const c = getCompactionParams(action.payload.lithology);
                    updated.thermal = { conductivity: t.conductivity, radiogenic: t.radiogenic, heatCapacity: t.heatCapacity };
                    updated.compaction = { model: 'exponential', phi0: c.phi0, c: c.c };
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
    case 'UPDATE_HEAT_FLOW':
        return { ...state, heatFlow: { ...state.heatFlow, ...action.payload } };
    case 'SET_RESULTS':
        return { ...state, results: action.payload };
    case 'SAVE_SCENARIO':
        const scenario = {
            id: uuidv4(),
            name: action.payload.name || `Scenario ${state.scenarios.length + 1}`,
            timestamp: new Date(),
            stratigraphy: JSON.parse(JSON.stringify(state.stratigraphy)),
            heatFlow: JSON.parse(JSON.stringify(state.heatFlow)),
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

export const BasinFlowProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { updateWell, state: mwState } = useMultiWell();
  const { toast } = useToast();
  
  // Auto-save Debounce Ref
  const saveTimeoutRef = useRef(null);
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
              // Perform save
              const updates = {
                  stratigraphy: state.stratigraphy,
                  heatFlow: state.heatFlow,
                  calibration: state.calibration,
                  scenarios: state.scenarios,
                  // Auto-update status to in-progress if we are editing properties
                  status: 'in-progress' 
              };
              
              updateWell(mwState.activeWellId, updates);
              dispatch({ type: 'SET_SAVING', payload: false });
          }, 1500); // 1.5s debounce
      }
      
      return () => clearTimeout(saveTimeoutRef.current);
  }, [state.stratigraphy, state.heatFlow, state.calibration, state.scenarios, mwState.activeWellId, updateWell]);


  const runSimulation = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_PROGRESS', payload: 0 });
      
      try {
          if(mwState.activeWellId) {
              updateWell(mwState.activeWellId, { status: 'in-progress' });
          }

          // Use the SimulationEngine
          const results = await SimulationEngine.run(state, (progress) => {
              dispatch({ type: 'SET_PROGRESS', payload: progress });
          });
          
          dispatch({ type: 'SET_RESULTS', payload: results });
          
          return results;
      } catch (e) {
          console.error("Simulation Failed", e);
          toast({ variant: "destructive", title: "Simulation Error", description: e.message });
          throw e;
      } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({ type: 'SET_PROGRESS', payload: 100 });
      }
  };

  return (
    <BasinFlowContext.Provider value={{ state, dispatch, runSimulation, stats: { totalThickness, maxAge } }}>
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