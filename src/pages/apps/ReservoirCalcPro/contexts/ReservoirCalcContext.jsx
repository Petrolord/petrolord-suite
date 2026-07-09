import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { ProjectService } from '../services/ProjectService';
import { AOIManager } from '../services/AOIManager';
import { loadSettings } from '../hooks/useReservoirSettings';

const MAX_AUDIT = 200;
const auditEntry = (action, details = '') => ({
    id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    action,
    details,
});

const initialState = {
    project: {
        name: "Untitled Project",
        id: null,
        created_at: null
    },
    currentProjectMeta: {
        name: "",
        description: ""
    },
    reservoirName: "",
    unitSystem: 'field', 
    calcMethod: 'deterministic', 
    inputMethod: 'simple', 
    
    inputs: {
        fluidType: 'oil', 
        topSurfaceId: null,
        baseSurfaceId: null,
        area: 5000,
        thickness: 50,
        ntg: 1.0,
        porosity: 0.20,
        sw: 0.30,
        fvf: 1.2,
        bg: 0.005,
        recovery: 25,
        recoveryGas: 70,
        pressure: 3500,
        temperature: 180,
        permeability: 100,
        api: 35,
        gasGrav: 0.7,
        owc: -8000,
        goc: -7000
    },
    
    surfaces: {},

    // Area-of-Interest polygons (world XY coordinates), the currently selected
    // AOI, and the in-progress drawing buffer fed by map clicks.
    aois: [],
    activeAoiId: null,
    drawing: { isActive: false, currentPoints: [] },

    // Generated property maps (structure, thickness, HCPV, STOOIP, …)
    maps: [],

    results: null,
    baseCase: null, // Shared deterministic parameters & results for MC integration
    probResults: null,
    projects: [], // Saved projects for the current user (Project Manager)
    auditTrail: [], // Chronological log of real user/system actions (newest first)
    isCalculating: false,
    isDirty: false,
    error: null
};

const ACTIONS = {
    SET_PROJECT: 'SET_PROJECT',
    UPDATE_INPUTS: 'UPDATE_INPUTS',
    ADD_SURFACE: 'ADD_SURFACE',
    REMOVE_SURFACE: 'REMOVE_SURFACE',
    SET_TOP_SURFACE: 'SET_TOP_SURFACE',
    SET_BASE_SURFACE: 'SET_BASE_SURFACE',
    SET_RESULTS: 'SET_RESULTS',
    SET_PROB_RESULTS: 'SET_PROB_RESULTS',
    SET_CALCULATING: 'SET_CALCULATING',
    SET_ERROR: 'SET_ERROR',
    RESET: 'RESET',
    SET_MODE: 'SET_MODE',
    SET_UNIT_SYSTEM: 'SET_UNIT_SYSTEM',
    SET_INPUT_METHOD: 'SET_INPUT_METHOD',
    MARK_DIRTY: 'MARK_DIRTY',
    SET_PROJECTS: 'SET_PROJECTS',
    LOAD_PROJECT: 'LOAD_PROJECT',
    NEW_PROJECT: 'NEW_PROJECT',
    // AOI drawing + management
    START_DRAWING: 'START_DRAWING',
    ADD_DRAWING_POINT: 'ADD_DRAWING_POINT',
    CANCEL_DRAWING: 'CANCEL_DRAWING',
    FINISH_DRAWING: 'FINISH_DRAWING',
    UPDATE_AOI: 'UPDATE_AOI',
    DELETE_AOI: 'DELETE_AOI',
    SET_ACTIVE_AOI: 'SET_ACTIVE_AOI',
    // Generated maps
    ADD_MAPS: 'ADD_MAPS',
    DELETE_MAP: 'DELETE_MAP',
    CLEAR_MAPS: 'CLEAR_MAPS',
    // Audit log
    LOG_EVENT: 'LOG_EVENT',
    CLEAR_AUDIT: 'CLEAR_AUDIT'
};

