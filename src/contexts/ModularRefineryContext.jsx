// Modular Refinery Feasibility Studio state (Midstream & Downstream DS4).
//
// The module's flagship. The engine produces the physical and cash streams;
// the VALUATION is done by the Suite's sanctioned screening economics engine
// rather than by a seventh NPV implementation, because the Economics module
// spent a whole phase removing the fifth and sixth.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { calculateEconomics } from '@/utils/npvCalculations';
import {
  CONFIGURATIONS, SCALING_EXPONENT, SUPPLY_SCENARIOS,
  scaleCapex, scaleComparison, productSlate, feasibilityStreams, licensingProgress,
} from '@/utils/downstream/engine/modularRefinery';

const TABLE = 'saved_modular_refinery_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save feasibility studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds4_modular_refinery_persistence');

export const defaultInputs = () => ({
  configurationId: 'hydroskimming',
  capacityBpd: 10000,
  onstreamDays: 340,
  scenarioId: 'firm',
  crudeCostPerBbl: 80,
  prices: { lpg: 55, gasoline: 108, naphtha: 78, kerosene: 100, diesel: 104, fuelOil: 58 },
  yieldOverrides: null,
  // Reference point for the scaling curves. A real study replaces these with
  // vendor quotations, which is what the exponents are for.
  baseCost: 100e6,
  baseCapacity: 10000,
  modularExponent: SCALING_EXPONENT.MODULAR,
  stickBuiltExponent: SCALING_EXPONENT.STICK_BUILT,
  fixedOpexPerYear: 12e6,
  variableOpexPerBbl: 3.5,
  projectLife: 20,
  constructionYears: 2,
  discountRate: 12,
  royaltyRate: 0,
  taxRate: 30,
  licensingComplete: [],
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!raw.configurationId || !CONFIGURATIONS[raw.configurationId]) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    prices: { ...base.prices, ...(raw.prices || {}) },
    licensingComplete: Array.isArray(raw.licensingComplete) ? raw.licensingComplete : [],
  };
};

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const Ctx = createContext();

export const useModularRefinery = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useModularRefinery must be used within a ModularRefineryProvider');
  return ctx;
};

