// Refinery Planning & Scheduling Studio state (Midstream & Downstream DS3).
//
// The module's headline app and the concrete expression of doctrine 2: the
// plan, the schedule and the actuals are the same events in the same shape,
// so variance is a subtraction rather than a reconciliation project.
//
// Only three things are stored: the configuration, the period, and the
// actuals the user has recorded. The plan, the schedule and the
// reconciliation are all derived, so a reopened study cannot show a plan that
// no longer follows from its configuration.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  planRefinery, cascadeToSchedule, reconcilePeriod,
} from '@/utils/downstream/engine/refineryPlanning';
import { LEDGER, EVENT_TYPE } from '@/utils/downstream/engine/streamModel';

const TABLE = 'saved_refinery_plan_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save refinery plans.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds3_refinery_planning_persistence');

/**
 * A hydroskimming configuration to open on.
 *
 * Illustrative yields, capacities and prices, labelled in the UI. Yields are
 * DATA in every planning system in the industry, and a refinery's own come
 * from its assays and unit models; the Crude Assay Studio is where the
 * straight-run ones are worked out.
 */
export const defaultInputs = () => ({
  periodStart: new Date().toISOString().split('T')[0],
  periodDays: 30,
  cargoSize: 500000,
  streams: ['naphtha', 'reformate', 'kero', 'gasoil', 'residue', 'offgas'],
  crudes: [
    { id: 'crude_a', name: 'Light sweet', cost: 82, available: 3000000, yields: { naphtha: 0.22, kero: 0.15, gasoil: 0.33, residue: 0.28, offgas: 0.02 } },
    { id: 'crude_b', name: 'Medium sour', cost: 74, available: 2000000, yields: { naphtha: 0.15, kero: 0.13, gasoil: 0.30, residue: 0.40, offgas: 0.02 } },
  ],
  units: [
    { id: 'cdu', name: 'Crude distillation', capacity: 4000000, opex: 1.2, feed: '', yields: {} },
    { id: 'reformer', name: 'Reformer', capacity: 500000, opex: 3.0, feed: 'naphtha', yields: { reformate: 0.85, offgas: 0.10 } },
  ],
  products: [
    { id: 'gasoline', name: 'Gasoline', price: 112, minDemand: 0, maxDemand: 900000, recipe: { reformate: 1 } },
    { id: 'jet', name: 'Jet', price: 106, minDemand: 0, maxDemand: 900000, recipe: { kero: 1 } },
    { id: 'diesel', name: 'Diesel', price: 101, minDemand: 0, maxDemand: 2000000, recipe: { gasoil: 1 } },
    { id: 'fuel_oil', name: 'Fuel oil', price: 62, minDemand: 0, maxDemand: 2000000, recipe: { residue: 1 } },
  ],
  actuals: [],
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.crudes) || raw.crudes.length === 0) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    actuals: Array.isArray(raw.actuals) ? raw.actuals : [],
  };
};

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const Ctx = createContext();

export const useRefineryPlanning = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRefineryPlanning must be used within a RefineryPlanningProvider');
  return ctx;
};

