// Terminal & Depot Studio state (Midstream & Downstream DS5).
//
// Doctrine 4: uninstrumented first. Everything starts from a dip, because a
// terminal with a dip tape and a strapping table is the case this app is for,
// not a lesser one waiting to be upgraded.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  dipToStandardVolume, volumeCorrectionFactor, reconcileStock,
  trendUnaccounted, rackQueue, tankFarmCover, throughputEconomics,
} from '@/utils/downstream/engine/terminalDepot';

const TABLE = 'saved_terminal_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save terminal studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds5_terminal_persistence');

/** A linear strapping table stands in until the user loads their own. */
const sampleStrapping = (capacityM3, maxHeightMm) =>
  Array.from({ length: 21 }, (_, i) => ({
    heightMm: Math.round((i / 20) * maxHeightMm),
    volumeM3: Math.round((i / 20) * capacityM3),
  }));

export const defaultInputs = () => ({
  tanks: [
    { id: uuidv4(), name: 'T-01 (PMS)', product: 'PMS', capacityM3: 5000, heelM3: 120, maxHeightMm: 12000, densityKgM3: 745, dipMm: 7200, waterMm: 60, temperatureC: 30, vcf: '', strapping: sampleStrapping(5000, 12000) },
    { id: uuidv4(), name: 'T-02 (AGO)', product: 'AGO', capacityM3: 3000, heelM3: 80, maxHeightMm: 10000, densityKgM3: 840, dipMm: 4200, waterMm: 40, temperatureC: 30, vcf: '', strapping: sampleStrapping(3000, 10000) },
  ],
  // Published-table coefficients are not shipped; the user supplies their row
  // or a VCF read off their own tables.
  vcfCoefficients: { k0: '', k1: '', k2: '' },
  day: { receiptsM3: 800, deliveriesM3: 640, knownLossM3: 2, tolerancePercentOfThroughput: 0.5 },
  history: [
    { id: uuidv4(), date: '', unaccountedM3: -3, throughputM3: 1400 },
    { id: uuidv4(), date: '', unaccountedM3: -2, throughputM3: 1500 },
    { id: uuidv4(), date: '', unaccountedM3: -4, throughputM3: 1350 },
  ],
  rack: { arrivalsPerHour: 5, loadMinutes: 22, bays: 2 },
  economics: {
    feePerM3: 8, variableCostPerM3: 2, fixedCostPerPeriod: 30000,
    lossEmissionFactorKgCo2ePerTonne: '',
  },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.tanks) || raw.tanks.length === 0) return null;
  const base = defaultInputs();
  return {
    ...base,
    ...raw,
    vcfCoefficients: { ...base.vcfCoefficients, ...(raw.vcfCoefficients || {}) },
    day: { ...base.day, ...(raw.day || {}) },
    rack: { ...base.rack, ...(raw.rack || {}) },
    economics: { ...base.economics, ...(raw.economics || {}) },
    history: Array.isArray(raw.history) ? raw.history : [],
  };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v, fallback = 0) => (numOrNull(v) === null ? fallback : numOrNull(v));

const Ctx = createContext();

export const useTerminalDepot = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTerminalDepot must be used within a TerminalDepotProvider');
  return ctx;
};