const reducer = (state, action) => {
    switch (action.type) {
        case ACTIONS.SET_PROJECT:
            return { 
                ...state, 
                project: { ...state.project, ...action.payload },
                currentProjectMeta: { ...state.currentProjectMeta, ...action.payload.meta },
                isDirty: false 
            };
        case ACTIONS.UPDATE_INPUTS:
            return { 
                ...state, 
                inputs: { ...state.inputs, ...action.payload },
                isDirty: true
            };
        case ACTIONS.SET_MODE:
            return { ...state, calcMethod: action.payload }; 
        case ACTIONS.SET_UNIT_SYSTEM:
            return { ...state, unitSystem: action.payload };
        case ACTIONS.SET_INPUT_METHOD:
            return { ...state, inputMethod: action.payload };
        case ACTIONS.ADD_SURFACE:
            const newSurface = action.payload;
            if (!newSurface.id) newSurface.id = crypto.randomUUID();
            return { 
                ...state, 
                surfaces: { ...state.surfaces, [newSurface.id]: newSurface },
                isDirty: true
            };
        case ACTIONS.REMOVE_SURFACE:
            const newSurfaces = { ...state.surfaces };
            delete newSurfaces[action.payload];
            let newInputs = { ...state.inputs };
            if (newInputs.topSurfaceId === action.payload) newInputs.topSurfaceId = null;
            if (newInputs.baseSurfaceId === action.payload) newInputs.baseSurfaceId = null;
            return { ...state, surfaces: newSurfaces, inputs: newInputs, isDirty: true };
        case ACTIONS.SET_TOP_SURFACE:
            return { 
                ...state, 
                inputs: { ...state.inputs, topSurfaceId: action.payload },
                isDirty: true
            };
        case ACTIONS.SET_BASE_SURFACE:
            return { 
                ...state, 
                inputs: { ...state.inputs, baseSurfaceId: action.payload },
                isDirty: true
            };
        case ACTIONS.SET_RESULTS:
            return { 
                ...state, 
                results: action.payload, 
                // Store deterministic results and corresponding inputs in baseCase 
                baseCase: { inputs: { ...state.inputs }, results: action.payload },
                isCalculating: false, 
                error: action.payload?.error || null 
            };
        case ACTIONS.SET_PROB_RESULTS:
            return { ...state, probResults: action.payload, isCalculating: false, error: null };
        case ACTIONS.SET_CALCULATING:
            return { ...state, isCalculating: action.payload };
        case ACTIONS.SET_ERROR:
            return { ...state, error: action.payload, isCalculating: false };
        case ACTIONS.MARK_DIRTY:
            return { ...state, isDirty: true };
        case ACTIONS.SET_PROJECTS:
            return { ...state, projects: action.payload };
        case ACTIONS.LOAD_PROJECT: {
            const p = action.payload;
            const det = { ...initialState.inputs, ...(p.inputs?.deterministic || {}) };
            const surfaces = (p.inputs?.surfaces || []).reduce((m, s) => {
                if (s && s.id) m[s.id] = s;
                return m;
            }, {});
            return {
                ...state,
                inputs: det,
                surfaces,
                aois: p.inputs?.polygons || [],
                activeAoiId: null,
                drawing: { isActive: false, currentPoints: [] },
                maps: p.inputs?.maps || [],
                unitSystem: p.unitSystem || 'field',
                calcMethod: p.calcMethod || 'deterministic',
                inputMethod: p.inputMethod || 'simple',
                reservoirName: p.reservoirName || '',
                auditTrail: p.auditTrail || [],
                results: p.results || null,
                // Restore the saved Monte Carlo study; clear it if the project had none
                // so it can't leak in from the previously-open workspace.
                probResults: p.probResults || null,
                baseCase: p.results ? { inputs: det, results: p.results } : null,
                project: { name: p.name, id: p.id, created_at: p.created_at, version: p.version },
                currentProjectMeta: { name: p.name, description: p.description || '' },
                isDirty: false,
                error: null
            };
        }
        case ACTIONS.NEW_PROJECT:
            return { ...initialState, projects: state.projects };
        case ACTIONS.RESET:
            return initialState;

        // --- AOI drawing ---
        case ACTIONS.START_DRAWING:
            return { ...state, drawing: { isActive: true, currentPoints: [] } };
        case ACTIONS.ADD_DRAWING_POINT:
            if (!state.drawing.isActive) return state;
            return {
                ...state,
                drawing: { ...state.drawing, currentPoints: [...state.drawing.currentPoints, action.payload] }
            };
        case ACTIONS.CANCEL_DRAWING:
            return { ...state, drawing: { isActive: false, currentPoints: [] } };
        case ACTIONS.FINISH_DRAWING: {
            const pts = state.drawing.currentPoints;
            if (!pts || pts.length < 3) {
                return { ...state, drawing: { isActive: false, currentPoints: [] } };
            }
            const aoi = AOIManager.createAOI(action.payload || `AOI ${state.aois.length + 1}`, pts);
            return {
                ...state,
                aois: [...state.aois, aoi],
                activeAoiId: aoi.id,
                drawing: { isActive: false, currentPoints: [] },
                isDirty: true
            };
        }
        case ACTIONS.UPDATE_AOI:
            return {
                ...state,
                aois: state.aois.map(a => a.id === action.payload.id ? { ...a, ...action.payload.changes } : a),
                isDirty: true
            };
        case ACTIONS.DELETE_AOI:
            return {
                ...state,
                aois: state.aois.filter(a => a.id !== action.payload),
                activeAoiId: state.activeAoiId === action.payload ? null : state.activeAoiId,
                isDirty: true
            };
        case ACTIONS.SET_ACTIVE_AOI:
            return { ...state, activeAoiId: action.payload };

        // --- Generated maps ---
        case ACTIONS.ADD_MAPS:
            return { ...state, maps: [...state.maps, ...action.payload], isDirty: true };
        case ACTIONS.DELETE_MAP:
            return { ...state, maps: state.maps.filter(m => m.id !== action.payload), isDirty: true };
        case ACTIONS.CLEAR_MAPS:
            return { ...state, maps: [], isDirty: true };

        // --- Audit log ---
        case ACTIONS.LOG_EVENT:
            return { ...state, auditTrail: [action.payload, ...state.auditTrail].slice(0, MAX_AUDIT) };
        case ACTIONS.CLEAR_AUDIT:
            return { ...state, auditTrail: [] };

        default:
            return state;
    }
};

