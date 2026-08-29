// Flare Gas to Value Studio state (Midstream & Downstream DS10).
//
// The module's last app and its bridge back upstream. The abatement is
// refused until the counterfactual is declared, because the flare's gross
// emission is a different number from the abatement in a direction nobody
// can guess in advance.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  characteriseGas, screenRoute, routeEconomics, abatement, creditSensitivity,
  compareRoutes, GAS_COMPONENT_REFERENCE, GAS_REFERENCE_NOTE,
  ROUTE_TEMPLATES, ROUTE_TEMPLATE_NOTE,
} from '@/utils/downstream/engine/flareToValue';

const TABLE = 'saved_flare_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save flare studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds10_flare_persistence');

export { GAS_REFERENCE_NOTE, ROUTE_TEMPLATE_NOTE };

const gasRow = (code, moleFraction) => {
  const r = GAS_COMPONENT_REFERENCE.find((c) => c.code === code);
  return {
    id: uuidv4(), code, label: r.label, moleFraction,
    c: r.c, molarMassLbLbmol: r.molarMassLbLbmol,
    ghvBtuScf: r.typicalGhvBtuScf, liquidDensityLbGal: r.liquidDensityLbGal,
    recoverableAsNgl: r.recoverableAsNgl, inert: !!r.inert,
  };
};

/** Yield, recovery and cost shapes per route. Prices and limits are the user's. */
const ROUTE_DEFAULTS = {
  cng: { productUnitPerMscf: 20, productUnitLabel: 'kg CNG', recoveryFraction: 0.9, pricePerProductUnit: 0.6, referenceCapitalCost: 30000000, referenceCapacityMMscfd: 8, fixedOpexPerYear: 2500000, variableOpexPerMscf: 0.4 },
  mini_lng: { productUnitPerMscf: 0.019, productUnitLabel: 't LNG', recoveryFraction: 0.88, pricePerProductUnit: 480, referenceCapitalCost: 90000000, referenceCapacityMMscfd: 20, fixedOpexPerYear: 6000000, variableOpexPerMscf: 0.7 },
  lpg_extraction: { productUnitPerMscf: 0.02, productUnitLabel: 't LPG', recoveryFraction: 0.85, pricePerProductUnit: 500, referenceCapitalCost: 45000000, referenceCapacityMMscfd: 12, fixedOpexPerYear: 3000000, variableOpexPerMscf: 0.3 },
  gas_to_power: { productUnitPerMscf: 0.09, productUnitLabel: 'MWh', recoveryFraction: 0.95, pricePerProductUnit: 65, referenceCapitalCost: 55000000, referenceCapacityMMscfd: 15, fixedOpexPerYear: 4000000, variableOpexPerMscf: 0.5 },
};

export const defaultInputs = () => ({
  gas: [
    gasRow('C1', 0.78), gasRow('C2', 0.09), gasRow('C3', 0.05), gasRow('IC4', 0.01),
    gasRow('NC4', 0.02), gasRow('C5', 0.01), gasRow('N2', 0.02), gasRow('CO2', 0.02),
  ],
  parcel: { volumeMMscfd: 10, onstreamDays: 350, flareDestructionEfficiency: '', gwpMethane: '' },
  // Requirement limits ship unset: they are commercial, not physical law.
  routes: ROUTE_TEMPLATES.map((r) => ({
    id: r.id, label: r.label,
    requirements: r.requirements.map((q) => ({ ...q, limit: '' })),
    ...ROUTE_DEFAULTS[r.id],
  })),
  counterfactual: {
    label: '', productCombustionTonnesCo2ePerYear: '', displacedFuelTonnesCo2ePerYear: '',
  },
  credits: { prices: '5, 15, 30, 60', hurdleMarginPerYear: 4000000, appliesToRouteId: 'cng' },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.gas) || raw.gas.length === 0) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    gas: raw.gas,
    parcel: { ...base.parcel, ...(raw.parcel || {}) },
    counterfactual: { ...base.counterfactual, ...(raw.counterfactual || {}) },
    credits: { ...base.credits, ...(raw.credits || {}) },
    routes: Array.isArray(raw.routes) && raw.routes.length ? raw.routes : base.routes,
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useFlareToValue = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFlareToValue must be used within a FlareToValueProvider');
  return ctx;
};