export const TerminalDepotProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setTank = useCallback((id, patch) => setInputs((p) => ({
    ...p, tanks: p.tanks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  })), []);
  const setSection = useCallback((key, patch) => setInputs((p) => ({
    ...p, [key]: { ...p[key], ...patch },
  })), []);
  const addHistoryDay = useCallback(() => setInputs((p) => ({
    ...p, history: [...p.history, { id: uuidv4(), date: '', unaccountedM3: 0, throughputM3: 0 }],
  })), []);
  const setHistoryDay = useCallback((id, patch) => setInputs((p) => ({
    ...p, history: p.history.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  })), []);
  const removeHistoryDay = useCallback((id) => setInputs((p) => ({
    ...p, history: p.history.filter((d) => d.id !== id),
  })), []);

  /**
   * Each tank's stock from its dip.
   *
   * The VCF comes from the user's own coefficient row if supplied, otherwise
   * from a VCF typed straight in, otherwise it is absent and only the gross
   * volume is reported. Absent is a real state here, not a zero.
   */
  const tankStocks = useMemo(() => inputs.tanks.map((t) => {
    const typed = numOrNull(t.vcf);
    const coeff = numOrNull(inputs.vcfCoefficients.k0) === null ? null : {
      k0: num(inputs.vcfCoefficients.k0),
      k1: num(inputs.vcfCoefficients.k1),
      k2: num(inputs.vcfCoefficients.k2),
    };
    const computed = coeff
      ? volumeCorrectionFactor({
        densityKgM3: num(t.densityKgM3), temperatureC: num(t.temperatureC), coefficients: coeff,
      })
      : { vcf: null, error: null };
    const vcf = typed ?? computed.vcf;
    const stock = dipToStandardVolume({
      strapping: t.strapping, heightMm: numOrNull(t.dipMm), waterMm: num(t.waterMm, 0), vcf,
    });
    return {
      id: t.id, name: t.name, product: t.product,
      vcfSource: typed !== null ? 'entered' : computed.vcf !== null ? 'computed' : 'none',
      vcfError: computed.error,
      ...stock,
    };
  }), [inputs.tanks, inputs.vcfCoefficients]);

  const totalStockM3 = useMemo(
    () => tankStocks.reduce((s, t) => s + (t.standardM3 ?? t.grossM3 ?? 0), 0),
    [tankStocks],
  );

  const reconciliation = useMemo(() => reconcileStock({
    // Opening is yesterday's close, which the app takes as the dipped stock
    // less today's net movement: a terminal reconciles forward from a dip.
    openingM3: totalStockM3 - num(inputs.day.receiptsM3) + num(inputs.day.deliveriesM3) + num(inputs.day.knownLossM3),
    receiptsM3: num(inputs.day.receiptsM3),
    deliveriesM3: num(inputs.day.deliveriesM3),
    knownLossM3: num(inputs.day.knownLossM3),
    closingDippedM3: totalStockM3,
    tolerancePercentOfThroughput: num(inputs.day.tolerancePercentOfThroughput, 0.5),
  }), [totalStockM3, inputs.day]);

  const trend = useMemo(() => trendUnaccounted(inputs.history.map((d) => ({
    date: d.date, unaccountedM3: numOrNull(d.unaccountedM3), throughputM3: num(d.throughputM3),
  }))), [inputs.history]);

  const queue = useMemo(() => rackQueue({
    arrivalsPerHour: num(inputs.rack.arrivalsPerHour),
    loadMinutes: num(inputs.rack.loadMinutes),
    bays: num(inputs.rack.bays, 1),
  }), [inputs.rack]);

  const farm = useMemo(() => tankFarmCover({
    tanks: inputs.tanks.map((t, i) => ({
      capacityM3: num(t.capacityM3), heelM3: num(t.heelM3),
      stockM3: tankStocks[i]?.standardM3 ?? tankStocks[i]?.grossM3 ?? 0,
    })),
    dailyThroughputM3: num(inputs.day.receiptsM3) + num(inputs.day.deliveriesM3),
  }), [inputs.tanks, inputs.day, tankStocks]);

  const economics = useMemo(() => throughputEconomics({
    throughputM3: num(inputs.day.receiptsM3) + num(inputs.day.deliveriesM3),
    feePerM3: num(inputs.economics.feePerM3),
    variableCostPerM3: num(inputs.economics.variableCostPerM3),
    fixedCostPerPeriod: num(inputs.economics.fixedCostPerPeriod),
    lossM3: num(inputs.day.knownLossM3) + Math.abs(reconciliation.unaccountedM3 ?? 0),
    productDensityKgM3: num(inputs.tanks[0]?.densityKgM3, 800),
    lossEmissionFactorKgCo2ePerTonne: numOrNull(inputs.economics.lossEmissionFactorKgCo2ePerTonne),
  }), [inputs.day, inputs.economics, inputs.tanks, reconciliation]);

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
    inputs, setTank, setSection, addHistoryDay, setHistoryDay, removeHistoryDay,
    tankStocks, totalStockM3, reconciliation, trend, queue, farm, economics,
    persistence, notifications, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
