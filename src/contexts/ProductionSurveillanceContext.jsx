// Production Surveillance Studio state (P2, Production Operations
// program — docs/scope/ProductionOperations-STATUS.md). Two layers:
//
//   1. Spine data — fields/wells/ledger/deferments live in the po_*
//      tables and load through src/lib/productionSpine.js (RLS does the
//      scoping). They are NEVER part of the project payload.
//   2. Analysis state — which field, surveillance thresholds, trend and
//      decline-overlay picks. This is the saved_surveillance_projects
//      payload, on the VrrMonitorContext recipe (createSavedProjectsService
//      + hydrated guard + 10s debounced autosave).
//
// Derived series/exceptions/KPIs are pure functions of (ledger,
// settings) via utils/production/surveillance and recompute on load.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import * as spine from '@/lib/productionSpine';
import { listWells as listGeoWells } from '@/lib/wellsRegistry';
import { suggestRegistryLinks } from '@/utils/production/registryLink';
import {
  buildWellSeries, buildFieldSeries, detectExceptions, summarizeDeferments,
  computeKpis, fitWellDecline, DEFAULT_SURVEILLANCE_SETTINGS,
} from '@/utils/production/surveillance';

const TABLE = 'saved_surveillance_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save surveillance projects.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p2_saved_surveillance_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  fieldId: null,
  settings: { ...DEFAULT_SURVEILLANCE_SETTINGS },
  trends: {
    view: 'field', wellId: null, stream: 'rates', basis: 'calendar',
    logScale: false, smoothDays: 0,
  },
  dca: {
    wellId: null, stream: 'oil', basis: 'producing', modelType: 'Auto-Select',
    forecastDays: 1825, economicLimit: '',
  },
});

