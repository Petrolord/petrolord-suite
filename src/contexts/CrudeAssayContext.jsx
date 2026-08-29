// Crude Assay & Blending Studio state (Midstream & Downstream DS1).
//
// The first app of the module. Holds an assay library, a blend recipe over
// it, and a valuation, with everything derived rather than stored: the blend
// properties, the cut yields, the stability screen and the netback are all
// pure functions of the inputs, so a saved study is its inputs and nothing
// else, and reopening one cannot show numbers that no longer follow from it.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  blendCrudes, cutYields, netbackValue, sgFromApi, watsonK,
} from '@/utils/downstream/engine/crudeAssay';

const TABLE = 'saved_crude_assay_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save assay studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds1_crude_assay_persistence');

/**
 * The default cut set.
 *
 * Boiling ranges are the conventional refinery cuts. They are editable,
 * because every refinery draws its cut points where its own units want them,
 * and a studio that fixes them is describing someone else's plant.
 */
export const DEFAULT_CUTS = () => ([
  { id: 'lpg', name: 'LPG / Light ends', fromF: null, toF: 90 },
  { id: 'naphtha', name: 'Naphtha', fromF: 90, toF: 350 },
  { id: 'kerosene', name: 'Kerosene / Jet', fromF: 350, toF: 500 },
  { id: 'diesel', name: 'Diesel / Gasoil', fromF: 500, toF: 650 },
  { id: 'vgo', name: 'Vacuum gasoil', fromF: 650, toF: 1000 },
  { id: 'residue', name: 'Vacuum residue', fromF: 1000, toF: null },
]);

/**
 * Two worked assays to open on.
 *
 * These are illustrative figures for two well-known light sweet West African
 * grades, at the level of detail a screening study uses. They are labelled as
 * a starting point in the UI, not presented as published assay sheets, and a
 * real study replaces them with the seller's assay.
 */
export const DEFAULT_CRUDES = () => ([
  {
    id: uuidv4(),
    name: 'Light sweet (example)',
    api: 35.4,
    sulfurWtPct: 0.15,
    tanMgKohG: 0.30,
    nitrogenWtPct: 0.10,
    nickelPpm: 5,
    vanadiumPpm: 1,
    viscosityCSt: 5,
    volumeFraction: 60,
    sara: { saturates: '', aromatics: '', resins: '', asphaltenes: '' },
    curve: [
      { volumePercent: 0, temperatureF: 80 },
      { volumePercent: 10, temperatureF: 210 },
      { volumePercent: 30, temperatureF: 400 },
      { volumePercent: 50, temperatureF: 560 },
      { volumePercent: 70, temperatureF: 760 },
      { volumePercent: 90, temperatureF: 1080 },
      { volumePercent: 100, temperatureF: 1400 },
    ],
  },
  {
    id: uuidv4(),
    name: 'Medium sour (example)',
    api: 24.0,
    sulfurWtPct: 2.20,
    tanMgKohG: 0.45,
    nitrogenWtPct: 0.22,
    nickelPpm: 22,
    vanadiumPpm: 60,
    viscosityCSt: 45,
    volumeFraction: 40,
    sara: { saturates: '', aromatics: '', resins: '', asphaltenes: '' },
    curve: [
      { volumePercent: 0, temperatureF: 100 },
      { volumePercent: 10, temperatureF: 300 },
      { volumePercent: 30, temperatureF: 520 },
      { volumePercent: 50, temperatureF: 690 },
      { volumePercent: 70, temperatureF: 900 },
      { volumePercent: 90, temperatureF: 1250 },
      { volumePercent: 100, temperatureF: 1500 },
    ],
  },
]);

export const DEFAULT_VALUATION = () => ({
  prices: { lpg: 55, naphtha: 78, kerosene: 96, diesel: 101, vgo: 72, residue: 44 },
  processingCostPerBbl: 4.5,
  freightPerBbl: 2.0,
  lossPercent: 0.5,
  markerNetback: '',
});

export const defaultInputs = () => ({
  crudes: DEFAULT_CRUDES(),
  cuts: DEFAULT_CUTS(),
  valuation: DEFAULT_VALUATION(),
});

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Strip a SARA block that has not been filled in, so it is absent not zero. */
const usableSara = (sara) => {
  if (!sara) return undefined;
  const keys = ['saturates', 'aromatics', 'resins', 'asphaltenes'];
  const values = keys.map((k) => num(sara[k]));
  if (values.some((v) => !Number.isFinite(v))) return undefined;
  return keys.reduce((acc, k, i) => ({ ...acc, [k]: values[i] }), {});
};

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.crudes) || raw.crudes.length === 0) return null;
  const base = defaultInputs();
  return {
    crudes: raw.crudes,
    cuts: Array.isArray(raw.cuts) && raw.cuts.length > 0 ? raw.cuts : base.cuts,
    valuation: { ...base.valuation, ...(raw.valuation || {}) },
  };
};

const Ctx = createContext();

export const useCrudeAssay = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCrudeAssay must be used within a CrudeAssayProvider');
  return ctx;
};

