// LPG & CNG Rollout Studio state (Midstream & Downstream DS7).
//
// Two fuels, one commercial question. The cylinder float and the CNG trailer
// float run through the same model, because a fleet in a cycle is a fleet in
// a cycle, and the bottling carousel and the dispensing forecourt run
// through the same queue as the DS5 loading rack.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  assetFloat, lpgBlendProperties, lpgStorageSizing, vaporizerDuty, bottlingPlant,
  gasMassInVessel, cascadeFills, cngCompression, cngDispensing, conversionEconomics,
  LPG_REFERENCE, LPG_PROPERTY_NOTE,
} from '@/utils/downstream/engine/lpgCng';

const TABLE = 'saved_lpg_cng_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save rollout studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds7_lpg_cng_persistence');

export { LPG_REFERENCE, LPG_PROPERTY_NOTE };

const propane = LPG_REFERENCE.find((r) => r.code === 'propane');
const butane = LPG_REFERENCE.find((r) => r.code === 'butane');

export const defaultInputs = () => ({
  lpg: {
    components: [
      { id: uuidv4(), code: 'propane', label: propane.label, volumeFraction: 0.4, liquidDensityKgM3: propane.typicalLiquidDensityKgM3, molarMassKgKmol: propane.molarMassKgKmol, latentHeatKJkg: propane.typicalLatentHeatKJkg },
      { id: uuidv4(), code: 'butane', label: butane.label, volumeFraction: 0.6, liquidDensityKgM3: butane.typicalLiquidDensityKgM3, molarMassKgKmol: butane.molarMassKgKmol, latentHeatKJkg: butane.typicalLatentHeatKJkg },
    ],
    // No default: the fill limit is a safety code limit, not a convenience.
    vesselCapacityM3: 100, maxFillRatio: '',
    demandTonnesPerDay: 6, deliveryTonnes: 15, leadTimeDays: 3, safetyDays: 2,
    vaporizer: {
      massFlowKgHr: 500, liquidCpKJkgK: 2.5, inletTempC: 25,
      vapourCpKJkgK: 1.7, outletTempC: 15, designMarginPercent: 20,
    },
    bottling: {
      cylindersPerDay: 2400, fillMinutesPerCylinder: 2.5, positions: 16,
      shiftHoursPerDay: 8, availabilityFraction: 0.9,
    },
    cylinderCycle: [
      { id: uuidv4(), label: 'At the customer', days: 21 },
      { id: uuidv4(), label: 'In transit out', days: 1 },
      { id: uuidv4(), label: 'At the plant', days: 2 },
      { id: uuidv4(), label: 'In transit back', days: 1 },
    ],
    cylinderSparesFraction: 0.1,
  },
  cng: {
    gasSg: 0.6, temperatureC: 15,
    banks: [
      { id: uuidv4(), label: 'Low', volumeM3: 1.5, pressureBar: 250 },
      { id: uuidv4(), label: 'Mid', volumeM3: 1.5, pressureBar: 250 },
      { id: uuidv4(), label: 'High', volumeM3: 1.5, pressureBar: 250 },
    ],
    vehicleTankM3: 0.08, vehicleStartBar: 20, vehicleTargetBar: 200,
    compression: {
      throughputKgPerHour: 250, suctionBar: 4, dischargeBar: 250, suctionTempC: 30,
      k: 1.31, polytropicEfficiency: 0.75,
    },
    dispensing: { vehiclesPerHour: 12, fillMinutes: 5, dispensers: 2 },
    trailerCycle: [
      { id: uuidv4(), label: 'Loading', days: 0.25 },
      { id: uuidv4(), label: 'Run out', days: 0.4 },
      { id: uuidv4(), label: 'On station', days: 1.2 },
      { id: uuidv4(), label: 'Run back', days: 0.4 },
    ],
    trailerTripsPerDay: 3, trailerSparesFraction: 0.15,
  },
  conversion: {
    annualDistanceKm: 40000,
    baseLabel: 'PMS', baseConsumptionPer100Km: 12, basePricePerUnit: 950,
    baseEnergyPerUnitMJ: 32, baseEmissionFactor: '',
    newLabel: 'CNG', newConsumptionPer100Km: '', newPricePerUnit: 500,
    newEnergyPerUnitMJ: 48, newEmissionFactor: '', efficiencyRatio: 1,
    conversionCost: 900000, annualExtraMaintenance: 40000,
  },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!raw.lpg || !raw.cng) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    lpg: {
      ...base.lpg,
      ...raw.lpg,
      vaporizer: { ...base.lpg.vaporizer, ...(raw.lpg.vaporizer || {}) },
      bottling: { ...base.lpg.bottling, ...(raw.lpg.bottling || {}) },
      components: Array.isArray(raw.lpg.components) && raw.lpg.components.length
        ? raw.lpg.components : base.lpg.components,
      cylinderCycle: Array.isArray(raw.lpg.cylinderCycle) && raw.lpg.cylinderCycle.length
        ? raw.lpg.cylinderCycle : base.lpg.cylinderCycle,
    },
    cng: {
      ...base.cng,
      ...raw.cng,
      compression: { ...base.cng.compression, ...(raw.cng.compression || {}) },
      dispensing: { ...base.cng.dispensing, ...(raw.cng.dispensing || {}) },
      banks: Array.isArray(raw.cng.banks) && raw.cng.banks.length ? raw.cng.banks : base.cng.banks,
      trailerCycle: Array.isArray(raw.cng.trailerCycle) && raw.cng.trailerCycle.length
        ? raw.cng.trailerCycle : base.cng.trailerCycle,
    },
    conversion: { ...base.conversion, ...(raw.conversion || {}) },
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useLpgCng = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLpgCng must be used within an LpgCngProvider');
  return ctx;
};

