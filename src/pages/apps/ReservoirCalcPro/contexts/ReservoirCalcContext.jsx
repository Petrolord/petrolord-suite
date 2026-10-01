import React, { createContext, useContext, useReducer, useMemo, useEffect, useRef, useState } from 'react';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { runMonteCarlo, newSeed } from '../services/mcClient';
import { ProjectService } from '../services/ProjectService';
import { makeRegistryRcpBackend } from '../services/rcpBackend';
import { AOIManager } from '../services/AOIManager';
import { loadSettings } from '../hooks/useReservoirSettings';
import { defaultInputUnits, convertInputsOnSystemChange } from '../services/unitsCatalog';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { runSignature } from '../services/volumeDisplay';
import { checkAreaDepthRows, areaDepthHypsometry } from '../services/areaDepth';

// Families that decide RCP's system from the Suite unit profile
const RCP_PROFILE_FAMILIES = ['area', 'rockVolume', 'depth'];

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

    // Per-field DISPLAY units for the analytic inputs (area, thickness, bg,
    // pressure, temperature). state.inputs values stay canonical; the UI
    // converts at the boundary (see services/unitsCatalog.js).
    inputUnits: defaultInputUnits('field'),

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
        goc: -7000,
        // Gas-cap GRV fraction for the analytic (simple) oil+gas split; structural
        // methods derive the split from the GOC instead.
        gasCapFraction: null,
        // Condensate-gas ratio (STB/MMscf field, sm³ per 10⁶ sm³ metric);
        // empty means no condensate stream (RCP-U1-017)
        cgr: null
    },
    
    surfaces: {},

    // Saved reservoir cases within the current project. Each entry is a full
    // workspace snapshot (inputs, surfaces, results, …) so one project can hold
    // several reservoirs that are revisited or recomputed independently. The
    // workspace always edits the ACTIVE reservoir; switching folds the current
    // workspace back into its entry first, so nothing is lost.
    reservoirs: [],
    activeReservoirId: null,

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

// The per-reservoir slice of the workspace: everything that belongs to one
// reservoir case, as opposed to project metadata or the project list.
const captureReservoirSnapshot = (state) => ({
    inputs: state.inputs,
    surfaces: state.surfaces,
    aois: state.aois,
    maps: state.maps,
    unitSystem: state.unitSystem,
    inputUnits: state.inputUnits,
    calcMethod: state.calcMethod,
    inputMethod: state.inputMethod,
    results: state.results,
    probResults: state.probResults,
    baseCase: state.baseCase,
    updated_at: new Date().toISOString(),
});

const applyReservoirSnapshot = (state, snap) => ({
    ...state,
    inputs: snap.inputs || { ...initialState.inputs },
    surfaces: snap.surfaces || {},
    aois: snap.aois || [],
    maps: snap.maps || [],
    unitSystem: snap.unitSystem || 'field',
    inputUnits: { ...defaultInputUnits(snap.unitSystem || 'field'), ...(snap.inputUnits || {}) },
    calcMethod: snap.calcMethod || 'deterministic',
    inputMethod: snap.inputMethod || 'simple',
    results: snap.results || null,
    probResults: snap.probResults || null,
    baseCase: snap.baseCase || (snap.results ? { inputs: snap.inputs, results: snap.results } : null),
    activeAoiId: null,
    drawing: { isActive: false, currentPoints: [] },
    error: null,
});

