import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { makeRegistryBackend } from '../services/backend';
import { useToast } from '@/components/ui/use-toast';

const MultiWellContext = createContext(null);

const initialState = {
    wells: [], // List of well metadata
    wellDataMap: {}, // Map of id -> full data object
    activeWellId: null,
    comparisonMode: false,
    selectedWellsForComparison: [],
    isLoading: false
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
                wells: action.payload.map(w => ({
                    id: w.id,
                    name: w.name,
                    status: w.status,
                    location: w.location_coords || { lat: 0, lng: 0 },
                    updated_at: w.updated_at
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
                    updated_at: new Date().toISOString()
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
            ? { ro: w.calibration_data.ro || [], temp: w.calibration_data.temp || [] }
            : { ro: [], temp: [] },
        scenarios: w.scenarios || []
    });

    const fetchWells = useCallback(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
            const data = await be.listWells();
            dispatch({ type: 'SET_WELLS', payload: (data || []).map(fromRow) });
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
                stratigraphy: [],
                heat_flow: { type: 'constant', value: 60 },
                erosion_events: [],
                settings: {},
                calibration_data: {},
                scenarios: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            dispatch({ type: 'ADD_WELL_LOCAL', payload: fromRow(payload) });
            await be.insertWell(payload);
            toast({ title: "Well Created", description: `${payload.name} added.` });
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
                await be.updateWell(id, dbUpdates);
            }
        } catch (error) {
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
            fetchWells
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