export const CrudeAssayProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setCrude = useCallback((id, patch) => {
    setInputs((prev) => ({
      ...prev,
      crudes: prev.crudes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const addCrude = useCallback(() => {
    setInputs((prev) => ({
      ...prev,
      crudes: [...prev.crudes, {
        id: uuidv4(),
        name: `Crude ${prev.crudes.length + 1}`,
        api: 30, sulfurWtPct: 1.0, tanMgKohG: 0.2, nitrogenWtPct: 0.1,
        nickelPpm: 10, vanadiumPpm: 20, viscosityCSt: 15, volumeFraction: 0,
        sara: { saturates: '', aromatics: '', resins: '', asphaltenes: '' },
        curve: DEFAULT_CRUDES()[0].curve.map((p) => ({ ...p })),
      }],
    }));
  }, []);

  const removeCrude = useCallback((id) => {
    setInputs((prev) => (prev.crudes.length <= 1 ? prev : {
      ...prev,
      crudes: prev.crudes.filter((c) => c.id !== id),
    }));
  }, []);

  const setCut = useCallback((id, patch) => {
    setInputs((prev) => ({
      ...prev,
      cuts: prev.cuts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const setValuation = useCallback((patch) => {
    setInputs((prev) => ({ ...prev, valuation: { ...prev.valuation, ...patch } }));
  }, []);

  const setPrice = useCallback((cutId, value) => {
    setInputs((prev) => ({
      ...prev,
      valuation: { ...prev.valuation, prices: { ...prev.valuation.prices, [cutId]: value } },
    }));
  }, []);

  // --- Everything below is derived, never stored ---

  const engineComponents = useMemo(() => inputs.crudes.map((c) => ({
    id: c.id,
    name: c.name,
    api: num(c.api),
    sg: sgFromApi(num(c.api)),
    sulfurWtPct: c.sulfurWtPct === '' ? undefined : num(c.sulfurWtPct),
    tanMgKohG: c.tanMgKohG === '' ? undefined : num(c.tanMgKohG),
    nitrogenWtPct: c.nitrogenWtPct === '' ? undefined : num(c.nitrogenWtPct),
    nickelPpm: c.nickelPpm === '' ? undefined : num(c.nickelPpm),
    vanadiumPpm: c.vanadiumPpm === '' ? undefined : num(c.vanadiumPpm),
    viscosityCSt: c.viscosityCSt === '' ? undefined : num(c.viscosityCSt),
    volumeFraction: num(c.volumeFraction, 0),
    sara: usableSara(c.sara),
  })), [inputs.crudes]);

  const blend = useMemo(() => blendCrudes(engineComponents), [engineComponents]);

  /**
   * The blend's own distillation curve.
   *
   * Yields are additive on volume, so the blended curve is built by mixing
   * the components' yields at each temperature rather than by averaging their
   * temperatures, which would be meaningless.
   */
  const blendedCurve = useMemo(() => {
    const fractions = blend.fractions || [];
    if (fractions.length === 0) return [];
    const temperatures = new Set();
    inputs.crudes.forEach((c) => (c.curve || []).forEach((p) => temperatures.add(num(p.temperatureF))));
    return [...temperatures]
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b)
      .map((temperatureF) => {
        let volumePercent = 0;
        inputs.crudes.forEach((c, i) => {
          const f = fractions[i]?.volumeFraction ?? 0;
          const pts = (c.curve || [])
            .map((p) => ({ v: num(p.volumePercent), t: num(p.temperatureF) }))
            .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t))
            .sort((a, b) => a.t - b.t);
          if (pts.length === 0) return;
          let v;
          if (temperatureF <= pts[0].t) v = pts[0].v;
          else if (temperatureF >= pts[pts.length - 1].t) v = pts[pts.length - 1].v;
          else {
            const k = pts.findIndex((p) => p.t >= temperatureF);
            const lo = pts[k - 1];
            const hi = pts[k];
            const span = hi.t - lo.t;
            v = span > 0 ? lo.v + ((temperatureF - lo.t) / span) * (hi.v - lo.v) : hi.v;
          }
          volumePercent += f * v;
        });
        return { temperatureF, volumePercent };
      });
  }, [inputs.crudes, blend.fractions]);

  const yields = useMemo(
    () => cutYields({ curve: blendedCurve, cuts: inputs.cuts }),
    [blendedCurve, inputs.cuts],
  );

  const perCrudeYields = useMemo(() => inputs.crudes.map((c) => ({
    id: c.id,
    name: c.name,
    ...cutYields({ curve: c.curve, cuts: inputs.cuts }),
  })), [inputs.crudes, inputs.cuts]);

  const valuation = useMemo(() => netbackValue({
    cuts: yields.cuts,
    prices: Object.entries(inputs.valuation.prices).reduce((acc, [k, v]) => {
      const n = num(v);
      if (Number.isFinite(n)) acc[k] = n;
      return acc;
    }, {}),
    processingCostPerBbl: num(inputs.valuation.processingCostPerBbl, 0),
    freightPerBbl: num(inputs.valuation.freightPerBbl, 0),
    lossPercent: num(inputs.valuation.lossPercent, 0),
    marker: inputs.valuation.markerNetback === '' ? null : num(inputs.valuation.markerNetback),
  }), [yields.cuts, inputs.valuation]);

  /**
   * Watson factor of the blend, from its 50 percent point.
   *
   * The volumetric mean boiling point would be the stricter basis; the 50
   * percent point is the screening one and is labelled as such in the UI so
   * nobody reads it as the former.
   */
  const characterization = useMemo(() => {
    const mid = blendedCurve.find((p) => p.volumePercent >= 50);
    if (!mid || !Number.isFinite(blend.properties?.sg)) return null;
    return {
      meanBoilingPointF: mid.temperatureF,
      watsonK: watsonK({ meanBoilingPointF: mid.temperatureF, sg: blend.properties.sg }),
    };
  }, [blendedCurve, blend.properties]);

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
    watch: inputs, noun: 'Study',
  });

  const value = {
    inputs,
    setCrude, addCrude, removeCrude, setCut, setValuation, setPrice,
    blend, blendedCurve, yields, perCrudeYields, valuation, characterization,
    persistence, notifications, addNotification, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
