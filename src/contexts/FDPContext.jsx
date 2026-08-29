// FDP Accelerator state (Economics E3 slim rebuild).
//
// What this context used to be. Its live state was SEEDED FROM MOCK DATA:
// a mock team with mock comments and notifications, mock workflow tasks,
// approvals and an audit log, mock training courses, mock FAQs and articles.
// A user opening the app met other people's names and a project history that
// never happened. Those slices, and the modules that displayed them, are
// gone.
//
// What is left is the plan itself: field, subsurface, concepts, scenarios,
// wells, facilities, schedule, costs and economics, HSE, community, risks and
// the generated document.
//
// Persistence. The plan lived only in this browser's localStorage, so it was
// lost with the cache and invisible from any other machine. Named plans now
// save to Supabase (`saved_fdp_projects`, owner-scoped RLS) through the
// shared studio-kit persistence. The localStorage draft is kept deliberately
// as a scratch buffer, so a refresh does not lose work in progress even
// before a plan has been named or while signed out.
import React, {
  createContext, useContext, useReducer, useEffect, useCallback, useMemo,
} from 'react';
import { DataValidator } from '@/services/fdp/DataValidator';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';

const TABLE = 'saved_fdp_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save development plans.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'e3_fdp_persistence');

/** The sections that make up a plan; everything else is UI state. */
export const PLAN_SECTIONS = [
  'meta', 'fieldData', 'subsurface', 'concepts', 'scenarios', 'wells',
  'facilities', 'schedule', 'costs', 'economics', 'hseData', 'communityData',
  'risks',
];

const DRAFT_KEY = 'fdp_project_temp';

// Initial State
const initialState = {
    meta: {
        id: null,
        name: "New Field Development Plan",
        status: "draft",
        version: "1.0.0",
        lastModified: new Date().toISOString(),
        author: "CurrentUser",
        mode: "expert",
    },
    navigation: {
        activeTab: "overview",
        sidebarCollapsed: false,
        rightPanelOpen: true,
        currentStep: 0,
    },
    fieldData: {
        fieldName: "",
        location: { lat: 0, lng: 0, name: "" },
        country: "",
        region: "",
        assetType: "Offshore",
        waterDepth: 0,
        fieldArea: 0,
        status: "Appraisal",
        operator: "",
        description: "",
        dates: { discovery: "", appraisal: "", firstOil: "", plateauStart: "", plateauEnd: "", abandonment: "" },
        stakeholders: [], 
        objectives: [], 
        partnerReqs: [], 
        regulatoryConstraints: []
    },
    subsurface: {
        reserves: { 
            summary: { p10: 0, p50: 0, p90: 0, unit: "MMbbl", rf: 0 },
            breakdown: []
        },
        properties: { zones: [] },
        pressureTemp: {
            gradient: 0.45,
            temperatureGradient: 1.2,
            datumDepth: 0,
            datumPressure: 0,
            dataPoints: []
        },
        geomech: {
            fractureGradient: 0,
            porePressureGradient: 0,
            mudWindow: { min: 0, max: 0 }
        },
        fluidProps: { type: "oil", api: 35, gor: 500, viscosity: 0.5 },
        risks: [] 
    },
    concepts: {
        list: [], 
        selectedId: null,
        comparisonIds: []
    },
    scenarios: {
        list: [], 
        selectedId: null
    },
    wells: {
        list: [], 
        drillingSchedule: [],
        rigs: 1,
        rigRate: 250000,
        strategy: 'Sequential', 
        risks: []
    },
    facilities: {
        list: [], 
        selectedId: null,
        exportMethod: "Pipeline",
        constraints: []
    },
    schedule: {
        activities: [],
        baseline: [],
        criticalPath: [],
        risks: [],
        settings: { workWeek: 7 }
    },
    costs: {
        items: [],
        settings: { currency: 'USD', escalation: 2.5, contingency: 10 }
    },
    economics: {
        priceDeck: [],
        capex: 0,
        opex: 0,
        npv: 0,
        irr: 0,
        oilPrice: 75,
        royalty: 0,
        tax: 0
    },
    hseData: {
        policy: "",
        safetySystem: "ISO 45001",
        envSystem: "ISO 14001",
        hazards: [],
        controls: [],
        emergency: "",
        training: "",
        incidents: [],
        kpis: [],
        compliance: [],
        certifications: []
    },
    communityData: {
        strategy: "Proactive Engagement",
        stakeholders: [],
        concerns: [],
        activities: [],
        benefits: [],
        employment: { localContentTarget: 40 },
        impactAssessment: "",
        grievances: [],
        monitoring: "",
        relationships: []
    },
    dataManagement: {
        importStatus: {}, 
        validationStatus: { isValid: true, errors: [], warnings: [] },
        syncHistory: []
    },
    risks: [], 
    notifications: [],
    isLoading: false,
    error: null
};