/** Restore inputs from a payload, tolerating missing keys from older rows. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    trends: { ...base.trends, ...(raw.trends || {}) },
    dca: { ...base.dca, ...(raw.dca || {}) },
  };
};

const ProductionSurveillanceContext = createContext();

export const useSurveillance = () => {
  const context = useContext(ProductionSurveillanceContext);
  if (!context) throw new Error('useSurveillance must be used within a ProductionSurveillanceProvider');
  return context;
};

export const ProductionSurveillanceProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const { organization } = useAuth();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // --- Spine data (never in the payload) ---
  const [fields, setFields] = useState([]);
  const [wells, setWells] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [deferments, setDeferments] = useState([]);
  const [geoWells, setGeoWells] = useState([]);
  const [loadingField, setLoadingField] = useState(false);
  const [importing, setImporting] = useState(false);

  const currentField = useMemo(
    () => fields.find((f) => f.id === inputs.fieldId) || null,
    [fields, inputs.fieldId],
  );
  const canEditField = !!currentField?.is_own;

  const reloadFields = useCallback(async () => {
    try {
      setFields(await spine.listFields());
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    }
  }, [addNotification]);

  const reloadFieldData = useCallback(async (fieldId) => {
    if (!fieldId) {
      setWells([]); setLedgerRows([]); setDeferments([]);
      return;
    }
    setLoadingField(true);
    try {
      const [w, rows, defs] = await Promise.all([
        spine.listPoWells(fieldId),
        spine.getDailyProduction(fieldId),
        spine.listDeferments(fieldId),
      ]);
      setWells(w);
      setLedgerRows(rows);
      setDeferments(defs);
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setLoadingField(false);
    }
  }, [addNotification]);

  useEffect(() => { reloadFields(); }, [reloadFields]);
  useEffect(() => { reloadFieldData(inputs.fieldId); }, [inputs.fieldId, reloadFieldData]);

  // Registry wells load once, lazily, for the linkage suggestions.
  useEffect(() => {
    (async () => {
      try {
        setGeoWells(await listGeoWells());
      } catch (e) {
        console.error(e); // registry is optional here; linking UI degrades honestly
      }
    })();
  }, []);

  // --- Derived analytics (pure functions of spine data + settings) ---
  const wellSeries = useMemo(() => buildWellSeries(ledgerRows), [ledgerRows]);
  const fieldSeries = useMemo(() => buildFieldSeries(ledgerRows), [ledgerRows]);
  // Threshold inputs come back from the payload (and from a half-typed
  // field) as strings; the rules are numeric comparisons, so coerce here
  // and fall back to the default for anything unparseable.
  const activeSettings = useMemo(() => {
    const out = { ...DEFAULT_SURVEILLANCE_SETTINGS };
    Object.entries(inputs.settings || {}).forEach(([k, v]) => {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (Number.isFinite(n)) out[k] = n;
    });
    return out;
  }, [inputs.settings]);
  const surveillance = useMemo(
    () => detectExceptions(wellSeries, activeSettings),
    [wellSeries, activeSettings],
  );
  const kpis = useMemo(() => computeKpis(wellSeries, fieldSeries, {}), [wellSeries, fieldSeries]);
  // Item 76. `summarizeDeferments` reads no wall clock: an open
  // deferment accrues days up to an anchor the CALLER names, and it
  // refuses without one rather than quietly dating itself to today.
  // `surveillance.asOf` is null when the field has no wells with ledger
  // rows, and passing `undefined` there used to hand the engine a
  // silent "now". The panel gets an empty summary in that case, which
  // is the truth: there is no ledger to accrue against.
  const defermentSummary = useMemo(() => {
    if (!surveillance.asOf) {
      return {
        ok: false,
        code: 'noLedgerDate',
        byCategory: [],
        totals: {
          events: 0, days: 0, oil: 0, water: 0, gas: 0,
        },
        openCount: 0,
        note: 'This field has no production ledger yet, so there is no date for an open deferment to accrue days up to.',
      };
    }
    const summary = summarizeDeferments(deferments, surveillance.asOf);
    if (summary.ok === false) {
      return {
        ...summary,
        byCategory: [],
        totals: {
          events: 0, days: 0, oil: 0, water: 0, gas: 0,
        },
        openCount: 0,
        note: summary.error,
      };
    }
    return summary;
  }, [deferments, surveillance.asOf]);
  const registrySuggestions = useMemo(
    () => suggestRegistryLinks(wells, geoWells),
    [wells, geoWells],
  );

  const dcaResult = useMemo(() => {
    const entry = wellSeries.find((s) => s.well.id === inputs.dca.wellId);
    if (!entry) return null;
    const economicLimit = parseFloat(inputs.dca.economicLimit);
    return fitWellDecline(entry.points, {
      stream: inputs.dca.stream,
      basis: inputs.dca.basis,
      modelType: inputs.dca.modelType,
      forecastDays: parseInt(inputs.dca.forecastDays, 10) || 1825,
      economicLimit: Number.isFinite(economicLimit) ? economicLimit : 0,
    });
  }, [wellSeries, inputs.dca]);

  // --- Field actions (spine writes; RLS enforces ownership) ---
  const selectField = useCallback((fieldId) => {
    setInputs((prev) => ({ ...prev, fieldId: fieldId || null }));
  }, []);

  const createField = useCallback(async (name, description) => {
    try {
      const f = await spine.saveField({ name, description });
      await reloadFields();
      selectField(f.id);
      addNotification(`Field "${name}" created`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [reloadFields, selectField, addNotification]);

  const deleteField = useCallback(async (fieldId) => {
    try {
      await spine.deleteField(fieldId);
      if (fieldId === inputs.fieldId) selectField(null);
      await reloadFields();
      addNotification('Field deleted', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, reloadFields, selectField, addNotification]);

  const shareCurrentField = useCallback(async () => {
    if (!currentField) return;
    if (!organization?.id) {
      addNotification('You are not a member of an organization to share with.', 'error');
      return;
    }
    try {
      await spine.shareField(currentField.id, organization.id);
      await reloadFields();
      addNotification(`Field shared read-only with ${organization.name || 'your organization'}`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [currentField, organization, reloadFields, addNotification]);

  const unshareCurrentField = useCallback(async () => {
    if (!currentField) return;
    try {
      await spine.unshareField(currentField.id);
      await reloadFields();
      addNotification('Field back to private', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [currentField, reloadFields, addNotification]);

  // --- Imports (parsers run in the panel; writes + reload here) ---
  const importDailyRows = useCallback(async (rows) => {
    if (!inputs.fieldId) {
      addNotification('Select or create a field first', 'error');
      return;
    }
    setImporting(true);
    try {
      const res = await spine.importDailyProduction(inputs.fieldId, rows);
      await reloadFieldData(inputs.fieldId);
      const dupNote = res.duplicatesCollapsed
        ? ` (${res.duplicatesCollapsed} in-file duplicate${res.duplicatesCollapsed === 1 ? '' : 's'} collapsed, last row wins)`
        : '';
      addNotification(`Imported ${res.upserted.toLocaleString()} ledger rows across ${res.wells} wells${dupNote}`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setImporting(false);
    }
  }, [inputs.fieldId, reloadFieldData, addNotification]);

  const importTests = useCallback(async (tests) => {
    if (!inputs.fieldId) {
      addNotification('Select or create a field first', 'error');
      return;
    }
    setImporting(true);
    try {
      const res = await spine.importWellTests(inputs.fieldId, tests);
      await reloadFieldData(inputs.fieldId);
      addNotification(`Imported ${res.inserted} well tests across ${res.wells} wells`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setImporting(false);
    }
  }, [inputs.fieldId, reloadFieldData, addNotification]);

  // --- Wells / registry linkage ---
  const applySuggestedLinks = useCallback(async () => {
    if (!registrySuggestions.length) return;
    try {
      const applied = await spine.applyRegistryLinks(registrySuggestions);
      await reloadFieldData(inputs.fieldId);
      addNotification(`Linked ${applied} well${applied === 1 ? '' : 's'} to the wells registry`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [registrySuggestions, inputs.fieldId, reloadFieldData, addNotification]);

  const setWellType = useCallback(async (wellId, wellType) => {
    try {
      await spine.updatePoWell(wellId, { well_type: wellType });
      await reloadFieldData(inputs.fieldId);
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, reloadFieldData, addNotification]);

  // --- Deferments ---
  const addDeferment = useCallback(async (wellId, d) => {
    try {
      await spine.saveDeferment(wellId, d);
      setDeferments(await spine.listDeferments(inputs.fieldId));
      addNotification('Deferment recorded', 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  const closeDeferment = useCallback(async (defermentId, endDate) => {
    try {
      await spine.updateDeferment(defermentId, { end_date: endDate });
      setDeferments(await spine.listDeferments(inputs.fieldId));
      addNotification('Deferment closed', 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  const removeDeferment = useCallback(async (defermentId) => {
    try {
      await spine.deleteDeferment(defermentId);
      setDeferments(await spine.listDeferments(inputs.fieldId));
      addNotification('Deferment deleted', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  // --- Analysis-state setters (autosaved payload) ---
  const setSettingsField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }, []);
  const setTrendsField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, trends: { ...prev.trends, [key]: value } }));
  }, []);
  const setDcaField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, dca: { ...prev.dca, [key]: value } }));
  }, []);

  // --- Project lifecycle (VrrMonitorContext recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    inputs,
    modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { id, name, schema: 1, inputs, modified: new Date().toISOString() });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled project');
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
      }
      setProjects(await service.list());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serialize(projectName));
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, serialize, addNotification]);

  // Debounced autosave (10 s), only once a project is open and hydrated.
  const autosaveRef = useRef(null);
  autosaveRef.current = () => serialize(projectName);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await service.save(currentProjectId, autosaveRef.current());
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated]);

  const value = {
    // analysis state + spine data
    inputs,
    fields,
    currentField,
    canEditField,
    wells,
    ledgerRows,
    deferments,
    geoWells,
    loadingField,
    importing,
    // derived
    wellSeries,
    fieldSeries,
    surveillance,
    activeSettings,
    kpis,
    defermentSummary,
    registrySuggestions,
    dcaResult,
    // field actions
    selectField,
    createField,
    deleteField,
    shareCurrentField,
    unshareCurrentField,
    // imports
    importDailyRows,
    importTests,
    // wells
    applySuggestedLinks,
    setWellType,
    // deferments
    addDeferment,
    closeDeferment,
    removeDeferment,
    // setters
    setSettingsField,
    setTrendsField,
    setDcaField,
    // projects
    projects,
    currentProjectId,
    projectName,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    isSaving,
    saveError,
    lastSaveTime,
    // notifications
    notifications,
    addNotification,
    removeNotification,
  };

  return (
    <ProductionSurveillanceContext.Provider value={value}>
      {children}
    </ProductionSurveillanceContext.Provider>
  );
};