export const FlareToValueProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, [key]: { ...p[key], ...patch },
  })), []);
  const setGasRow = useCallback((id, patch) => setInputs((p) => ({
    ...p, gas: p.gas.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  })), []);
  const setRoute = useCallback((id, patch) => setInputs((p) => ({
    ...p, routes: p.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  })), []);
  const setRequirement = useCallback((routeId, key, limit) => setInputs((p) => ({
    ...p,
    routes: p.routes.map((r) => (r.id === routeId
      ? { ...r, requirements: r.requirements.map((q) => (q.key === key ? { ...q, limit } : q)) }
      : r)),
  })), []);

  const gas = useMemo(() => characteriseGas({
    components: inputs.gas.map((g) => ({
      code: g.code, moleFraction: numOrNull(g.moleFraction),
      c: g.c, molarMassLbLbmol: g.molarMassLbLbmol,
      ghvBtuScf: numOrNull(g.ghvBtuScf),
      liquidDensityLbGal: numOrNull(g.liquidDensityLbGal),
      recoverableAsNgl: g.recoverableAsNgl, inert: g.inert,
    })),
  }), [inputs.gas]);

  const screenings = useMemo(() => inputs.routes.map((r) => screenRoute({
    route: { id: r.id, label: r.label, requirements: r.requirements.map((q) => ({ ...q, limit: numOrNull(q.limit) })) },
    gas,
    volumeMMscfd: numOrNull(inputs.parcel.volumeMMscfd),
  })), [inputs.routes, gas, inputs.parcel.volumeMMscfd]);

  const economics = useMemo(() => inputs.routes.map((r) => routeEconomics({
    route: { id: r.id, label: r.label },
    gas,
    volumeMMscfd: numOrNull(inputs.parcel.volumeMMscfd),
    onstreamDays: num(inputs.parcel.onstreamDays, 350),
    productUnitPerMscf: numOrNull(r.productUnitPerMscf),
    productUnitLabel: r.productUnitLabel,
    recoveryFraction: numOrNull(r.recoveryFraction),
    pricePerProductUnit: numOrNull(r.pricePerProductUnit),
    referenceCapitalCost: numOrNull(r.referenceCapitalCost),
    referenceCapacityMMscfd: numOrNull(r.referenceCapacityMMscfd),
    fixedOpexPerYear: num(r.fixedOpexPerYear),
    variableOpexPerMscf: num(r.variableOpexPerMscf),
  })), [inputs.routes, gas, inputs.parcel]);

  const flareAbatement = useMemo(() => abatement({
    gas,
    volumeMMscfd: numOrNull(inputs.parcel.volumeMMscfd),
    onstreamDays: num(inputs.parcel.onstreamDays, 350),
    flareDestructionEfficiency: numOrNull(inputs.parcel.flareDestructionEfficiency),
    gwpMethane: numOrNull(inputs.parcel.gwpMethane),
    counterfactualLabel: inputs.counterfactual.label || null,
    productCombustionTonnesCo2ePerYear:
      numOrNull(inputs.counterfactual.productCombustionTonnesCo2ePerYear),
    displacedFuelTonnesCo2ePerYear:
      numOrNull(inputs.counterfactual.displacedFuelTonnesCo2ePerYear),
  }), [gas, inputs.parcel, inputs.counterfactual]);

  const creditPrices = useMemo(() => String(inputs.credits.prices || '')
    .split(',').map((x) => numOrNull(x.trim())).filter((x) => x !== null),
  [inputs.credits.prices]);

  const creditCase = useMemo(() => {
    const route = economics.find((e) => !e.error && e.routeId === inputs.credits.appliesToRouteId);
    return creditSensitivity({
      netAbatementTonnesCo2ePerYear: flareAbatement.error
        ? null : flareAbatement.netAbatementTonnesCo2ePerYear,
      creditPrices,
      grossMarginPerYear: route ? route.grossMarginPerYear : null,
      hurdleMarginPerYear: num(inputs.credits.hurdleMarginPerYear),
    });
  }, [flareAbatement, creditPrices, economics, inputs.credits]);

  const comparison = useMemo(() => compareRoutes({
    screenings,
    economics,
    abatements: flareAbatement.error || flareAbatement.netAbatementTonnesCo2ePerYear === null
      ? {} : { [inputs.credits.appliesToRouteId]: flareAbatement },
  }), [screenings, economics, flareAbatement, inputs.credits.appliesToRouteId]);

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
    service, serialize, restore, addNotification, describeError, watch: inputs, noun: 'Study',
  });

  const value = {
    inputs, setSection, setGasRow, setRoute, setRequirement,
    gas, screenings, economics, flareAbatement, creditCase, comparison,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