// Action Types
const ACTIONS = {
    SET_PROJECT_META: 'SET_PROJECT_META',
    SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
    TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
    TOGGLE_RIGHT_PANEL: 'TOGGLE_RIGHT_PANEL',
    SET_GUIDED_STEP: 'SET_GUIDED_STEP',
    UPDATE_FIELD_DATA: 'UPDATE_FIELD_DATA',
    UPDATE_SUBSURFACE: 'UPDATE_SUBSURFACE',
    UPDATE_CONCEPTS: 'UPDATE_CONCEPTS',
    UPDATE_SCENARIOS: 'UPDATE_SCENARIOS',
    UPDATE_WELLS: 'UPDATE_WELLS',
    UPDATE_FACILITIES: 'UPDATE_FACILITIES',
    UPDATE_SCHEDULE: 'UPDATE_SCHEDULE',
    UPDATE_COSTS: 'UPDATE_COSTS', 
    UPDATE_ECONOMICS: 'UPDATE_ECONOMICS',
    UPDATE_HSE: 'UPDATE_HSE',
    UPDATE_COMMUNITY: 'UPDATE_COMMUNITY',
    UPDATE_DATA_MANAGEMENT: 'UPDATE_DATA_MANAGEMENT',
    UPDATE_RISKS: 'UPDATE_RISKS', 
    ADD_RISK: 'ADD_RISK',
    SET_LOADING: 'SET_LOADING',
    SET_ERROR: 'SET_ERROR',
    SET_MODE: 'SET_MODE',
};

// Reducer
const fdpReducer = (state, action) => {
    switch (action.type) {
        case ACTIONS.SET_PROJECT_META:
            return { ...state, meta: { ...state.meta, ...action.payload } };
        case ACTIONS.SET_ACTIVE_TAB:
            return { ...state, navigation: { ...state.navigation, activeTab: action.payload } };
        case ACTIONS.TOGGLE_SIDEBAR:
            return { ...state, navigation: { ...state.navigation, sidebarCollapsed: !state.navigation.sidebarCollapsed } };
        case ACTIONS.TOGGLE_RIGHT_PANEL:
            return { ...state, navigation: { ...state.navigation, rightPanelOpen: !state.navigation.rightPanelOpen } };
        case ACTIONS.SET_GUIDED_STEP:
            return { ...state, navigation: { ...state.navigation, currentStep: action.payload } };
        case ACTIONS.UPDATE_FIELD_DATA: {
            const newFieldData = { ...state.fieldData, ...action.payload };
            const validation = DataValidator.validateFieldOverview(newFieldData);
            return { 
                ...state, 
                fieldData: newFieldData,
                dataManagement: { ...state.dataManagement, validationStatus: validation }
            };
        }
        case ACTIONS.UPDATE_SUBSURFACE:
            return { ...state, subsurface: { ...state.subsurface, ...action.payload } };
        case ACTIONS.UPDATE_CONCEPTS:
            return { ...state, concepts: { ...state.concepts, ...action.payload } };
        case ACTIONS.UPDATE_SCENARIOS:
            return { ...state, scenarios: { ...state.scenarios, ...action.payload } };
        case ACTIONS.UPDATE_WELLS:
            return { ...state, wells: { ...state.wells, ...action.payload } };
        case ACTIONS.UPDATE_FACILITIES:
            return { ...state, facilities: { ...state.facilities, ...action.payload } };
        case ACTIONS.UPDATE_SCHEDULE:
            return { ...state, schedule: { ...state.schedule, ...action.payload } };
        case ACTIONS.UPDATE_COSTS:
            return { ...state, costs: { ...state.costs, ...action.payload } };
        case ACTIONS.UPDATE_ECONOMICS:
            return { ...state, economics: { ...state.economics, ...action.payload } };
        case ACTIONS.UPDATE_HSE:
            return { ...state, hseData: { ...state.hseData, ...action.payload } };
        case ACTIONS.UPDATE_COMMUNITY:
            return { ...state, communityData: { ...state.communityData, ...action.payload } };
        case ACTIONS.UPDATE_DATA_MANAGEMENT:
            return { ...state, dataManagement: { ...state.dataManagement, ...action.payload } };
        case ACTIONS.UPDATE_RISKS: 
            return { ...state, risks: action.payload };
        case ACTIONS.ADD_RISK: 
            return { ...state, risks: [...state.risks, action.payload] };
        case ACTIONS.SET_LOADING:
            return { ...state, isLoading: action.payload };
        case ACTIONS.SET_ERROR:
            return { ...state, error: action.payload };
        case ACTIONS.SET_MODE:
            return { ...state, meta: { ...state.meta, mode: action.payload } };
        default:
            return state;
    }
};

const FDPContext = createContext();