export const LpgCngProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setLpg = useCallback((patch) => setInputs((p) => ({ ...p, lpg: { ...p.lpg, ...patch } })), []);
  const setCng = useCallback((patch) => setInputs((p) => ({ ...p, cng: { ...p.cng, ...patch } })), []);
  const setConversion = useCallback((patch) => setInputs((p) => ({
    ...p, conversion: { ...p.conversion, ...patch },
  })), []);
  const setLpgSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, lpg: { ...p.lpg, [key]: { ...p.lpg[key], ...patch } },
  })), []);
  const setCngSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, cng: { ...p.cng, [key]: { ...p.cng[key], ...patch } },
  })), []);
  const setBank = useCallback((id, patch) => setInputs((p) => ({
    ...p, cng: { ...p.cng, banks: p.cng.banks.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
  })), []);
  const setComponent = useCallback((id, patch) => setInputs((p) => ({
    ...p,
    lpg: { ...p.lpg, components: p.lpg.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
  })), []);
  const setCycleStage = useCallback((which, id, patch) => setInputs((p) => {
    const key = which === 'lpg' ? 'cylinderCycle' : 'trailerCycle';
    const branch = which === 'lpg' ? 'lpg' : 'cng';
    return {
      ...p,
      [branch]: {
        ...p[branch],
        [key]: p[branch][key].map((s) => (s.id === id ? { ...s, ...patch } : s)),
      },
    };
  }), []);

  const blend = useMemo(() => lpgBlendProperties({
    components: inputs.lpg.components.map((c) => ({
      code: c.code,
      volumeFraction: numOrNull(c.volumeFraction),
      liquidDensityKgM3: numOrNull(c.liquidDensityKgM3),
      molarMassKgKmol: numOrNull(c.molarMassKgKmol),
      latentHeatKJkg: numOrNull(c.latentHeatKJkg),
    })),
  }), [inputs.lpg.components]);

  const storage = useMemo(() => lpgStorageSizing({
    vesselCapacityM3: numOrNull(inputs.lpg.vesselCapacityM3),
    // Deliberately not defaulted. See the engine note.
    maxFillRatio: numOrNull(inputs.lpg.maxFillRatio),
    liquidDensityKgM3: blend.error ? null : blend.densityKgM3,
    demandTonnesPerDay: numOrNull(inputs.lpg.demandTonnesPerDay),
    deliveryTonnes: numOrNull(inputs.lpg.deliveryTonnes),
    leadTimeDays: num(inputs.lpg.leadTimeDays),
    safetyDays: num(inputs.lpg.safetyDays),
  }), [inputs.lpg, blend]);

  const vaporizer = useMemo(() => vaporizerDuty({
    massFlowKgHr: numOrNull(inputs.lpg.vaporizer.massFlowKgHr),
    latentHeatKJkg: blend.error ? null : blend.latentHeatKJkg,
    liquidCpKJkgK: numOrNull(inputs.lpg.vaporizer.liquidCpKJkgK),
    inletTempC: numOrNull(inputs.lpg.vaporizer.inletTempC),
    // The bubble point of the blend stands in for the boiling point; a mix
    // does not have one, and the app says so rather than pretending.
    boilingPointC: butane.typicalBoilingPointC,
    vapourCpKJkgK: numOrNull(inputs.lpg.vaporizer.vapourCpKJkgK),
    outletTempC: numOrNull(inputs.lpg.vaporizer.outletTempC),
    designMarginPercent: num(inputs.lpg.vaporizer.designMarginPercent),
  }), [inputs.lpg.vaporizer, blend]);

  const bottling = useMemo(() => bottlingPlant({
    cylindersPerDay: numOrNull(inputs.lpg.bottling.cylindersPerDay),
    fillMinutesPerCylinder: numOrNull(inputs.lpg.bottling.fillMinutesPerCylinder),
    positions: numOrNull(inputs.lpg.bottling.positions),
    shiftHoursPerDay: num(inputs.lpg.bottling.shiftHoursPerDay, 8),
    availabilityFraction: num(inputs.lpg.bottling.availabilityFraction, 1),
  }), [inputs.lpg.bottling]);

  const cylinderFleet = useMemo(() => assetFloat({
    unitsPerDay: numOrNull(inputs.lpg.bottling.cylindersPerDay),
    cycleStages: inputs.lpg.cylinderCycle.map((s) => ({ label: s.label, days: numOrNull(s.days) })),
    sparesFraction: num(inputs.lpg.cylinderSparesFraction),
  }), [inputs.lpg.bottling.cylindersPerDay, inputs.lpg.cylinderCycle, inputs.lpg.cylinderSparesFraction]);

  const cascade = useMemo(() => cascadeFills({
    banks: inputs.cng.banks.map((b) => ({
      label: b.label, volumeM3: numOrNull(b.volumeM3), pressureBar: numOrNull(b.pressureBar),
    })),
    vehicleTankM3: numOrNull(inputs.cng.vehicleTankM3),
    vehicleStartBar: numOrNull(inputs.cng.vehicleStartBar),
    vehicleTargetBar: numOrNull(inputs.cng.vehicleTargetBar),
    temperatureC: num(inputs.cng.temperatureC, 15),
    gasSg: num(inputs.cng.gasSg, 0.6),
  }), [inputs.cng]);

  const bankInventory = useMemo(() => inputs.cng.banks.map((b) => ({
    id: b.id,
    label: b.label,
    ...gasMassInVessel({
      volumeM3: numOrNull(b.volumeM3),
      pressureBar: numOrNull(b.pressureBar),
      temperatureC: num(inputs.cng.temperatureC, 15),
      gasSg: num(inputs.cng.gasSg, 0.6),
    }),
  })), [inputs.cng.banks, inputs.cng.temperatureC, inputs.cng.gasSg]);

  const compression = useMemo(() => cngCompression({
    throughputKgPerHour: numOrNull(inputs.cng.compression.throughputKgPerHour),
    suctionBar: numOrNull(inputs.cng.compression.suctionBar),
    dischargeBar: numOrNull(inputs.cng.compression.dischargeBar),
    suctionTempC: numOrNull(inputs.cng.compression.suctionTempC),
    gasSg: num(inputs.cng.gasSg, 0.6),
    k: num(inputs.cng.compression.k, 1.31),
    polytropicEfficiency: num(inputs.cng.compression.polytropicEfficiency, 0.75),
  }), [inputs.cng.compression, inputs.cng.gasSg]);

  const dispensing = useMemo(() => cngDispensing({
    vehiclesPerHour: numOrNull(inputs.cng.dispensing.vehiclesPerHour),
    fillMinutes: numOrNull(inputs.cng.dispensing.fillMinutes),
    dispensers: numOrNull(inputs.cng.dispensing.dispensers),
    kgPerFill: cascade.error ? null : cascade.kgPerFill,
  }), [inputs.cng.dispensing, cascade]);

  const trailerFleet = useMemo(() => assetFloat({
    unitsPerDay: numOrNull(inputs.cng.trailerTripsPerDay),
    cycleStages: inputs.cng.trailerCycle.map((s) => ({ label: s.label, days: numOrNull(s.days) })),
    sparesFraction: num(inputs.cng.trailerSparesFraction),
  }), [inputs.cng.trailerTripsPerDay, inputs.cng.trailerCycle, inputs.cng.trailerSparesFraction]);

  const conversion = useMemo(() => {
    const c = inputs.conversion;
    return conversionEconomics({
      annualDistanceKm: numOrNull(c.annualDistanceKm),
      baseFuel: {
        label: c.baseLabel,
        consumptionPer100Km: numOrNull(c.baseConsumptionPer100Km),
        pricePerUnit: numOrNull(c.basePricePerUnit),
        energyPerUnitMJ: numOrNull(c.baseEnergyPerUnitMJ),
        emissionFactorKgCo2ePerUnit: numOrNull(c.baseEmissionFactor),
      },
      newFuel: {
        label: c.newLabel,
        consumptionPer100Km: numOrNull(c.newConsumptionPer100Km),
        pricePerUnit: numOrNull(c.newPricePerUnit),
        energyPerUnitMJ: numOrNull(c.newEnergyPerUnitMJ),
        emissionFactorKgCo2ePerUnit: numOrNull(c.newEmissionFactor),
        efficiencyRatio: num(c.efficiencyRatio, 1),
      },
      conversionCost: numOrNull(c.conversionCost),
      annualExtraMaintenance: num(c.annualExtraMaintenance),
    });
  }, [inputs.conversion]);

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
    inputs, setLpg, setCng, setConversion, setLpgSection, setCngSection,
    setBank, setComponent, setCycleStage,
    blend, storage, vaporizer, bottling, cylinderFleet,
    cascade, bankInventory, compression, dispensing, trailerFleet, conversion,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
