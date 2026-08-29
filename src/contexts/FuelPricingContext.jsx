// Fuel Pricing & Supply Chain Studio state (Midstream & Downstream DS6).
//
// The build-up ships as line items with the rates absent, because duties,
// levies and regulated margins are set by regulation and change. An app that
// shipped rates would be read as authority and would go stale in silence.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  landedCost, buildPumpPrice, marginWaterfall, truckingEconomics,
  fleetSizing, stationSizing, priceSensitivity,
  IMPORT_TEMPLATE, PUMP_TEMPLATE, PRODUCT_REFERENCE, RATE_DISCLAIMER,
} from '@/utils/downstream/engine/fuelPricing';

const TABLE = 'saved_fuel_pricing_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save pricing studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds6_fuel_pricing_persistence');

export { PRODUCT_REFERENCE, RATE_DISCLAIMER };

const withIds = (rows) => rows.map((r) => ({ ...r, rowId: uuidv4() }));

export const defaultInputs = () => ({
  cargo: {
    product: 'PMS', quantity: 37000, quantityUnit: 'tonne', densityKgM3: 745,
    fobPrice: 700, fobBasis: 'per_tonne', oceanLossPercent: 0.5,
  },
  fxRate: 1550,
  // Rates absent by design. The shape is the deliverable; the numbers are
  // the user's, and the app says so until they are supplied.
  charges: withIds(IMPORT_TEMPLATE),
  elements: withIds(PUMP_TEMPLATE),
  capPerLitre: '',
  lane: {
    distanceKm: 400, payloadLitres: 45000, averageSpeedKmh: 40,
    loadHours: 2, dischargeHours: 1.5, queueHours: 1,
    fuelConsumptionLPer100Km: 38, dieselPricePerLitre: 1150,
    driverCostPerTrip: 60000, maintenancePerKm: 45, tyresPerKm: 25,
    overheadPerTrip: 40000, tollsAndLeviesPerTrip: 25000,
    truckCapitalCost: 90000000, truckLifeYears: 8,
    workingHoursPerDay: 12, workingDaysPerYear: 300,
    transitLossPercent: 0.2, dieselEmissionFactorKgCo2ePerLitre: '',
  },
  demandLitresPerDay: 180000,
  station: {
    dailyThroughputLitres: 60000, peakHourShare: 0.12,
    litresPerTransaction: 30, dispenseRateLitresPerMinute: 40,
    transactionOverheadMinutes: 1.5, nozzles: 6,
    tankCapacityLitres: 45000, deadStockLitres: 3000, reorderAtFraction: 0.25,
  },
  sensitivity: { low: 1000, high: 2600, steps: 7 },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!raw.cargo || typeof raw.cargo !== 'object') return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    cargo: { ...base.cargo, ...raw.cargo },
    lane: { ...base.lane, ...raw.lane },
    station: { ...base.station, ...raw.station },
    sensitivity: { ...base.sensitivity, ...(raw.sensitivity || {}) },
    charges: Array.isArray(raw.charges) && raw.charges.length ? raw.charges : base.charges,
    elements: Array.isArray(raw.elements) && raw.elements.length ? raw.elements : base.elements,
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useFuelPricing = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFuelPricing must be used within a FuelPricingProvider');
  return ctx;
};

