// Production Allocation Studio state (P3, Production Operations
// program — docs/scope/ProductionOperations-STATUS.md). Same two-layer
// split as the Surveillance Studio:
//
//   1. Spine data — fields, wells, ledger, well tests, metered field
//      totals and saved allocation factors live in the po_* tables and
//      load through src/lib/productionSpine.js (RLS does the scoping).
//      None of it is ever part of the project payload.
//   2. Analysis state — selected field, date range, allocation basis
//      and thresholds, test QC thresholds. That is the
//      saved_allocation_projects payload (createSavedProjectsService +
//      hydrated guard + 10 s debounced autosave).
//
// The allocation itself is a pure function of (wells, tests, ledger,
// totals, settings) via utils/production/allocation and recomputes on
// load; results are never stored.
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import * as spine from '@/lib/productionSpine';
import { buildWellSeries } from '@/utils/production/surveillance';
import {
  computeAllocation, monthlyFactors, allocatedLedgerRows, imbalanceSeries,
  validateWellTests, DEFAULT_ALLOCATION_SETTINGS, DEFAULT_TEST_QC_SETTINGS,
} from '@/utils/production/allocation';

const TABLE = 'saved_allocation_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save allocation projects.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p3_saved_allocation_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  fieldId: null,
  range: { from: '', to: '' },
  settings: { ...DEFAULT_ALLOCATION_SETTINGS },
  qc: { ...DEFAULT_TEST_QC_SETTINGS },
  view: { phase: 'oil' },
});

/** Restore inputs from a payload, tolerating missing keys from older rows. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    range: { ...base.range, ...(raw.range || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    qc: { ...base.qc, ...(raw.qc || {}) },
    view: { ...base.view, ...(raw.view || {}) },
  };
};

/** Thresholds come back from JSON (and from a half-typed field) as
 *  strings; every rule below is a numeric comparison. Coerce here and
 *  fall back to the default for anything unparseable, so a rule can
 *  never be silently disabled. Non-numeric keys pass through. */
const coerceSettings = (defaults, raw) => {
  const out = { ...defaults };
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (typeof defaults[k] === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (Number.isFinite(n)) out[k] = n;
      return;
    }
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
};

const ProductionAllocationContext = createContext();

export const useAllocation = () => {
  const context = useContext(ProductionAllocationContext);
  if (!context) throw new Error('useAllocation must be used within a ProductionAllocationProvider');
  return context;
};