const ReservoirCalcContext = createContext();

export const ReservoirCalcProvider = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    // Append a real event to the audit trail.
    const logEvent = (actionLabel, details = '') => dispatch({ type: ACTIONS.LOG_EVENT, payload: auditEntry(actionLabel, details) });
    const clearAudit = () => dispatch({ type: ACTIONS.CLEAR_AUDIT });

    const updateInputs = (inputs) => dispatch({ type: ACTIONS.UPDATE_INPUTS, payload: inputs });
    const addSurface = (surface) => {
        dispatch({ type: ACTIONS.ADD_SURFACE, payload: surface });
        logEvent('Surface imported', `${surface?.name || 'surface'} — ${surface?.pointCount ?? surface?.points?.length ?? 0} pts`);
    };
    const deleteSurface = (id) => {
        dispatch({ type: ACTIONS.REMOVE_SURFACE, payload: id });
        logEvent('Surface removed', state.surfaces?.[id]?.name || '');
    };
    const setTopSurface = (id) => dispatch({ type: ACTIONS.SET_TOP_SURFACE, payload: id });
    const setBaseSurface = (id) => dispatch({ type: ACTIONS.SET_BASE_SURFACE, payload: id });
    const setCalcMethod = (mode) => dispatch({ type: ACTIONS.SET_MODE, payload: mode });
    const setUnitSystem = (system) => dispatch({ type: ACTIONS.SET_UNIT_SYSTEM, payload: system });
    const setInputMethod = (method) => dispatch({ type: ACTIONS.SET_INPUT_METHOD, payload: method });
    const setResults = (results) => dispatch({ type: ACTIONS.SET_RESULTS, payload: results });

    // AOI drawing + management
    const startDrawing = () => dispatch({ type: ACTIONS.START_DRAWING });
    const addDrawingPoint = (point) => dispatch({ type: ACTIONS.ADD_DRAWING_POINT, payload: point });
    const cancelDrawing = () => dispatch({ type: ACTIONS.CANCEL_DRAWING });
    const finishDrawing = (name) => {
        dispatch({ type: ACTIONS.FINISH_DRAWING, payload: name });
        logEvent('AOI created', name || `AOI ${(state.aois?.length || 0) + 1}`);
    };
    const addAOI = (aoi) => dispatch({ type: ACTIONS.UPDATE_AOI, payload: { id: aoi.id, changes: aoi } });
    const updateAOI = (id, changes) => dispatch({ type: ACTIONS.UPDATE_AOI, payload: { id, changes } });
    const deleteAOI = (id) => dispatch({ type: ACTIONS.DELETE_AOI, payload: id });
    const setActiveAOI = (id) => dispatch({ type: ACTIONS.SET_ACTIVE_AOI, payload: id });

    // Generated maps
    const addMaps = (maps) => {
        const arr = Array.isArray(maps) ? maps : [maps];
        dispatch({ type: ACTIONS.ADD_MAPS, payload: arr });
        logEvent('Property maps generated', `${arr.length} layer${arr.length === 1 ? '' : 's'}`);
    };
    const deleteMap = (id) => dispatch({ type: ACTIONS.DELETE_MAP, payload: id });
    const clearMaps = () => dispatch({ type: ACTIONS.CLEAR_MAPS });
    const buildProjectData = (userId, meta) => ({
        id: state.project.id || null,
        user_id: userId,
        name: meta?.name || state.currentProjectMeta?.name || state.reservoirName || 'Untitled Project',
        description: meta?.description ?? state.currentProjectMeta?.description ?? '',
        version: state.project.version || 1,
        unitSystem: state.unitSystem,
        calcMethod: state.calcMethod,
        inputMethod: state.inputMethod,
        reservoirName: state.reservoirName,
        inputs: {
            deterministic: state.inputs,
            surfaces: Object.values(state.surfaces || {}),
            polygons: state.aois || [],
            maps: state.maps || []
        },
        results: state.results,
        // Persist the Monte Carlo study so a reloaded project reproduces its P-values
        // and report instead of silently inheriting the previous workspace's results.
        probResults: state.probResults,
        // The audit trail travels with the project (also underpins collaboration handoff).
        auditTrail: (state.auditTrail || []).slice(0, MAX_AUDIT)
    });

    // Persist the current workspace as a project (create or update), then refresh
    // the project list. Throws on failure so the caller can surface a message.
    const saveCurrentProject = async (userId, meta) => {
        if (!userId) throw new Error('Sign in to save projects.');
        const projectData = buildProjectData(userId, meta);
        const saved = await ProjectService.saveProject(projectData, !projectData.id);
        dispatch({
            type: ACTIONS.SET_PROJECT,
            payload: { id: saved.id, version: saved.version, meta: { name: saved.name, description: saved.description } }
        });
        const projects = await ProjectService.getProjects();
        dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
        logEvent('Project saved', `${saved.name} (v${saved.version})`);
        return saved;
    };

    // Export the current workspace (inputs, surfaces, results, audit) as a shareable
    // JSON file — the real handoff mechanism for collaborating with a colleague.
    const exportWorkspace = () => ProjectService.exportToJSON(buildProjectData(null, null));

    const loadProjects = async () => {
        try {
            const projects = await ProjectService.getProjects();
            dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
            return { ok: true };
        } catch (e) {
            dispatch({ type: ACTIONS.SET_PROJECTS, payload: [] });
            return { error: e.message };
        }
    };

    const loadProject = (project) => {
        dispatch({ type: ACTIONS.LOAD_PROJECT, payload: project });
        logEvent('Project loaded', project?.name || '');
    };

    const createNewProject = () => dispatch({ type: ACTIONS.NEW_PROJECT });

    const getActiveSurface = () => {
        const id = state.inputs.topSurfaceId;
        return (state.surfaces && id) ? state.surfaces[id] : null;
    };

    const calculate = async (customProbInputs = null, options = {}) => {
        // Back-compat: older callers passed a boolean `consistencyMode` here.
        const opts = typeof options === 'boolean' ? { consistencyMode: options } : (options || {});
        dispatch({ type: ACTIONS.SET_CALCULATING, payload: true });
        dispatch({ type: ACTIONS.SET_ERROR, payload: null });

        // Grid resolution + interpolation method for the contact-based engine come
        // from user settings.
        const settings = loadSettings();
        const gridResolution = settings.gridResolution;
        const interpolation = settings.interpolationMethod;

        try {
            if (state.calcMethod === 'probabilistic') {
                if (!customProbInputs) {
                    throw new Error("Missing probabilistic distribution inputs.");
                }

                // Structural methods drive GRV from the surface + sampled contacts. Build
                // the hypsometric curve once so each realisation is an O(1) lookup.
                const structural = state.inputMethod === 'hybrid' || state.inputMethod === 'surfaces';
                let hypsometry = null;
                if (structural) {
                    const topSurface = state.surfaces[state.inputs.topSurfaceId];
                    if (!topSurface) throw new Error('Select a Top structural surface before running a probabilistic study in this input method.');
                    const baseSurface = state.inputMethod === 'surfaces' ? state.surfaces[state.inputs.baseSurfaceId] : null;
                    if (state.inputMethod === 'surfaces' && !baseSurface) throw new Error('Select both Top and Base surfaces before running the study.');
                    const activeAoi = (state.aois || []).find(a => a.id === state.activeAoiId) || null;
                    hypsometry = ContactVolumetricsEngine.buildHypsometry({
                        topSurface,
                        baseSurface,
                        constantThickness: state.inputMethod === 'hybrid' ? parseFloat(state.inputs.thickness) : null,
                        unitSystem: state.unitSystem,
                        aoiPolygon: activeAoi,
                        options: { resolution: gridResolution, interpolation }
                    });
                    if (hypsometry?.error) throw new Error(hypsometry.error);
                }

                const config = {
                    fluidType: state.inputs.fluidType,
                    unitSystem: state.unitSystem,
                    iterations: opts.iterations || 10000,
                    correlations: opts.correlations,
                    consistencyMode: opts.consistencyMode,
                    baseCase: state.baseCase,
                    grvMode: structural ? 'structural' : 'analytic',
                    hypsometry,
                    deterministicContacts: { owc: state.inputs.owc, goc: state.inputs.goc }
                };

                const probRes = await MonteCarloEngine.runSimulation(config, customProbInputs);
                dispatch({ type: ACTIONS.SET_PROB_RESULTS, payload: probRes });
                logEvent('Monte Carlo run', `${(config.iterations).toLocaleString()} iterations • ${structural ? 'contact-based GRV' : 'area×thickness'}`);
            } else {
                await new Promise(resolve => setTimeout(resolve, 300));
                // Pass the active AOI so structural (hybrid/surfaces) volumetrics clip
                // to it; the simple method ignores it (no geometry).
                const activeAoi = (state.aois || []).find(a => a.id === state.activeAoiId) || null;
                const results = VolumeCalculationEngine.calculateDeterministic(
                    state.inputs,
                    state.unitSystem,
                    state.inputMethod,
                    state.surfaces,
                    { aoiPolygon: activeAoi, contactOptions: { resolution: gridResolution, interpolation } }
                );

                if (results.error) {
                    throw new Error(results.error);
                }

                dispatch({ type: ACTIONS.SET_RESULTS, payload: results });
                logEvent('Deterministic run', `${state.inputMethod} method • ${results.fluidType || state.inputs.fluidType}`);
            }
        } catch (error) {
            dispatch({ type: ACTIONS.SET_ERROR, payload: error.message });
        }
    };

    const value = useMemo(() => ({
        state,
        dispatch,
        updateInputs,
        addSurface,
        deleteSurface,
        setTopSurface,
        setBaseSurface,
        setCalcMethod,
        setUnitSystem,
        setInputMethod,
        setResults,
        getActiveSurface,
        saveCurrentProject,
        loadProjects,
        loadProject,
        createNewProject,
        exportWorkspace,
        calculate,
        // AOI
        startDrawing,
        addDrawingPoint,
        cancelDrawing,
        finishDrawing,
        addAOI,
        updateAOI,
        deleteAOI,
        setActiveAOI,
        // Maps
        addMaps,
        deleteMap,
        clearMaps,
        // Audit
        logEvent,
        clearAudit
    }), [state]);

    return (
        <ReservoirCalcContext.Provider value={value}>
            {children}
        </ReservoirCalcContext.Provider>
    );
};

export const useReservoirCalc = () => {
    const context = useContext(ReservoirCalcContext);
    if (!context) {
        throw new Error("useReservoirCalc must be used within a ReservoirCalcProvider");
    }
    return context;
};

export default ReservoirCalcContext;