export const FDPProvider = ({ children }) => {
    const [state, dispatch] = useReducer(fdpReducer, initialState);

    const { notifications, addNotification, removeNotification } = useStudioNotifications();

    // Apply a whole plan payload in one pass, so restoring a saved plan and
    // restoring the local draft go through exactly the same path.
    const applyPlan = useCallback((plan) => {
        if (!plan || typeof plan !== 'object') return false;
        const byType = {
            meta: ACTIONS.SET_PROJECT_META,
            fieldData: ACTIONS.UPDATE_FIELD_DATA,
            subsurface: ACTIONS.UPDATE_SUBSURFACE,
            concepts: ACTIONS.UPDATE_CONCEPTS,
            scenarios: ACTIONS.UPDATE_SCENARIOS,
            wells: ACTIONS.UPDATE_WELLS,
            facilities: ACTIONS.UPDATE_FACILITIES,
            schedule: ACTIONS.UPDATE_SCHEDULE,
            costs: ACTIONS.UPDATE_COSTS,
            economics: ACTIONS.UPDATE_ECONOMICS,
            hseData: ACTIONS.UPDATE_HSE,
            communityData: ACTIONS.UPDATE_COMMUNITY,
            risks: ACTIONS.UPDATE_RISKS,
        };
        let applied = false;
        PLAN_SECTIONS.forEach((section) => {
            if (plan[section] !== undefined && byType[section]) {
                dispatch({ type: byType[section], payload: plan[section] });
                applied = true;
            }
        });
        return applied;
    }, []);

    // The local draft: a scratch buffer so a refresh does not lose work in
    // progress, including before a plan has been named or while signed out.
    // It is NOT the plan's home; that is the saved-plan table.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) applyPlan(JSON.parse(saved));
        } catch (e) {
            console.error('Failed to load the local FDP draft', e);
        }
    }, [applyPlan]);

    const plan = useMemo(
        () => PLAN_SECTIONS.reduce((acc, k) => ({ ...acc, [k]: state[k] }), {}),
        [state],
    );

    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(plan));
        } catch (e) {
            // A full or blocked store must not take the app down with it.
            console.error('Failed to write the local FDP draft', e);
        }
    }, [plan]);

    const serialize = useCallback(
        (name) => ({ name, schema: 1, plan, modified: new Date().toISOString() }),
        [plan],
    );

    const restore = useCallback((payload) => {
        const saved = payload?.plan && typeof payload.plan === 'object' ? payload.plan : payload;
        return applyPlan(saved);
    }, [applyPlan]);

    const persistence = useSavedProjects({
        service,
        serialize,
        restore,
        addNotification,
        describeError,
        watch: plan,
        noun: 'Plan',
    });

    const setProjectName = (name) => dispatch({ type: ACTIONS.SET_PROJECT_META, payload: { name } });
    const setActiveTab = (tab) => dispatch({ type: ACTIONS.SET_ACTIVE_TAB, payload: tab });
    const toggleSidebar = () => dispatch({ type: ACTIONS.TOGGLE_SIDEBAR });
    const toggleRightPanel = () => dispatch({ type: ACTIONS.TOGGLE_RIGHT_PANEL });
    const setMode = (mode) => dispatch({ type: ACTIONS.SET_MODE, payload: mode });
    const setGuidedStep = (step) => dispatch({ type: ACTIONS.SET_GUIDED_STEP, payload: step });
    
    const updateFieldData = (data) => dispatch({ type: ACTIONS.UPDATE_FIELD_DATA, payload: data });
    const updateSubsurface = (data) => dispatch({ type: ACTIONS.UPDATE_SUBSURFACE, payload: data });
    const updateConcepts = (data) => dispatch({ type: ACTIONS.UPDATE_CONCEPTS, payload: data });
    const updateScenarios = (data) => dispatch({ type: ACTIONS.UPDATE_SCENARIOS, payload: data });
    const updateWells = (data) => dispatch({ type: ACTIONS.UPDATE_WELLS, payload: data });
    const updateFacilities = (data) => dispatch({ type: ACTIONS.UPDATE_FACILITIES, payload: data });
    const updateSchedule = (data) => dispatch({ type: ACTIONS.UPDATE_SCHEDULE, payload: data });
    const updateCosts = (data) => dispatch({ type: ACTIONS.UPDATE_COSTS, payload: data }); 
    const updateEconomics = (data) => dispatch({ type: ACTIONS.UPDATE_ECONOMICS, payload: data });
    const updateHSE = (data) => dispatch({ type: ACTIONS.UPDATE_HSE, payload: data });
    const updateCommunity = (data) => dispatch({ type: ACTIONS.UPDATE_COMMUNITY, payload: data });
    const updateDataManagement = (data) => dispatch({ type: ACTIONS.UPDATE_DATA_MANAGEMENT, payload: data });
    const updateRisks = (data) => dispatch({ type: ACTIONS.UPDATE_RISKS, payload: data });

    return (
        <FDPContext.Provider value={{
            state,
            dispatch,
            persistence,
            notifications,
            removeNotification,
            actions: {
                setProjectName,
                setActiveTab,
                toggleSidebar,
                toggleRightPanel,
                setMode,
                setGuidedStep,
                updateFieldData,
                updateSubsurface,
                updateConcepts,
                updateScenarios,
                updateWells,
                updateFacilities,
                updateSchedule,
                updateCosts,
                updateEconomics,
                updateHSE,
                updateCommunity,
                updateDataManagement,
                updateRisks,
            }
        }}>
            {children}
        </FDPContext.Provider>
    );
};

export const useFDP = () => {
    const context = useContext(FDPContext);
    if (!context) {
        throw new Error("useFDP must be used within an FDPProvider");
    }
    return context;
};