export const ProductionAllocationProvider = ({ children }) => {
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
  const [tests, setTests] = useState([]);
  const [fieldTotals, setFieldTotals] = useState([]);
  const [savedFactors, setSavedFactors] = useState([]);
  const [loadingField, setLoadingField] = useState(false);
  const [busyMessage, setBusyMessage] = useState(null);

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
      setWells([]); setLedgerRows([]); setTests([]); setFieldTotals([]); setSavedFactors([]);
      return;
    }
    setLoadingField(true);
    try {
      const [w, rows, t, totals, factors] = await Promise.all([
        spine.listPoWells(fieldId),
        spine.getDailyProduction(fieldId),
        spine.listFieldWellTests(fieldId),
        spine.getFieldTotals(fieldId),
        spine.listAllocationFactors(fieldId),
      ]);
      setWells(w);
      setLedgerRows(rows);
      setTests(t);
      setFieldTotals(totals);
      setSavedFactors(factors);
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setLoadingField(false);
    }
  }, [addNotification]);

  useEffect(() => { reloadFields(); }, [reloadFields]);
  useEffect(() => { reloadFieldData(inputs.fieldId); }, [inputs.fieldId, reloadFieldData]);

  // --- Derived (pure functions of spine data + settings) ---
  const activeSettings = useMemo(
    () => coerceSettings(DEFAULT_ALLOCATION_SETTINGS, inputs.settings),
    [inputs.settings],
  );
  const activeQc = useMemo(
    () => coerceSettings(DEFAULT_TEST_QC_SETTINGS, inputs.qc),
    [inputs.qc],
  );

  const inRange = useCallback((date) => {
    const { from, to } = inputs.range;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }, [inputs.range]);

  const rangedTotals = useMemo(
    () => fieldTotals.filter((t) => inRange(t.total_date)),
    [fieldTotals, inRange],
  );
  const rangedLedger = useMemo(
    () => ledgerRows.filter((r) => inRange(r.prod_date)),
    [ledgerRows, inRange],
  );

  const wellSeries = useMemo(() => buildWellSeries(ledgerRows), [ledgerRows]);

  const allocation = useMemo(() => computeAllocation({
    wells,
    tests,
    ledger: ledgerRows,
    totals: rangedTotals,
    settings: activeSettings,
  }), [wells, tests, ledgerRows, rangedTotals, activeSettings]);

  const factors = useMemo(() => monthlyFactors(allocation), [allocation]);
  const imbalance = useMemo(
    () => imbalanceSeries(allocation, rangedLedger),
    [allocation, rangedLedger],
  );
  const testQc = useMemo(
    () => validateWellTests(tests, wellSeries, activeQc),
    [tests, wellSeries, activeQc],
  );
  const testQcById = useMemo(
    () => new Map(testQc.map((r) => [r.testId, r])),
    [testQc],
  );

  // --- Field actions (spine writes; RLS enforces ownership) ---
  const selectField = useCallback((fieldId) => {
    setInputs((prev) => ({ ...prev, fieldId: fieldId || null }));
  }, []);

  const createField = useCallback(async (name) => {
    try {
      const f = await spine.saveField({ name });
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

  // --- Imports and manual entry ---
  const requireEditableField = useCallback(() => {
    if (!inputs.fieldId) {
      addNotification('Select or create a field first', 'error');
      return false;
    }
    if (!canEditField) {
      addNotification('This field is shared with you read-only', 'error');
      return false;
    }
    return true;
  }, [inputs.fieldId, canEditField, addNotification]);

  const importTotals = useCallback(async (rows) => {
    if (!requireEditableField()) return;
    setBusyMessage('Importing metered totals...');
    try {
      const res = await spine.importFieldTotals(inputs.fieldId, rows);
      await reloadFieldData(inputs.fieldId);
      const dupNote = res.duplicatesCollapsed
        ? ` (${res.duplicatesCollapsed} repeated date${res.duplicatesCollapsed === 1 ? '' : 's'} collapsed, last row wins)`
        : '';
      addNotification(`Imported ${res.upserted.toLocaleString()} metered dates${dupNote}`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [inputs.fieldId, requireEditableField, reloadFieldData, addNotification]);

  const importTests = useCallback(async (rows) => {
    if (!requireEditableField()) return;
    setBusyMessage('Importing well tests...');
    try {
      const res = await spine.importWellTests(inputs.fieldId, rows);
      await reloadFieldData(inputs.fieldId);
      addNotification(`Imported ${res.inserted} well tests across ${res.wells} wells`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [inputs.fieldId, requireEditableField, reloadFieldData, addNotification]);

  const saveTotal = useCallback(async (total) => {
    if (!requireEditableField()) return;
    try {
      await spine.saveFieldTotal(inputs.fieldId, total);
      setFieldTotals(await spine.getFieldTotals(inputs.fieldId));
      addNotification(`Total for ${total.date} saved`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, requireEditableField, addNotification]);

  const deleteTotal = useCallback(async (totalId) => {
    try {
      await spine.deleteFieldTotal(totalId);
      setFieldTotals(await spine.getFieldTotals(inputs.fieldId));
      addNotification('Metered total deleted', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  // --- Well test QC ---
  const setTestValid = useCallback(async (testId, isValid, comment) => {
    try {
      await spine.updateWellTest(testId, {
        is_valid: isValid,
        ...(comment === undefined ? {} : { comment }),
      });
      setTests(await spine.listFieldWellTests(inputs.fieldId));
      addNotification(isValid ? 'Test accepted' : 'Test rejected and excluded from allocation', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  const removeTest = useCallback(async (testId) => {
    try {
      await spine.deleteWellTest(testId);
      setTests(await spine.listFieldWellTests(inputs.fieldId));
      addNotification('Test deleted', 'info');
    } catch (e) {
      addNotification(e.message, 'error');
    }
  }, [inputs.fieldId, addNotification]);

  /** Reject every test the QC run flagged at the given severity or worse. */
  const rejectFlaggedTests = useCallback(async (severity = 'high') => {
    const ranks = { high: 0, medium: 1, info: 2 };
    const targets = testQc.filter((r) => ranks[r.severity] <= ranks[severity]);
    if (!targets.length) return;
    setBusyMessage(`Rejecting ${targets.length} flagged tests...`);
    try {
      for (const r of targets) {
        await spine.updateWellTest(r.testId, { is_valid: false });
      }
      setTests(await spine.listFieldWellTests(inputs.fieldId));
      addNotification(`${targets.length} flagged test${targets.length === 1 ? '' : 's'} rejected`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [testQc, inputs.fieldId, addNotification]);

  // --- Allocation write-backs (deliberate, never automatic) ---
  const saveFactors = useCallback(async () => {
    if (!requireEditableField()) return;
    if (!factors.length) {
      addNotification('Nothing to save: no allocated months in range', 'info');
      return;
    }
    setBusyMessage('Saving allocation factors...');
    try {
      const written = await spine.upsertAllocationFactors(factors);
      setSavedFactors(await spine.listAllocationFactors(inputs.fieldId));
      addNotification(`${written} well-month factor${written === 1 ? '' : 's'} saved`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [factors, inputs.fieldId, requireEditableField, addNotification]);

  const bookAllocation = useCallback(async () => {
    if (!requireEditableField()) return;
    const rows = allocatedLedgerRows(allocation);
    if (!rows.length) {
      addNotification('Nothing to book: no allocated days in range', 'info');
      return;
    }
    setBusyMessage(`Booking ${rows.length.toLocaleString()} allocated well-days...`);
    try {
      const written = await spine.writeAllocatedProduction(rows);
      await reloadFieldData(inputs.fieldId);
      addNotification(`${written.toLocaleString()} well-days written to the ledger as allocated volumes`, 'success');
    } catch (e) {
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [allocation, inputs.fieldId, requireEditableField, reloadFieldData, addNotification]);

  // --- Analysis-state setters (autosaved payload) ---
  const setSettingsField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }, []);
  const setQcField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, qc: { ...prev.qc, [key]: value } }));
  }, []);
  const setRangeField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, range: { ...prev.range, [key]: value } }));
  }, []);
  const setViewField = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, view: { ...prev.view, [key]: value } }));
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
    activeSettings,
    activeQc,
    fields,
    currentField,
    canEditField,
    wells,
    ledgerRows,
    tests,
    fieldTotals,
    savedFactors,
    loadingField,
    busyMessage,
    // derived
    wellSeries,
    allocation,
    factors,
    imbalance,
    testQc,
    testQcById,
    // field actions
    selectField,
    createField,
    deleteField,
    shareCurrentField,
    unshareCurrentField,
    // data actions
    importTotals,
    importTests,
    saveTotal,
    deleteTotal,
    setTestValid,
    removeTest,
    rejectFlaggedTests,
    saveFactors,
    bookAllocation,
    // setters
    setSettingsField,
    setQcField,
    setRangeField,
    setViewField,
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
    <ProductionAllocationContext.Provider value={value}>
      {children}
    </ProductionAllocationContext.Provider>
  );
};
