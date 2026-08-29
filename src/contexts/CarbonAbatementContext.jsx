// Carbon Footprint & Abatement Studio state (Midstream & Downstream DS9).
//
// The roll-up of a ledger the rest of the module already produces. No
// emission factors and no global warming potentials are shipped: both are
// published, revised documents, and a number without its version is not an
// auditable one.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  makeFactor, makeGwpSet, combustionCo2FromCarbon, emissionLine, buildInventory,
  carbonIntensity, abatementCost, abatementCurve, decarbonisationPath, SCOPE,
} from '@/utils/downstream/engine/carbonAbatement';

const TABLE = 'saved_carbon_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save carbon studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds9_carbon_persistence');

export { SCOPE };

export const defaultInputs = () => ({
  // The set is named by the user and its values are theirs. Nothing here.
  gwp: { label: '', ch4: '', n2o: '' },
  combustion: {
    fuelKmolPerYear: 620000, carbonPerKmolFuel: 1.12,
    destructionEfficiencyFraction: 1,
  },
  flare: {
    include: true, fuelKmolPerYear: 45000, carbonPerKmolFuel: 1.4,
    // The flare's destruction efficiency IS the answer for a flare, and it
    // is contested, so it is asked for rather than assumed.
    destructionEfficiencyFraction: '',
  },
  lines: [
    {
      id: uuidv4(), label: 'Vented and fugitive methane', scope: SCOPE.ONE,
      activity: 180, activityUnit: 't', gas: 'CH4',
      factorValue: 1, factorUnit: 'tCH4/t', source: '', version: '', vintage: '',
    },
    {
      id: uuidv4(), label: 'Purchased electricity', scope: SCOPE.TWO,
      activity: 42000, activityUnit: 'MWh', gas: 'CO2',
      factorValue: '', factorUnit: 'tCO2e/MWh', source: '', version: '', vintage: '',
    },
  ],
  intensity: {
    denominatorValue: 1500000, denominatorUnit: 'tonne charged', boundaryLabel: '',
  },
  measures: [
    { id: uuidv4(), label: 'Tune the fired heaters', capitalCost: 20000, annualSavings: 150000, annualCost: 0, tonnesAbatedPerYear: 900, lifeYears: 5, actsOn: 'heaters', startYear: 2027 },
    { id: uuidv4(), label: 'Repair failed steam traps', capitalCost: 60000, annualSavings: 240000, annualCost: 0, tonnesAbatedPerYear: 1400, lifeYears: 3, actsOn: 'steam', startYear: 2027 },
    { id: uuidv4(), label: 'Heat integration project', capitalCost: 3200000, annualSavings: 480000, annualCost: 0, tonnesAbatedPerYear: 4000, lifeYears: 15, actsOn: 'heaters', startYear: 2029 },
    { id: uuidv4(), label: 'Flare gas recovery', capitalCost: 5500000, annualSavings: 300000, annualCost: 120000, tonnesAbatedPerYear: 9000, lifeYears: 15, actsOn: 'flare', startYear: 2030 },
  ],
  plan: { discountRate: 0.1, startYear: 2026, endYear: 2032, targetReductionPercentByEnd: 30 },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.measures)) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    gwp: { ...base.gwp, ...(raw.gwp || {}) },
    combustion: { ...base.combustion, ...(raw.combustion || {}) },
    flare: { ...base.flare, ...(raw.flare || {}) },
    intensity: { ...base.intensity, ...(raw.intensity || {}) },
    plan: { ...base.plan, ...(raw.plan || {}) },
    lines: Array.isArray(raw.lines) && raw.lines.length ? raw.lines : base.lines,
    measures: raw.measures.length ? raw.measures : base.measures,
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useCarbonAbatement = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCarbonAbatement must be used within a CarbonAbatementProvider');
  return ctx;
};

