// Energy & Utilities Efficiency Studio state (Midstream & Downstream DS8).
//
// Track C opens here. Every saving found is priced in money AND in tonnes
// of CO2, from the same energy, in the same run: that is doctrine 3 turned
// into arithmetic rather than a separate ESG spreadsheet.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  combustionStoichiometry, excessAirFromFlueOxygen, stackLossEfficiency,
  excessAirSaving, steamTrapLoss, condensateReturnValue, energyIntensity,
  pinchTargets, compositeCurve, priceSaving,
  FUEL_REFERENCE, FUEL_REFERENCE_NOTE, PROPERTY_REFERENCE, HEATING_VALUE_BASIS,
} from '@/utils/downstream/engine/energyEfficiency';

const TABLE = 'saved_energy_efficiency_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save efficiency studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds8_energy_efficiency_persistence');

export { FUEL_REFERENCE, FUEL_REFERENCE_NOTE, PROPERTY_REFERENCE, HEATING_VALUE_BASIS };

const fuelRow = (code, moleFraction) => {
  const r = FUEL_REFERENCE.find((f) => f.code === code);
  return {
    id: uuidv4(), code, label: r.label, moleFraction,
    c: r.c, h: r.h, o: r.o, s: r.s, n: r.n,
    molarMassKgKmol: r.molarMassKgKmol,
    lhvMJKmol: r.typicalLhvMJKmol, hhvMJKmol: r.typicalHhvMJKmol,
  };
};

export const defaultInputs = () => ({
  fuel: [fuelRow('CH4', 0.9), fuelRow('C2H6', 0.08), fuelRow('N2', 0.02)],
  heater: {
    basis: HEATING_VALUE_BASIS.LHV,
    currentO2Percent: 6, targetO2Percent: 3,
    // Not defaulted: it comes off a published chart, and a floor below
    // which the burner makes CO is burner-specific.
    minimumSafeO2Percent: '', radiationLossPercent: '',
    stackTempC: 220, combustionAirTempC: 25,
    flueGasCpKJkgK: PROPERTY_REFERENCE.fluGasCpKJkgK.typical,
    waterVapourCpKJkgK: PROPERTY_REFERENCE.waterVapourCpKJkgK.typical,
    waterLatentHeatKJkg: PROPERTY_REFERENCE.waterLatentHeatKJkg.typical,
    unburnedLossPercent: 0,
    annualFuelEnergyGJ: 500000,
  },
  steam: {
    trapCount: 40, orificeDiameterMm: 3, upstreamPressureBarA: 11,
    dischargeCoefficient: '', steamDensityKgM3: 5.6, hoursPerYear: 8760,
    steamCostPerTonne: 25, steamEnergyMJPerTonne: 2700,
    boilerEfficiencyFraction: 0.85,
    steamTonnesPerHour: 20, currentReturnFraction: 0.4, targetReturnFraction: 0.7,
    condensateTempC: 90, makeupTempC: 25,
    waterCostPerTonne: 0.6, treatmentCostPerTonne: '',
  },
  ledger: { fuelCostPerGJ: 8, emissionFactorKgCo2ePerGJ: '' },
  intensity: {
    streams: [
      { id: uuidv4(), label: 'Fuel gas', energyGJ: 900000 },
      { id: uuidv4(), label: 'Purchased power', energyGJ: 120000 },
      { id: uuidv4(), label: 'Imported steam', energyGJ: 60000 },
    ],
    throughputTonnes: 1500000,
    peerIntensityMJPerTonne: '',
  },
  pinch: {
    minimumApproachC: 20,
    streams: [
      { id: uuidv4(), label: 'H1 reactor effluent', supplyC: 150, targetC: 60, cpKWperK: 2.0 },
      { id: uuidv4(), label: 'H2 product cooler', supplyC: 90, targetC: 60, cpKWperK: 8.0 },
      { id: uuidv4(), label: 'C1 feed preheat', supplyC: 20, targetC: 125, cpKWperK: 2.5 },
      { id: uuidv4(), label: 'C2 reboiler feed', supplyC: 25, targetC: 100, cpKWperK: 3.0 },
    ],
  },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.fuel) || raw.fuel.length === 0) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    fuel: raw.fuel,
    heater: { ...base.heater, ...(raw.heater || {}) },
    steam: { ...base.steam, ...(raw.steam || {}) },
    ledger: { ...base.ledger, ...(raw.ledger || {}) },
    intensity: {
      ...base.intensity,
      ...(raw.intensity || {}),
      streams: Array.isArray(raw.intensity?.streams) && raw.intensity.streams.length
        ? raw.intensity.streams : base.intensity.streams,
    },
    pinch: {
      ...base.pinch,
      ...(raw.pinch || {}),
      streams: Array.isArray(raw.pinch?.streams) && raw.pinch.streams.length
        ? raw.pinch.streams : base.pinch.streams,
    },
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useEnergyEfficiency = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEnergyEfficiency must be used within an EnergyEfficiencyProvider');
  return ctx;
};