export const FuelPricingProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, [key]: { ...p[key], ...patch },
  })), []);
  const setField = useCallback((key, value) => setInputs((p) => ({ ...p, [key]: value })), []);
  const setCharge = useCallback((rowId, patch) => setInputs((p) => ({
    ...p, charges: p.charges.map((c) => (c.rowId === rowId ? { ...c, ...patch } : c)),
  })), []);
  const setElement = useCallback((rowId, patch) => setInputs((p) => ({
    ...p, elements: p.elements.map((c) => (c.rowId === rowId ? { ...c, ...patch } : c)),
  })), []);

  /** The cargo, landed. Rates the user has not supplied stay absent. */
  const landed = useMemo(() => landedCost({
    quantity: numOrNull(inputs.cargo.quantity),
    quantityUnit: inputs.cargo.quantityUnit,
    densityKgM3: numOrNull(inputs.cargo.densityKgM3),
    fobPrice: numOrNull(inputs.cargo.fobPrice),
    fobBasis: inputs.cargo.fobBasis,
    charges: inputs.charges.map((c) => ({ ...c, amount: numOrNull(c.amount) })),
    oceanLossPercent: num(inputs.cargo.oceanLossPercent, 0),
    fxRate: numOrNull(inputs.fxRate),
  }), [inputs.cargo, inputs.charges, inputs.fxRate]);

  const lane = useMemo(() => truckingEconomics({
    ...inputs.lane,
    distanceKm: numOrNull(inputs.lane.distanceKm),
    payloadLitres: numOrNull(inputs.lane.payloadLitres),
    averageSpeedKmh: numOrNull(inputs.lane.averageSpeedKmh),
    dieselPricePerLitre: numOrNull(inputs.lane.dieselPricePerLitre),
    truckCapitalCost: numOrNull(inputs.lane.truckCapitalCost),
    truckLifeYears: numOrNull(inputs.lane.truckLifeYears),
    dieselEmissionFactorKgCo2ePerLitre: numOrNull(inputs.lane.dieselEmissionFactorKgCo2ePerLitre),
  }), [inputs.lane]);

  const pump = useMemo(() => buildPumpPrice({
    landedPerLitre: landed.perLitreLocal,
    elements: inputs.elements.map((e) => ({ ...e, amount: numOrNull(e.amount) })),
    capPerLitre: numOrNull(inputs.capPerLitre),
  }), [landed.perLitreLocal, inputs.elements, inputs.capPerLitre]);

  const waterfall = useMemo(() => marginWaterfall(pump), [pump]);

  const fleet = useMemo(() => fleetSizing({
    demandLitresPerDay: numOrNull(inputs.demandLitresPerDay),
    payloadLitres: numOrNull(inputs.lane.payloadLitres),
    tripsPerTruckPerDay: lane.tripsPerTruckPerDay,
  }), [inputs.demandLitresPerDay, inputs.lane.payloadLitres, lane.tripsPerTruckPerDay]);

  const station = useMemo(() => stationSizing({
    ...inputs.station,
    dailyThroughputLitres: numOrNull(inputs.station.dailyThroughputLitres),
    litresPerTransaction: numOrNull(inputs.station.litresPerTransaction),
    dispenseRateLitresPerMinute: numOrNull(inputs.station.dispenseRateLitresPerMinute),
    nozzles: numOrNull(inputs.station.nozzles),
    tankCapacityLitres: numOrNull(inputs.station.tankCapacityLitres),
    deliveryPayloadLitres: numOrNull(inputs.lane.payloadLitres),
  }), [inputs.station, inputs.lane.payloadLitres]);

  /**
   * The exchange rate is the driver everything else hangs off, so the
   * sensitivity is run over it: the whole chain is re-priced at each rate
   * rather than scaled, since only part of the build-up is in dollars.
   */
  const sensitivity = useMemo(() => {
    const lo = num(inputs.sensitivity.low, 1000);
    const hi = num(inputs.sensitivity.high, 2600);
    const steps = Math.max(2, Math.min(25, Math.round(num(inputs.sensitivity.steps, 7))));
    const values = Array.from({ length: steps }, (_, i) => lo + ((hi - lo) * i) / (steps - 1));
    const priceAt = (fx) => {
      const l = landedCost({
        quantity: numOrNull(inputs.cargo.quantity),
        quantityUnit: inputs.cargo.quantityUnit,
        densityKgM3: numOrNull(inputs.cargo.densityKgM3),
        fobPrice: numOrNull(inputs.cargo.fobPrice),
        fobBasis: inputs.cargo.fobBasis,
        charges: inputs.charges.map((c) => ({ ...c, amount: numOrNull(c.amount) })),
        oceanLossPercent: num(inputs.cargo.oceanLossPercent, 0),
        fxRate: fx,
      });
      if (l.error || l.perLitreLocal === null) return NaN;
      return buildPumpPrice({
        landedPerLitre: l.perLitreLocal,
        elements: inputs.elements.map((e) => ({ ...e, amount: numOrNull(e.amount) })),
      }).pricePerLitre;
    };
    return priceSensitivity({
      price: priceAt, values, capPerLitre: numOrNull(inputs.capPerLitre),
    });
  }, [inputs.cargo, inputs.charges, inputs.elements, inputs.capPerLitre, inputs.sensitivity]);

  /**
   * The lane's own cost per litre is offered for the transport line rather
   * than written into it, because silently overwriting a rate the user typed
   * is how a build-up stops meaning what its author thinks it means.
   */
  const applyLaneCostToTransport = useCallback(() => {
    if (lane.error || lane.costPerLitreDelivered === null) return false;
    const row = inputs.elements.find((e) => e.id === 'transport');
    if (!row) return false;
    setElement(row.rowId, { amount: Number(lane.costPerLitreDelivered.toFixed(4)) });
    addNotification('Transport line set from the lane cost.', 'success');
    return true;
  }, [lane, inputs.elements, setElement, addNotification]);

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
    inputs, setSection, setField, setCharge, setElement,
    landed, pump, waterfall, lane, fleet, station, sensitivity,
    applyLaneCostToTransport,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