const newReservoirId = () => (crypto.randomUUID && crypto.randomUUID()) || `res-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Fold the live workspace into the active reservoir entry (creating one when
// the list is still empty), so the list always reflects what is on screen.
const foldWorkspace = (state) => {
    const snap = captureReservoirSnapshot(state);
    const name = state.reservoirName || 'Reservoir 1';
    if (!state.reservoirs.length) {
        const id = state.activeReservoirId || newReservoirId();
        return { reservoirs: [{ id, name, ...snap }], activeReservoirId: id };
    }
    const exists = state.reservoirs.some(r => r.id === state.activeReservoirId);
    if (!exists) {
        const id = newReservoirId();
        return { reservoirs: [...state.reservoirs, { id, name, ...snap }], activeReservoirId: id };
    }
    return {
        reservoirs: state.reservoirs.map(r => r.id === state.activeReservoirId ? { ...r, ...snap } : r),
        activeReservoirId: state.activeReservoirId,
    };
};

const ACTIONS = {
    SET_PROJECT: 'SET_PROJECT',
    UPDATE_INPUTS: 'UPDATE_INPUTS',
    ADD_SURFACE: 'ADD_SURFACE',
    REMOVE_SURFACE: 'REMOVE_SURFACE',
    SET_TOP_SURFACE: 'SET_TOP_SURFACE',
    SET_BASE_SURFACE: 'SET_BASE_SURFACE',
    SET_RESULTS: 'SET_RESULTS',
    ADD_AOI: 'ADD_AOI',
    SET_PROB_RESULTS: 'SET_PROB_RESULTS',
    SET_CALCULATING: 'SET_CALCULATING',
    SET_ERROR: 'SET_ERROR',
    RESET: 'RESET',
    SET_MODE: 'SET_MODE',
    SET_UNIT_SYSTEM: 'SET_UNIT_SYSTEM',
    SET_INPUT_UNIT: 'SET_INPUT_UNIT',
    SET_INPUT_METHOD: 'SET_INPUT_METHOD',
    MARK_DIRTY: 'MARK_DIRTY',
    SET_PROJECTS: 'SET_PROJECTS',
    LOAD_PROJECT: 'LOAD_PROJECT',
    NEW_PROJECT: 'NEW_PROJECT',
    ADOPT_UNIT_SYSTEM: 'ADOPT_UNIT_SYSTEM',
    // Multi-reservoir cases within a project
    ADD_RESERVOIR: 'ADD_RESERVOIR',
    SWITCH_RESERVOIR: 'SWITCH_RESERVOIR',
    RENAME_RESERVOIR: 'RENAME_RESERVOIR',
    DELETE_RESERVOIR: 'DELETE_RESERVOIR',
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
        case ACTIONS.SET_UNIT_SYSTEM: {
            if (action.payload === state.unitSystem) return state;
            // Convert the stored case so toggling Field↔Metric preserves the
            // physical reservoir instead of reinterpreting 5000 acres as 5000 km².
            return {
                ...state,
                unitSystem: action.payload,
                inputs: convertInputsOnSystemChange(state.inputs, state.unitSystem, action.payload),
                inputUnits: defaultInputUnits(action.payload),
                isDirty: true
            };
        }
        case ACTIONS.ADOPT_UNIT_SYSTEM: {
            // Suite unit profile: a blank, unsaved workspace takes the
            // profile's system. Same conversion as a toggle, but nothing the
            // user did changed, so the workspace stays clean.
            if (action.payload === state.unitSystem || state.project?.id || state.isDirty) return state;
            return {
                ...state,
                unitSystem: action.payload,
                inputs: convertInputsOnSystemChange(state.inputs, state.unitSystem, action.payload),
                inputUnits: defaultInputUnits(action.payload),
            };
        }
        case ACTIONS.SET_INPUT_UNIT:
            // Display-unit change only — the canonical stored value is untouched.
            return {
                ...state,
                inputUnits: { ...state.inputUnits, [action.payload.field]: action.payload.unit }
            };
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
            const projectFields = {
                reservoirName: p.reservoirName || '',
                auditTrail: p.auditTrail || [],
                project: { name: p.name, id: p.id, created_at: p.created_at, version: p.version },
                currentProjectMeta: { name: p.name, description: p.description || '' },
                isDirty: false,
            };

            // Reservoir-aware project: restore the reservoir list and open the
            // last active one (falling back to the first).
            if (Array.isArray(p.reservoirs) && p.reservoirs.length) {
                const active = p.reservoirs.find(r => r.id === p.activeReservoirId) || p.reservoirs[0];
                // Legacy blobs stored surfaces as an array inside inputs; reservoir
                // snapshots keep the workspace map shape.
                return {
                    ...applyReservoirSnapshot(state, active),
                    ...projectFields,
                    reservoirs: p.reservoirs,
                    activeReservoirId: active.id,
                    reservoirName: active.name || projectFields.reservoirName,
                };
            }

            // Legacy single-reservoir project: materialise its contents as the
            // one and only reservoir entry.
            const det = { ...initialState.inputs, ...(p.inputs?.deterministic || {}) };
            const surfaces = (p.inputs?.surfaces || []).reduce((m, s) => {
                if (s && s.id) m[s.id] = s;
                return m;
            }, {});
            const legacyId = newReservoirId();
            const legacySnap = {
                inputs: det,
                surfaces,
                aois: p.inputs?.polygons || [],
                maps: p.inputs?.maps || [],
                unitSystem: p.unitSystem || 'field',
                inputUnits: p.inputUnits || null,
                calcMethod: p.calcMethod || 'deterministic',
                inputMethod: p.inputMethod || 'simple',
                results: p.results || null,
                // Restore the saved Monte Carlo study; clear it if the project had none
                // so it can't leak in from the previously-open workspace.
                probResults: p.probResults || null,
                baseCase: p.results ? { inputs: det, results: p.results } : null,
            };
            const legacyName = p.reservoirName || 'Reservoir 1';
            return {
                ...applyReservoirSnapshot(state, legacySnap),
                ...projectFields,
                reservoirs: [{ id: legacyId, name: legacyName, ...legacySnap }],
                activeReservoirId: legacyId,
                reservoirName: legacyName,
            };
        }
        case ACTIONS.NEW_PROJECT:
            return { ...initialState, projects: state.projects };

        // --- Multi-reservoir cases ---
        case ACTIONS.ADD_RESERVOIR: {
            const folded = foldWorkspace(state);
            const id = newReservoirId();
            const name = action.payload || `Reservoir ${folded.reservoirs.length + 1}`;
            const blank = {
                inputs: { ...initialState.inputs },
                surfaces: {},
                aois: [],
                maps: [],
                unitSystem: state.unitSystem,
                inputUnits: defaultInputUnits(state.unitSystem),
                calcMethod: 'deterministic',
                inputMethod: 'simple',
                results: null,
                probResults: null,
                baseCase: null,
            };
            return {
                ...applyReservoirSnapshot(state, blank),
                reservoirs: [...folded.reservoirs, { id, name, ...blank, updated_at: new Date().toISOString() }],
                activeReservoirId: id,
                reservoirName: name,
                isDirty: true,
            };
        }
        case ACTIONS.SWITCH_RESERVOIR: {
            if (action.payload === state.activeReservoirId) return state;
            const folded = foldWorkspace(state);
            const target = folded.reservoirs.find(r => r.id === action.payload);
            if (!target) return { ...state, ...folded };
            return {
                ...applyReservoirSnapshot(state, target),
                reservoirs: folded.reservoirs,
                activeReservoirId: target.id,
                reservoirName: target.name || '',
                isDirty: true,
            };
        }
        case ACTIONS.RENAME_RESERVOIR: {
            const { id, name } = action.payload;
            const folded = foldWorkspace(state);
            const targetId = id || folded.activeReservoirId;
            return {
                ...state,
                reservoirs: folded.reservoirs.map(r => r.id === targetId ? { ...r, name } : r),
                activeReservoirId: folded.activeReservoirId,
                reservoirName: targetId === folded.activeReservoirId ? name : state.reservoirName,
                isDirty: true,
            };
        }
        case ACTIONS.DELETE_RESERVOIR: {
            const folded = foldWorkspace(state);
            const remaining = folded.reservoirs.filter(r => r.id !== action.payload);
            if (remaining.length === folded.reservoirs.length) return { ...state, ...folded };
            if (action.payload !== folded.activeReservoirId) {
                return { ...state, reservoirs: remaining, activeReservoirId: folded.activeReservoirId, isDirty: true };
            }
            // Deleting the open reservoir: fall back to the first remaining one,
            // or start a fresh blank case when it was the last.
            if (remaining.length) {
                const next = remaining[0];
                return {
                    ...applyReservoirSnapshot(state, next),
                    reservoirs: remaining,
                    activeReservoirId: next.id,
                    reservoirName: next.name || '',
                    isDirty: true,
                };
            }
            const id = newReservoirId();
            const blank = { inputs: { ...initialState.inputs }, surfaces: {}, aois: [], maps: [], unitSystem: state.unitSystem, inputUnits: defaultInputUnits(state.unitSystem), calcMethod: 'deterministic', inputMethod: 'simple', results: null, probResults: null, baseCase: null };
            return {
                ...applyReservoirSnapshot(state, blank),
                reservoirs: [{ id, name: 'Reservoir 1', ...blank, updated_at: new Date().toISOString() }],
                activeReservoirId: id,
                reservoirName: 'Reservoir 1',
                isDirty: true,
            };
        }
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
        case ACTIONS.ADD_AOI:
            return { ...state, aois: [...(state.aois || []), action.payload], activeAoiId: action.payload.id, isDirty: true };
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

export const ReservoirCalcProvider = ({ children, backend = null, appPaths = {} }) => {
    // RC0: every read or write outside the app's own state goes through
    // one backend object (registry by default; the harness injects an
    // in-memory pair) so the whole app runs without auth or DB in e2e
    const be = useMemo(() => backend || makeRegistryRcpBackend(), [backend]);
    const [state, dispatch] = useReducer(reducer, initialState);
    // U2-006: Monte Carlo progress (0 to 1, null when idle) and the
    // controller that cancels the running worker
    const [mcProgress, setMcProgress] = useState(null);
    const mcAbortRef = useRef(null);
    const cancelSimulation = () => { mcAbortRef.current?.abort(); };

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
    const setUnitSystem = (system) => { unitPickedRef.current = true; dispatch({ type: ACTIONS.SET_UNIT_SYSTEM, payload: system }); };
    // Suite unit profile: NEW projects start from the profile's system;
    // an opened (saved) project keeps its own, and so does a workspace the
    // user has already changed or switched by hand
    const profileUnitSystem = useProfileSystem('rcp', RCP_PROFILE_FAMILIES);
    const unitPickedRef = useRef(false);
    useEffect(() => {
        if (!profileUnitSystem || unitPickedRef.current) return;
        dispatch({ type: ACTIONS.ADOPT_UNIT_SYSTEM, payload: profileUnitSystem });
    }, [profileUnitSystem, state.project?.id, state.isDirty, state.unitSystem]);
    const setInputUnit = (field, unit) => dispatch({ type: ACTIONS.SET_INPUT_UNIT, payload: { field, unit } });
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
    // RC1: UPDATE_AOI only edits an existing AOI, so this used to be a
    // silent no-op for a new one; ADD_AOI appends it and makes it active
    const addAOI = (aoi) => dispatch({ type: ACTIONS.ADD_AOI, payload: aoi });
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
    const buildProjectData = (userId, meta) => {
        // Fold the live workspace into its reservoir entry so every reservoir in
        // the project persists with its latest inputs and results.
        const folded = foldWorkspace(state);
        return {
            id: state.project.id || null,
            user_id: userId,
            name: meta?.name || state.currentProjectMeta?.name || state.reservoirName || 'Untitled Project',
            description: meta?.description ?? state.currentProjectMeta?.description ?? '',
            version: state.project.version || 1,
            unitSystem: state.unitSystem,
            inputUnits: state.inputUnits,
            calcMethod: state.calcMethod,
            inputMethod: state.inputMethod,
            reservoirName: state.reservoirName,
            // Legacy top-level fields mirror the ACTIVE reservoir so older readers
            // and exports keep working; the full multi-reservoir set lives below.
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
            reservoirs: folded.reservoirs,
            activeReservoirId: folded.activeReservoirId,
            // The audit trail travels with the project (also underpins collaboration handoff).
            auditTrail: (state.auditTrail || []).slice(0, MAX_AUDIT)
        };
    };

    // Persist the current workspace as a project (create or update), then refresh
    // the project list. Throws on failure so the caller can surface a message.
    const saveCurrentProject = async (userId, meta) => {
        if (!userId) throw new Error('Sign in to save projects.');
        const projectData = buildProjectData(userId, meta);
        const saved = await be.projects.saveProject(projectData, !projectData.id);
        dispatch({
            type: ACTIONS.SET_PROJECT,
            payload: { id: saved.id, version: saved.version, meta: { name: saved.name, description: saved.description } }
        });
        const projects = await be.projects.getProjects();
        dispatch({ type: ACTIONS.SET_PROJECTS, payload: projects });
        logEvent('Project saved', `${saved.name} (v${saved.version})`);
        return saved;
    };

    // Export the current workspace (inputs, surfaces, results, audit) as a shareable
    // JSON file — the real handoff mechanism for collaborating with a colleague.
    const exportWorkspace = () => be.projects.exportToJSON(buildProjectData(null, null));

    const loadProjects = async () => {
        try {
            const projects = await be.projects.getProjects();
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

    const createNewProject = () => {
        unitPickedRef.current = false; // a new project starts from the Suite units again
        dispatch({ type: ACTIONS.NEW_PROJECT });
        logEvent('New project started');
    };

    // Multi-reservoir cases within the open project.
    const addReservoir = (name) => {
        dispatch({ type: ACTIONS.ADD_RESERVOIR, payload: name });
        logEvent('Reservoir added', name || '');
    };
    const switchReservoir = (id) => {
        const target = (state.reservoirs || []).find(r => r.id === id);
        dispatch({ type: ACTIONS.SWITCH_RESERVOIR, payload: id });
        if (target) logEvent('Reservoir opened', target.name || '');
    };
    const renameReservoir = (id, name) => dispatch({ type: ACTIONS.RENAME_RESERVOIR, payload: { id, name } });
    const deleteReservoir = (id) => {
        const target = (state.reservoirs || []).find(r => r.id === id);
        dispatch({ type: ACTIONS.DELETE_RESERVOIR, payload: id });
        logEvent('Reservoir deleted', target?.name || '');
    };

    const getActiveSurface = () => {
        const id = state.inputs.topSurfaceId;
        return (state.surfaces && id) ? state.surfaces[id] : null;
    };

    const calculate = async (customProbInputs = null, options = {}) => {
        // Back-compat: older callers passed a boolean `consistencyMode` here.
        const opts = typeof options === 'boolean' ? { consistencyMode: options } : (options || {});
        // SET_ERROR clears isCalculating, so it goes first (U2-006: the run
        // is now long enough in the worker for the order to show)
        dispatch({ type: ACTIONS.SET_ERROR, payload: null });
        dispatch({ type: ACTIONS.SET_CALCULATING, payload: true });

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
                const structural = state.inputMethod === 'hybrid' || state.inputMethod === 'surfaces' || state.inputMethod === 'areadepth';
                let hypsometry = null;
                if (state.inputMethod === 'areadepth') {
                    // U2-001: the table is the hypsometry
                    const chk = checkAreaDepthRows(state.inputs.areaDepth?.rows || []);
                    if (!chk.ok) throw new Error(`Area/depth table: ${chk.reason}`);
                    hypsometry = areaDepthHypsometry(chk.rows, {
                        unitSystem: state.unitSystem,
                        thickness: chk.hasBase ? null : parseFloat(state.inputs.thickness),
                        spill: state.inputs.areaDepth?.spill ?? null,
                    });
                } else if (structural) {
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
                    gasCapFraction: state.inputs.gasCapFraction,
                    // U1: deterministic recovery factors when the panel sends no
                    // distribution for them, and the workspace signature the run
                    // is stamped with (stale detection, RCP-U1-028)
                    recovery: state.inputs.recovery,
                    recoveryGas: state.inputs.recoveryGas,
                    signature: runSignature(state),
                    // U2-006: every run is seeded and records its seed, so
                    // the same inputs and seed give the same realizations
                    seed: Number.isFinite(opts.seed) ? opts.seed : newSeed(),
                    hypsometry,
                    deterministicContacts: { owc: state.inputs.owc, goc: state.inputs.goc }
                };

                const ctrl = new AbortController();
                mcAbortRef.current = ctrl;
                setMcProgress(0);
                let probRes;
                try {
                    probRes = await runMonteCarlo(config, customProbInputs, { onProgress: setMcProgress, signal: ctrl.signal });
                } catch (e) {
                    if (e?.cancelled) {
                        dispatch({ type: ACTIONS.SET_CALCULATING, payload: false });
                        logEvent('Monte Carlo cancelled', `${(config.iterations).toLocaleString()} iterations requested; the previous results were kept`);
                        return { cancelled: true };
                    }
                    throw e;
                } finally {
                    mcAbortRef.current = null;
                    setMcProgress(null);
                }
                dispatch({ type: ACTIONS.SET_PROB_RESULTS, payload: probRes });
                logEvent('Monte Carlo run', `${(config.iterations).toLocaleString()} iterations, seed ${config.seed}, ${structural ? 'contact-based GRV' : 'area x thickness'}${probRes.meta?.ranIn === 'worker' ? ' (background worker)' : ''}`);
                return { ok: true };
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
        backend: be,
        // RC3: route overrides for the launchers out (the harness points
        // them at the /dev/* apps so e2e stays in the authless world)
        appPaths,
        state,
        dispatch,
        updateInputs,
        addSurface,
        deleteSurface,
        setTopSurface,
        setBaseSurface,
        setCalcMethod,
        setUnitSystem,
        profileUnitSystem,
        setInputUnit,
        setInputMethod,
        setResults,
        getActiveSurface,
        saveCurrentProject,
        loadProjects,
        loadProject,
        createNewProject,
        addReservoir,
        switchReservoir,
        renameReservoir,
        deleteReservoir,
        exportWorkspace,
        calculate,
        mcProgress,
        cancelSimulation,
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
    }), [state, profileUnitSystem, mcProgress]); // eslint-disable-line react-hooks/exhaustive-deps

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