export const ModularRefineryProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const set = useCallback((patch) => setInputs((p) => ({ ...p, ...patch })), []);
  const setPrice = useCallback((id, v) => setInputs((p) => ({
    ...p, prices: { ...p.prices, [id]: v },
  })), []);
  const toggleLicence = useCallback((id) => setInputs((p) => ({
    ...p,
    licensingComplete: p.licensingComplete.includes(id)
      ? p.licensingComplete.filter((x) => x !== id)
      : [...p.licensingComplete, id],
  })), []);

  const configuration = CONFIGURATIONS[inputs.configurationId] ?? CONFIGURATIONS.hydroskimming;
  const scenario = SUPPLY_SCENARIOS.find((s) => s.id === inputs.scenarioId) ?? SUPPLY_SCENARIOS[0];

  const yields = inputs.yieldOverrides ?? configuration.productYields;

  const slate = useMemo(() => productSlate({
    productYields: yields,
    prices: Object.entries(inputs.prices).reduce((acc, [k, v]) => {
      const n = num(v, NaN);
      if (Number.isFinite(n)) acc[k] = n;
      return acc;
    }, {}),
  }), [yields, inputs.prices]);

  const capex = useMemo(() => scaleCapex({
    baseCost: num(inputs.baseCost),
    baseCapacity: num(inputs.baseCapacity),
    capacity: num(inputs.capacityBpd),
    exponent: num(inputs.modularExponent, SCALING_EXPONENT.MODULAR),
  }), [inputs.baseCost, inputs.baseCapacity, inputs.capacityBpd, inputs.modularExponent]);

  const comparison = useMemo(() => {
    const cap = num(inputs.capacityBpd, 10000);
    const capacities = [0.2, 0.5, 1, 2, 5, 10].map((f) => Math.round(cap * f));
    return scaleComparison({
      baseCost: num(inputs.baseCost),
      baseCapacity: num(inputs.baseCapacity),
      capacities,
      modularExponent: num(inputs.modularExponent, SCALING_EXPONENT.MODULAR),
      stickBuiltExponent: num(inputs.stickBuiltExponent, SCALING_EXPONENT.STICK_BUILT),
    });
  }, [inputs.baseCost, inputs.baseCapacity, inputs.capacityBpd, inputs.modularExponent, inputs.stickBuiltExponent]);

  const streams = useMemo(() => feasibilityStreams({
    capacityBpd: num(inputs.capacityBpd),
    onstreamDays: num(inputs.onstreamDays, 340),
    utilisation: scenario.utilisation,
    crudeCostPerBbl: num(inputs.crudeCostPerBbl) + num(scenario.crudePremium),
    slate,
    fixedOpexPerYear: num(inputs.fixedOpexPerYear),
    variableOpexPerBbl: num(inputs.variableOpexPerBbl),
    projectLife: num(inputs.projectLife, 20),
    constructionYears: num(inputs.constructionYears, 2),
    capex: capex.cost ?? 0,
  }), [inputs, scenario, slate, capex]);

  /**
   * Value the streams through the SANCTIONED screening engine.
   *
   * The engine above deliberately stops at the streams. This runs them
   * through calculateEconomics, the same engine behind the NPV Scenario
   * Builder and the Breakeven Analyzer, so a feasibility NPV means the same
   * thing as an NPV anywhere else in the Suite. Full Nigerian fiscal detail
   * belongs to Petroleum Economics Studio, and the app says so.
   */
  const economics = useMemo(() => {
    const life = streams.years.length;
    if (life === 0) return null;
    const mm = (v) => v / 1e6;
    return calculateEconomics({
      startYear: new Date().getFullYear(),
      projectLife: life,
      discountRate: num(inputs.discountRate, 12),
      fiscalType: 'TaxRoyalty',
      // Refinery throughput is a cost, not a revenue stream, so the "oil"
      // production row is left empty and the product revenue is carried as a
      // negative operating cost. Stated because it is unusual and would
      // otherwise look like a mistake.
      production: { oil: streams.years.map(() => 0), gas: streams.years.map(() => 0) },
      price: { oil: streams.years.map(() => 0), gas: streams.years.map(() => 0) },
      capex: streams.years.map((y) => mm(y.capex)),
      opexFixed: streams.years.map((y) => mm(y.fixedOpex + y.crudeCost + y.variableOpex - y.revenue)),
      opexVariable: streams.years.map(() => 0),
      abandonment: streams.years.map(() => 0),
      royaltyRate: num(inputs.royaltyRate, 0),
      taxRate: num(inputs.taxRate, 30),
    });
  }, [streams, inputs.discountRate, inputs.royaltyRate, inputs.taxRate]);

  const scenarioComparison = useMemo(() => SUPPLY_SCENARIOS.map((s) => {
    const st = feasibilityStreams({
      capacityBpd: num(inputs.capacityBpd),
      onstreamDays: num(inputs.onstreamDays, 340),
      utilisation: s.utilisation,
      crudeCostPerBbl: num(inputs.crudeCostPerBbl) + s.crudePremium,
      slate,
      fixedOpexPerYear: num(inputs.fixedOpexPerYear),
      variableOpexPerBbl: num(inputs.variableOpexPerBbl),
      projectLife: num(inputs.projectLife, 20),
      constructionYears: num(inputs.constructionYears, 2),
      capex: capex.cost ?? 0,
    });
    const annualMargin = st.annualBbl * st.grossMarginPerBbl - num(inputs.fixedOpexPerYear);
    return {
      ...s,
      annualBbl: st.annualBbl,
      grossMarginPerBbl: st.grossMarginPerBbl,
      annualMargin,
      // Simple payback on the capital, which is the number a sponsor asks
      // first. The discounted picture is on the economics panel.
      simplePaybackYears: annualMargin > 0 ? (capex.cost ?? 0) / annualMargin : null,
    };
  }), [inputs, slate, capex]);

  const licensing = useMemo(
    () => licensingProgress(inputs.licensingComplete),
    [inputs.licensingComplete],
  );

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
    watch: inputs, noun: 'Study',
  });

  const value = {
    inputs, set, setPrice, toggleLicence,
    configuration, scenario, slate, capex, comparison, streams, economics,
    scenarioComparison, licensing, configurations: CONFIGURATIONS, scenarios: SUPPLY_SCENARIOS,
    persistence, notifications, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