export const EnergyEfficiencyProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, [key]: { ...p[key], ...patch },
  })), []);
  const setFuelRow = useCallback((id, patch) => setInputs((p) => ({
    ...p, fuel: p.fuel.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  })), []);
  const setPinchStream = useCallback((id, patch) => setInputs((p) => ({
    ...p,
    pinch: { ...p.pinch, streams: p.pinch.streams.map((s) => (s.id === id ? { ...s, ...patch } : s)) },
  })), []);
  const addPinchStream = useCallback(() => setInputs((p) => ({
    ...p,
    pinch: {
      ...p.pinch,
      streams: [...p.pinch.streams, {
        id: uuidv4(), label: `Stream ${p.pinch.streams.length + 1}`,
        supplyC: 100, targetC: 50, cpKWperK: 1,
      }],
    },
  })), []);
  const removePinchStream = useCallback((id) => setInputs((p) => ({
    ...p, pinch: { ...p.pinch, streams: p.pinch.streams.filter((s) => s.id !== id) },
  })), []);
  const setIntensityStream = useCallback((id, patch) => setInputs((p) => ({
    ...p,
    intensity: {
      ...p.intensity,
      streams: p.intensity.streams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    },
  })), []);

  const stoichiometry = useMemo(() => combustionStoichiometry({
    components: inputs.fuel.map((f) => ({
      code: f.code, moleFraction: numOrNull(f.moleFraction),
      c: f.c, h: f.h, o: f.o, s: f.s, n: f.n,
      molarMassKgKmol: f.molarMassKgKmol,
      lhvMJKmol: numOrNull(f.lhvMJKmol), hhvMJKmol: numOrNull(f.hhvMJKmol),
    })),
  }), [inputs.fuel]);

  const efficiencyAt = useCallback((o2) => {
    if (stoichiometry.error || o2 === null) return { error: 'Not available.' };
    const ea = excessAirFromFlueOxygen({ stoichiometry, dryO2Percent: o2 });
    if (ea.error) return ea;
    const h = inputs.heater;
    return stackLossEfficiency({
      stoichiometry, excessAir: ea,
      stackTempC: numOrNull(h.stackTempC), combustionAirTempC: numOrNull(h.combustionAirTempC),
      basis: h.basis,
      flueGasCpKJkgK: numOrNull(h.flueGasCpKJkgK),
      waterVapourCpKJkgK: numOrNull(h.waterVapourCpKJkgK),
      waterLatentHeatKJkg: numOrNull(h.waterLatentHeatKJkg),
      radiationLossPercent: numOrNull(h.radiationLossPercent),
      unburnedLossPercent: num(h.unburnedLossPercent),
    });
  }, [stoichiometry, inputs.heater]);

  const currentEfficiency = useMemo(
    () => efficiencyAt(numOrNull(inputs.heater.currentO2Percent)),
    [efficiencyAt, inputs.heater.currentO2Percent],
  );
  const targetEfficiency = useMemo(
    () => efficiencyAt(numOrNull(inputs.heater.targetO2Percent)),
    [efficiencyAt, inputs.heater.targetO2Percent],
  );

  const tuningSaving = useMemo(() => excessAirSaving({
    current: currentEfficiency, target: targetEfficiency,
    minimumSafeO2Percent: numOrNull(inputs.heater.minimumSafeO2Percent),
    targetO2Percent: numOrNull(inputs.heater.targetO2Percent),
    annualFuelEnergyGJ: numOrNull(inputs.heater.annualFuelEnergyGJ),
  }), [currentEfficiency, targetEfficiency, inputs.heater]);

  const trap = useMemo(() => steamTrapLoss({
    orificeDiameterMm: numOrNull(inputs.steam.orificeDiameterMm),
    upstreamPressureBarA: numOrNull(inputs.steam.upstreamPressureBarA),
    dischargeCoefficient: numOrNull(inputs.steam.dischargeCoefficient),
    steamDensityKgM3: numOrNull(inputs.steam.steamDensityKgM3),
    hoursPerYear: num(inputs.steam.hoursPerYear, 8760),
    steamCostPerTonne: numOrNull(inputs.steam.steamCostPerTonne),
    steamEnergyMJPerTonne: numOrNull(inputs.steam.steamEnergyMJPerTonne),
    boilerEfficiencyFraction: num(inputs.steam.boilerEfficiencyFraction, 1),
    emissionFactorKgCo2ePerGJ: numOrNull(inputs.ledger.emissionFactorKgCo2ePerGJ),
  }), [inputs.steam, inputs.ledger]);

  /** One failed trap is a nuisance; a population of them is a project. */
  const trapPopulation = useMemo(() => {
    const n = num(inputs.steam.trapCount, 0);
    if (trap.error) return { error: trap.error };
    return {
      error: null,
      count: n,
      tonnesPerYear: trap.tonnesPerYear * n,
      annualCost: trap.annualCost === null ? null : trap.annualCost * n,
      annualFuelGJ: trap.annualFuelGJ === null ? null : trap.annualFuelGJ * n,
      annualTonnesCo2e: trap.annualTonnesCo2e === null ? null : trap.annualTonnesCo2e * n,
    };
  }, [trap, inputs.steam.trapCount]);

  const condensate = useMemo(() => condensateReturnValue({
    steamTonnesPerHour: numOrNull(inputs.steam.steamTonnesPerHour),
    currentReturnFraction: numOrNull(inputs.steam.currentReturnFraction),
    targetReturnFraction: numOrNull(inputs.steam.targetReturnFraction),
    condensateTempC: numOrNull(inputs.steam.condensateTempC),
    makeupTempC: numOrNull(inputs.steam.makeupTempC),
    boilerEfficiencyFraction: numOrNull(inputs.steam.boilerEfficiencyFraction),
    fuelCostPerGJ: numOrNull(inputs.ledger.fuelCostPerGJ),
    waterCostPerTonne: numOrNull(inputs.steam.waterCostPerTonne),
    treatmentCostPerTonne: numOrNull(inputs.steam.treatmentCostPerTonne),
    emissionFactorKgCo2ePerGJ: numOrNull(inputs.ledger.emissionFactorKgCo2ePerGJ),
    hoursPerYear: num(inputs.steam.hoursPerYear, 8760),
  }), [inputs.steam, inputs.ledger]);

  const intensity = useMemo(() => energyIntensity({
    energyStreams: inputs.intensity.streams.map((s) => ({
      label: s.label, energyGJ: numOrNull(s.energyGJ),
    })),
    throughputTonnes: numOrNull(inputs.intensity.throughputTonnes),
    peerIntensityMJPerTonne: numOrNull(inputs.intensity.peerIntensityMJPerTonne),
  }), [inputs.intensity]);

  const pinchStreams = useMemo(() => inputs.pinch.streams.map((s) => ({
    label: s.label, supplyC: numOrNull(s.supplyC), targetC: numOrNull(s.targetC),
    cpKWperK: numOrNull(s.cpKWperK),
  })), [inputs.pinch.streams]);

  const pinch = useMemo(() => pinchTargets({
    streams: pinchStreams, minimumApproachC: numOrNull(inputs.pinch.minimumApproachC),
  }), [pinchStreams, inputs.pinch.minimumApproachC]);

  const composites = useMemo(() => ({
    hot: compositeCurve({ streams: pinchStreams, side: 'hot' }),
    cold: compositeCurve({ streams: pinchStreams, side: 'cold' }),
  }), [pinchStreams]);

  /**
   * The register: every saving on one page, in money and in carbon from the
   * same energy. The abatement cost is handed on for DS9 to rank rather than
   * ranked here.
   */
  const register = useMemo(() => {
    const fuelCost = numOrNull(inputs.ledger.fuelCostPerGJ);
    const ef = numOrNull(inputs.ledger.emissionFactorKgCo2ePerGJ);
    const rows = [];
    if (!tuningSaving.error && tuningSaving.annualEnergySavedGJ !== null) {
      rows.push({
        id: 'tuning', label: 'Tune the excess air',
        ...priceSaving({
          energySavedGJ: tuningSaving.annualEnergySavedGJ,
          fuelCostPerGJ: fuelCost, emissionFactorKgCo2ePerGJ: ef,
        }),
      });
    }
    if (!trapPopulation.error && trapPopulation.annualFuelGJ !== null) {
      rows.push({
        id: 'traps', label: `Repair ${trapPopulation.count} failed traps`,
        ...priceSaving({
          energySavedGJ: trapPopulation.annualFuelGJ,
          fuelCostPerGJ: fuelCost, emissionFactorKgCo2ePerGJ: ef,
        }),
      });
    }
    if (!condensate.error) {
      rows.push({
        id: 'condensate', label: 'Raise condensate return',
        ...priceSaving({
          energySavedGJ: condensate.energySavedGJPerYear,
          fuelCostPerGJ: fuelCost, emissionFactorKgCo2ePerGJ: ef,
        }),
      });
    }
    return rows;
  }, [tuningSaving, trapPopulation, condensate, inputs.ledger]);

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
    inputs, setSection, setFuelRow, setPinchStream, addPinchStream, removePinchStream,
    setIntensityStream,
    stoichiometry, currentEfficiency, targetEfficiency, tuningSaving,
    trap, trapPopulation, condensate, intensity, pinch, composites, register,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