export const CarbonAbatementProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, [key]: { ...p[key], ...patch },
  })), []);
  const setLine = useCallback((id, patch) => setInputs((p) => ({
    ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  })), []);
  const setMeasure = useCallback((id, patch) => setInputs((p) => ({
    ...p, measures: p.measures.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  })), []);
  const addMeasure = useCallback(() => setInputs((p) => ({
    ...p,
    measures: [...p.measures, {
      id: uuidv4(), label: `Measure ${p.measures.length + 1}`,
      capitalCost: 0, annualSavings: 0, annualCost: 0, tonnesAbatedPerYear: 0,
      lifeYears: 10, actsOn: '', startYear: num(p.plan.startYear, 2026),
    }],
  })), []);
  const removeMeasure = useCallback((id) => setInputs((p) => ({
    ...p, measures: p.measures.filter((m) => m.id !== id),
  })), []);

  const gwpSet = useMemo(() => makeGwpSet({
    label: inputs.gwp.label || null,
    values: {
      ...(numOrNull(inputs.gwp.ch4) === null ? {} : { CH4: numOrNull(inputs.gwp.ch4) }),
      ...(numOrNull(inputs.gwp.n2o) === null ? {} : { N2O: numOrNull(inputs.gwp.n2o) }),
    },
  }), [inputs.gwp]);

  /** Combustion CO2 comes from the carbon, not from a factor. */
  const combustion = useMemo(() => combustionCo2FromCarbon({
    fuelKmolPerYear: numOrNull(inputs.combustion.fuelKmolPerYear),
    carbonPerKmolFuel: numOrNull(inputs.combustion.carbonPerKmolFuel),
    destructionEfficiencyFraction: num(inputs.combustion.destructionEfficiencyFraction, 1),
  }), [inputs.combustion]);

  const flare = useMemo(() => (inputs.flare.include ? combustionCo2FromCarbon({
    fuelKmolPerYear: numOrNull(inputs.flare.fuelKmolPerYear),
    carbonPerKmolFuel: numOrNull(inputs.flare.carbonPerKmolFuel),
    destructionEfficiencyFraction: numOrNull(inputs.flare.destructionEfficiencyFraction),
  }) : { error: 'Flaring is not included in this inventory.' }), [inputs.flare]);

  /**
   * Atom-balance results become inventory lines through a factor of one, so
   * they sit in the same table as everything else and carry a source that
   * says what they are: conservation of mass rather than a document.
   */
  const atomLines = useMemo(() => {
    const rows = [];
    const push = (label, result, gas, tonnes) => {
      if (!result || result.error || !Number.isFinite(tonnes) || tonnes === 0) return;
      rows.push(emissionLine({
        label, scope: SCOPE.ONE, activity: tonnes, activityUnit: `t ${gas}`,
        factor: makeFactor({
          label: `${gas} from the atom balance`, value: 1, unit: `t${gas}/t${gas}`, gas,
          source: 'Atom balance (conservation of mass)', version: 'not applicable',
        }),
        gwpSet,
      }));
    };
    push('Fired heaters and boilers (CO2)', combustion, 'CO2', combustion.co2Tonnes);
    push('Fired heaters and boilers (unburned CH4)', combustion, 'CH4', combustion.ch4Tonnes);
    push('Flaring (CO2)', flare, 'CO2', flare.co2Tonnes);
    push('Flaring (unburned CH4)', flare, 'CH4', flare.ch4Tonnes);
    return rows;
  }, [combustion, flare, gwpSet]);

  const factorLines = useMemo(() => inputs.lines.map((l) => emissionLine({
    label: l.label, scope: l.scope,
    activity: numOrNull(l.activity), activityUnit: l.activityUnit,
    factor: makeFactor({
      id: l.id, label: `${l.label} factor`, value: numOrNull(l.factorValue),
      unit: l.factorUnit, gas: l.gas,
      source: l.source || null, version: l.version || null, vintage: l.vintage || null,
    }),
    gwpSet,
  })), [inputs.lines, gwpSet]);

  const inventory = useMemo(() => buildInventory({
    lines: [...atomLines, ...factorLines], gwpSet,
  }), [atomLines, factorLines, gwpSet]);

  const intensity = useMemo(() => carbonIntensity({
    inventory,
    denominatorValue: numOrNull(inputs.intensity.denominatorValue),
    denominatorUnit: inputs.intensity.denominatorUnit,
    boundaryLabel: inputs.intensity.boundaryLabel || null,
  }), [inventory, inputs.intensity]);

  const costedMeasures = useMemo(() => inputs.measures.map((m) => abatementCost({
    label: m.label,
    capitalCost: num(m.capitalCost),
    annualSavings: num(m.annualSavings),
    annualCost: num(m.annualCost),
    tonnesAbatedPerYear: numOrNull(m.tonnesAbatedPerYear),
    lifeYears: numOrNull(m.lifeYears),
    discountRate: num(inputs.plan.discountRate),
    actsOn: m.actsOn ? [m.actsOn] : [],
  })), [inputs.measures, inputs.plan.discountRate]);

  /**
   * What each source actually emits, so the curve can catch an abatement
   * claim that exceeds it.
   */
  const sourceEmissions = useMemo(() => ({
    heaters: (combustion.error ? 0 : combustion.co2Tonnes) || 0,
    flare: (flare.error ? 0 : flare.co2Tonnes) || 0,
  }), [combustion, flare]);

  const targetTonnes = useMemo(() => {
    const pct = numOrNull(inputs.plan.targetReductionPercentByEnd);
    if (pct === null || !inventory.totalTonnes) return null;
    return (inventory.totalTonnes * pct) / 100;
  }, [inputs.plan.targetReductionPercentByEnd, inventory.totalTonnes]);

  const curve = useMemo(() => abatementCurve({
    measures: costedMeasures, sourceEmissions, targetTonnes,
  }), [costedMeasures, sourceEmissions, targetTonnes]);

  const path = useMemo(() => {
    const y0 = num(inputs.plan.startYear, 2026);
    const y1 = num(inputs.plan.endYear, 2032);
    const pct = num(inputs.plan.targetReductionPercentByEnd, 0);
    const base = inventory.totalTonnes || 0;
    const targetByYear = {};
    for (let y = y0; y <= y1; y += 1) {
      // A straight line to the end-year target, which is what a headline
      // percentage actually implies until somebody says otherwise.
      const f = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
      targetByYear[y] = base * (1 - (pct / 100) * f);
    }
    return decarbonisationPath({
      baselineTonnes: base,
      measures: inputs.measures.map((m) => ({
        label: m.label,
        tonnesAbatedPerYear: numOrNull(m.tonnesAbatedPerYear),
        startYear: numOrNull(m.startYear),
      })),
      startYear: y0, endYear: y1, targetByYear,
    });
  }, [inputs.plan, inputs.measures, inventory.totalTonnes]);

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
    inputs, setSection, setLine, setMeasure, addMeasure, removeMeasure,
    gwpSet, combustion, flare, inventory, intensity,
    costedMeasures, curve, path, targetTonnes,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
