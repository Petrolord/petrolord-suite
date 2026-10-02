import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { makeRegistryBackend } from '../services/backend';
import { useToast } from '@/components/ui/use-toast';
import { useRecordSharing } from '@/lib/recordSharing/useRecordSharing';
import { sharingOf, SHARING_COLUMNS } from '@/lib/recordSharing/rules';

// U2-019: the sharing state a list row carries (owner, visibility, access, check-out, last author)
const sharingFields = (w) => { const s = sharingOf(w) || {}; delete s.id; delete s.updated_at; return s; };

const MultiWellContext = createContext(null);

const initialState = {
    wells: [], // List of well metadata
    wellDataMap: {}, // Map of id -> full data object
    activeWellId: null,
    comparisonMode: false,
    selectedWellsForComparison: [],
    isLoading: false,
    loaded: false, // BF-U1-019: the first list has arrived
};

const multiWellReducer = (state, action) => {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_WELLS':
            // Initialize wellDataMap from fetched wells
            const dataMap = {};
            action.payload.forEach(w => {
                dataMap[w.id] = w;
            });
            return { 
                ...state, 
                loaded: true,
                wells: action.payload.map(w => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    location: w.location_coords || { lat: 0, lng: 0 },
                    updated_at: w.updated_at,
                    ...sharingFields(w),
                })),
                wellDataMap: dataMap
            };
        case 'ADD_WELL_LOCAL': {
            const newWell = action.payload;
            return { 
                ...state, 
                wells: [...state.wells, { 
                    id: newWell.id, 
                    name: newWell.name, 
                    status: newWell.status,
                    updated_at: new Date().toISOString(),
                    ...sharingFields(newWell),
                }],
                wellDataMap: {
                    ...state.wellDataMap,
                    [newWell.id]: newWell
                }
            };
        }
        case 'REMOVE_WELL_LOCAL': {
            const newWellDataMap = { ...state.wellDataMap };
            delete newWellDataMap[action.payload];
            return {
                ...state,
                wells: state.wells.filter(w => w.id !== action.payload),
                wellDataMap: newWellDataMap,
                activeWellId: state.activeWellId === action.payload ? null : state.activeWellId
            };
        }
        case 'SET_ACTIVE_WELL':
            return { ...state, activeWellId: action.payload };
        case 'UPDATE_WELL_LOCAL': {
            const updatedWells = state.wells.map(w => w.id === action.id ? { ...w, ...action.payload, updated_at: new Date().toISOString() } : w);
            const currentData = state.wellDataMap[action.id] || {};
            const updatedWellData = { ...currentData, ...action.payload, updated_at: new Date().toISOString() };
            
            return {
                ...state,
                wells: updatedWells,
                wellDataMap: { ...state.wellDataMap, [action.id]: updatedWellData }
            };
        }
        case 'UPDATE_SHARING_LOCAL': {
            // U2-019: the sharing state moved (share switch, check-out, a save's new
            // version); not an edit of the model, so updated_at is left alone
            const patch = {};
            for (const c of SHARING_COLUMNS) if (c in action.payload && c !== 'updated_at') patch[c] = action.payload[c];
            const current = state.wellDataMap[action.id];
            return {
                ...state,
                wells: state.wells.map(w => (w.id === action.id ? { ...w, ...patch } : w)),
                wellDataMap: current ? { ...state.wellDataMap, [action.id]: { ...current, ...patch } } : state.wellDataMap,
            };
        }
        default:
            return state;
    }
};