export const RefineryPlanningProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const patchList = (key) => (id, patch) => setInputs((prev) => ({
    ...prev,
    [key]: prev[key].map((row) => (row.id === id ? { ...row, ...patch } : row)),
  }));

  const setCrude = useCallback(patchList('crudes'), []);
  const setUnit = useCallback(patchList('units'), []);
  const setProduct = useCallback(patchList('products'), []);

  const setYield = useCallback((kind, id, streamId, value) => {
    setInputs((prev) => ({
      ...prev,
      [kind]: prev[kind].map((row) => (row.id === id
        ? { ...row, yields: { ...row.yields, [streamId]: value } }
        : row)),
    }));
  }, []);

  const setRecipe = useCallback((id, streamId, value) => {
    setInputs((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id
        ? { ...p, recipe: { ...p.recipe, [streamId]: value } }
        : p)),
    }));
  }, []);

  const setPeriod = useCallback((patch) => {
    setInputs((prev) => ({ ...prev, ...patch }));
  }, []);

  const addActual = useCallback((actual) => {
    setInputs((prev) => ({
      ...prev,
      actuals: [...prev.actuals, { id: uuidv4(), ...actual }],
    }));
  }, []);

  const removeActual = useCallback((id) => {
    setInputs((prev) => ({ ...prev, actuals: prev.actuals.filter((a) => a.id !== id) }));
  }, []);

  // --- Derived ---

  const plan = useMemo(() => planRefinery({
    streams: inputs.streams,
    crudes: inputs.crudes.map((c) => ({
      ...c, cost: num(c.cost), available: num(c.available, Infinity),
      yields: Object.fromEntries(Object.entries(c.yields || {}).map(([k, v]) => [k, num(v)])),
    })),
    units: inputs.units.map((u) => ({
      ...u, capacity: num(u.capacity, Infinity), opex: num(u.opex),
      yields: Object.fromEntries(Object.entries(u.yields || {}).map(([k, v]) => [k, num(v)])),
    })),
    products: inputs.products.map((p) => ({
      ...p, price: num(p.price), minDemand: num(p.minDemand, 0), maxDemand: num(p.maxDemand, Infinity),
      recipe: Object.fromEntries(Object.entries(p.recipe || {}).map(([k, v]) => [k, num(v)])),
    })),
  }), [inputs.streams, inputs.crudes, inputs.units, inputs.products]);

  const schedule = useMemo(() => cascadeToSchedule({
    plan,
    periodStart: inputs.periodStart,
    periodDays: num(inputs.periodDays, 30),
    cargoSize: num(inputs.cargoSize, 500000),
  }), [plan, inputs.periodStart, inputs.periodDays, inputs.cargoSize]);

  /** Recorded actuals, shaped as events on the shared model. */
  const actualEvents = useMemo(() => inputs.actuals.map((a) => ({
    id: a.id,
    ledger: LEDGER.ACTUAL,
    type: a.type || EVENT_TYPE.RECEIPT,
    materialId: a.materialId,
    quantity: num(a.quantity),
    unit: 'bbl',
    date: a.date || null,
    fromId: null, toId: null, unitId: a.type === EVENT_TYPE.UNIT_RUN ? a.materialId : null,
    cost: a.cost === '' || a.cost === undefined ? null : num(a.cost),
    emissionsKgCo2e: null,
    meta: {},
  })), [inputs.actuals]);

  const reconciliation = useMemo(() => reconcilePeriod({
    planEvents: schedule.events,
    actualEvents,
    plan,
  }), [schedule.events, actualEvents, plan]);

  /** What the plan expects of each material, so actuals can be entered against it. */
  const plannedByMaterial = useMemo(() => {
    const map = new Map();
    schedule.events.forEach((e) => {
      const key = `${e.materialId}::${e.type}`;
      const row = map.get(key) || { materialId: e.materialId, type: e.type, quantity: 0, cost: 0 };
      row.quantity += e.quantity;
      row.cost += e.cost ?? 0;
      map.set(key, row);
    });
    return [...map.values()];
  }, [schedule.events]);

  // --- Persistence ---
  const serialize = useCallback((name) => ({
    name, schema: 1, inputs, modified: new Date().toISOString(),
  }), [inputs]);

  const restore = useCallback((payload) => {
    const restored = inputsFromPayload(payload);
    if (!restored) return false;
    setInputs(restored);
    return true;
  }, []);

  const persistence = useSavedProjects({
    service, serialize, restore, addNotification, describeError,
    watch: inputs, noun: 'Plan',
  });

  const value = {
    inputs, setCrude, setUnit, setProduct, setYield, setRecipe, setPeriod,
    addActual, removeActual,
    plan, schedule, actualEvents, reconciliation, plannedByMaterial,
    persistence, notifications, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