export const MultiWellProvider = ({ children, backend = null }) => {
    const [state, dispatch] = useReducer(multiWellReducer, initialState);
    const { toast } = useToast();
    // BF0: one backend object (bf_wells by default; the harness injects the
    // in-memory twin) so the whole app runs without auth or DB in e2e
    const be = useMemo(() => backend || makeRegistryBackend(), [backend]);

    // bf_wells row -> the well data the app edits (BF0 carries erosion
    // events and the model settings, which were dropped before)
    const fromRow = (w) => ({
        ...w,
        location: w.location_coords || { lat: 0, lng: 0 },
        stratigraphy: w.stratigraphy || [],
        heatFlow: w.heat_flow || { type: 'constant', value: 60, history: [] },
        erosionEvents: Array.isArray(w.erosion_events) ? w.erosion_events : [],
        settings: w.settings && typeof w.settings === 'object' ? w.settings : {},
        calibration: w.calibration_data && (w.calibration_data.ro || w.calibration_data.temp)
            // BF-U2-006: the BHT correction choice travels with the points
            ? { ro: w.calibration_data.ro || [], temp: w.calibration_data.temp || [], ...(w.calibration_data.bht ? { bht: w.calibration_data.bht } : {}) }
            : { ro: [], temp: [] },
        scenarios: w.scenarios || []
    });

    // ---- U2-019 organisation sharing (src/lib/recordSharing) -----------------
    // The provider stays mounted, so the check-out of the active model lasts
    // while it is open. A model that is open read-only keeps the user's edits
    // on screen only: the auto-save is skipped, never refused in a loop.
    const activeRow = state.activeWellId ? state.wellDataMap[state.activeWellId] : null;
    const sharing = useRecordSharing({
        store: be.sharing,
        table: 'bf_wells',
        record: activeRow && activeRow.user_id ? activeRow : null,
        onChange: (next) => dispatch({ type: 'UPDATE_SHARING_LOCAL', id: next.id, payload: next }),
    });
    const sharingRef = useRef(sharing); sharingRef.current = sharing;
    const activeIdRef = useRef(state.activeWellId); activeIdRef.current = state.activeWellId;
    // a model whose save was refused (a newer version elsewhere) stops saving until it is reloaded
    const [blocked, setBlocked] = useState({});
    const blockedRef = useRef(blocked); blockedRef.current = blocked;

    const fetchWells = useCallback(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
            const data = await be.listWells();
            // every listed model is loaded whole: saves carry the version read here
            (data || []).forEach((row) => be.sharing?.trackOpened('bf_wells', row));
            setBlocked({});
            const mapped = (data || []).map(fromRow);
            dispatch({ type: 'SET_WELLS', payload: mapped });
            return mapped;
        } catch (error) {
            console.error("Error fetching wells:", error);
            toast({ variant: "destructive", title: "Sync Error", description: error.message || "Could not load wells." });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [be, toast]);

    // Initial Load
    useEffect(() => {
        fetchWells();
    }, [fetchWells]);

    const addWell = useCallback(async (wellData) => {
        try {
            const userId = await be.currentUserId();
            if (!userId) {
                toast({ title: "Authentication Error", description: "Please sign in to create wells.", variant: "destructive" });
                return;
            }
            const newWellId = uuidv4();
            const payload = {
                id: newWellId,
                user_id: userId,
                name: wellData.name || 'New Well',
                status: wellData.status || 'not-started',
                // BF-U1-007: a guided run arrives with its model (it used to overwrite the active one)
                stratigraphy: Array.isArray(wellData.stratigraphy) ? wellData.stratigraphy : [],
                heat_flow: wellData.heatFlow || { type: 'constant', value: 60 },
                erosion_events: Array.isArray(wellData.erosionEvents) ? wellData.erosionEvents : [],
                settings: wellData.settings || {},
                // BF-U2-018: the worked example arrives with its calibration
                calibration_data: wellData.calibration || {},
                // U2-019: "Save a copy" of a shared model brings its saved scenarios
                scenarios: Array.isArray(wellData.scenarios) ? wellData.scenarios : [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            dispatch({ type: 'ADD_WELL_LOCAL', payload: fromRow(payload) });
            await be.insertWell(payload);
            be.sharing?.trackOpened('bf_wells', { id: newWellId, version: 1 });
            if (!wellData.quiet) toast({ title: "Well Created", description: `${payload.name} added.` });
            return newWellId;
        } catch (error) {
            console.error("Error creating well:", error);
            toast({ variant: "destructive", title: "Creation Failed", description: error.message });
        }
    }, [be, toast]);

    const updateWell = useCallback(async (id, updates) => {
        dispatch({ type: 'UPDATE_WELL_LOCAL', id, payload: updates });
        try {
            const dbUpdates = {};
            if (updates.name) dbUpdates.name = updates.name;
            if (updates.status) dbUpdates.status = updates.status;
            if (updates.stratigraphy) dbUpdates.stratigraphy = updates.stratigraphy;
            if (updates.heatFlow) dbUpdates.heat_flow = updates.heatFlow;
            if (updates.erosionEvents) dbUpdates.erosion_events = updates.erosionEvents;
            if (updates.settings) dbUpdates.settings = updates.settings;
            if (updates.calibration) dbUpdates.calibration_data = updates.calibration;
            if (updates.scenarios) dbUpdates.scenarios = updates.scenarios;
            dbUpdates.updated_at = new Date().toISOString();
            if (Object.keys(dbUpdates).length > 1) {
                // U2-019: read-only (shared for viewing, or not taken for editing, or a
                // colleague is editing): the edit stays on screen and is not sent
                const sh = sharingRef.current;
                if (id === activeIdRef.current && sh.sharing && sh.ready && !sh.canWrite) return;
                if (blockedRef.current[id]) return;
                const saved = await be.updateWell(id, dbUpdates, { note: updates.name && Object.keys(dbUpdates).length === 2 ? 'Renamed' : 'Model saved' });
                if (saved && typeof saved === 'object') dispatch({ type: 'UPDATE_SHARING_LOCAL', id, payload: saved });
            }
        } catch (error) {
            if (error?.name === 'RecordConflict') {
                // said once, then the model stops saving until it is reloaded
                setBlocked((b) => ({ ...b, [id]: error.message }));
                toast({ variant: "destructive", title: "Not saved", description: error.message, duration: 10000 });
                return;
            }
            console.error("Error updating well:", error);
            toast({ variant: "destructive", title: "Save Failed", description: error.message || "Changes might not be persisted." });
        }
    }, [be, toast]);

    const removeWell = useCallback(async (id) => {
        dispatch({ type: 'REMOVE_WELL_LOCAL', payload: id });
        try {
            await be.deleteWell(id);
            toast({ title: "Well Deleted", description: "Well removed." });
        } catch (error) {
            console.error("Error deleting well:", error);
            toast({ variant: "destructive", title: "Deletion Failed", description: error.message });
        }
    }, [be, toast]);

    const saveWellData = useCallback((id, data) => {
        updateWell(id, data);
    }, [updateWell]);

    const getWellData = useCallback((id) => state.wellDataMap[id], [state.wellDataMap]);
    const setActiveWell = useCallback((id) => dispatch({ type: 'SET_ACTIVE_WELL', payload: id }), []);

    return (
        <MultiWellContext.Provider value={{
            state,
            backend: be,
            addWell,
            removeWell,
            setActiveWell,
            updateWell,
            saveWellData,
            getWellData,
            fetchWells,
            // U2-019: the active model's sharing state and why a save is on hold
            sharing,
            saveBlocked: state.activeWellId ? blocked[state.activeWellId] || null : null,
        }}>
            {children}
        </MultiWellContext.Provider>
    );
};

export const useMultiWell = () => {
    const context = useContext(MultiWellContext);
    if (!context) throw new Error('useMultiWell must be used within MultiWellProvider');
    return context;
};
