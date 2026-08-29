// Product Blending Optimizer state (Midstream & Downstream DS2).
//
// The module's second app and the first consumer of the LP kernel. As in DS1,
// everything shown is derived: the recipe, the achieved properties, the
// giveaway and the shadow prices are all functions of the pool and the
// specifications, so a saved study is its inputs and nothing else.
import React, {
  createContext, useContext, useCallback, useMemo, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  optimiseBlend, valueGiveaway, SPEC_TEMPLATES, BLEND_BASIS,
} from '@/utils/downstream/engine/productBlending';

const TABLE = 'saved_blend_optimizer_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save blend studies.',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'ds2_blend_optimizer_persistence');

/**
 * A worked gasoline pool to open on.
 *
 * Illustrative component qualities and prices, labelled as such in the UI.
 * The point of shipping one is that an empty optimiser teaches nothing about
 * what the tool does; the point of labelling it is that these are not anyone's
 * actual streams.
 */
export const DEFAULT_COMPONENTS = () => ([
  { id: uuidv4(), name: 'Reformate', cost: 92, sg: 0.80, density: 0.800, ron: 100, mon: 89, sulfurPpm: 2, rvp: 3.0, minVolume: 0, maxVolume: 600 },
  { id: uuidv4(), name: 'FCC gasoline', cost: 84, sg: 0.75, density: 0.750, ron: 92, mon: 80, sulfurPpm: 120, rvp: 6.0, minVolume: 0, maxVolume: 600 },
  { id: uuidv4(), name: 'Isomerate', cost: 89, sg: 0.66, density: 0.660, ron: 87, mon: 85, sulfurPpm: 1, rvp: 13.0, minVolume: 0, maxVolume: 300 },
  { id: uuidv4(), name: 'Butane', cost: 55, sg: 0.58, density: 0.580, ron: 94, mon: 89, sulfurPpm: 1, rvp: 52.0, minVolume: 0, maxVolume: 80 },
]);

/** Specs are stored as plain data; the index functions are re-attached on use. */
const stripSpec = (s) => ({
  id: s.id, name: s.name, basis: s.basis, min: s.min ?? null, max: s.max ?? null,
  unit: s.unit ?? '', note: s.note ?? null, indexOnMass: s.indexOnMass ?? false,
});

export const templateSpecs = (templateId) =>
  (SPEC_TEMPLATES[templateId]?.specs ?? []).map(stripSpec);

export const defaultInputs = () => ({
  templateId: 'gasoline_50ppm',
  components: DEFAULT_COMPONENTS(),
  specs: templateSpecs('gasoline_50ppm'),
  targetVolume: 1000,
  unitValues: { ron: 0.6, sulfurPpm: 0 },
});

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!Array.isArray(raw.components) || raw.components.length === 0) return null;
  const base = defaultInputs();
  return {
    templateId: raw.templateId ?? base.templateId,
    components: raw.components,
    specs: Array.isArray(raw.specs) && raw.specs.length > 0 ? raw.specs : base.specs,
    targetVolume: raw.targetVolume ?? base.targetVolume,
    unitValues: { ...base.unitValues, ...(raw.unitValues || {}) },
  };
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Re-attach the index conversions a stored spec cannot carry.
 *
 * Functions do not survive JSON, so an index-basis spec loaded from a saved
 * study arrives without its conversions. They are looked up from the template
 * that defines them by property id, and a spec whose conversions cannot be
 * found is downgraded to a plain volume basis WITH A NOTE rather than being
 * applied through an index that is not there.
 */
const withIndexFunctions = (spec) => {
  if (spec.basis !== BLEND_BASIS.INDEX) return spec;
  for (const template of Object.values(SPEC_TEMPLATES)) {
    const match = template.specs.find((s) => s.id === spec.id && s.basis === BLEND_BASIS.INDEX);
    if (match) return { ...spec, toIndex: match.toIndex, fromIndex: match.fromIndex, indexOnMass: match.indexOnMass ?? spec.indexOnMass };
  }
  return {
    ...spec,
    basis: BLEND_BASIS.VOLUME,
    note: `${spec.note ? `${spec.note} ` : ''}No blending index is defined for this property, so it is being treated linearly on volume.`,
  };
};

const Ctx = createContext();

export const useBlendOptimizer = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBlendOptimizer must be used within a BlendOptimizerProvider');
  return ctx;
};

export const BlendOptimizerProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(defaultInputs);

  const setComponent = useCallback((id, patch) => {
    setInputs((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const addComponent = useCallback(() => {
    setInputs((prev) => ({
      ...prev,
      components: [...prev.components, {
        id: uuidv4(), name: `Component ${prev.components.length + 1}`,
        cost: 90, sg: 0.78, density: 0.780, ron: 90, mon: 80,
        sulfurPpm: 10, rvp: 5, minVolume: 0, maxVolume: 500,
      }],
    }));
  }, []);

  const removeComponent = useCallback((id) => {
    setInputs((prev) => (prev.components.length <= 1 ? prev : {
      ...prev,
      components: prev.components.filter((c) => c.id !== id),
    }));
  }, []);

  const setSpec = useCallback((id, patch) => {
    setInputs((prev) => ({
      ...prev,
      specs: prev.specs.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const applyTemplate = useCallback((templateId) => {
    setInputs((prev) => ({ ...prev, templateId, specs: templateSpecs(templateId) }));
  }, []);

  const setTargetVolume = useCallback((v) => {
    setInputs((prev) => ({ ...prev, targetVolume: v }));
  }, []);

  const setUnitValue = useCallback((specId, v) => {
    setInputs((prev) => ({ ...prev, unitValues: { ...prev.unitValues, [specId]: v } }));
  }, []);

  // --- Derived ---

  const engineComponents = useMemo(() => inputs.components.map((c) => ({
    ...c,
    cost: num(c.cost, 0),
    sg: num(c.sg, num(c.density, 0.8)),
    minVolume: num(c.minVolume, 0),
    maxVolume: c.maxVolume === '' || c.maxVolume === null ? Infinity : num(c.maxVolume, Infinity),
    ron: num(c.ron), mon: num(c.mon), sulfurPpm: num(c.sulfurPpm),
    rvp: num(c.rvp), density: num(c.density), cetane: num(c.cetane),
    viscosityCSt: num(c.viscosityCSt), flashPointC: num(c.flashPointC),
  })), [inputs.components]);

  const engineSpecs = useMemo(() => inputs.specs.map((s) => withIndexFunctions({
    ...s,
    min: s.min === '' || s.min === null ? undefined : num(s.min),
    max: s.max === '' || s.max === null ? undefined : num(s.max),
  })), [inputs.specs]);

  const result = useMemo(() => optimiseBlend({
    components: engineComponents,
    specs: engineSpecs,
    targetVolume: num(inputs.targetVolume, 0),
  }), [engineComponents, engineSpecs, inputs.targetVolume]);

  const giveaway = useMemo(() => {
    if (result.status !== 'optimal') return [];
    return valueGiveaway({
      achieved: result.achieved,
      totalVolume: result.totalVolume,
      unitValues: Object.entries(inputs.unitValues).reduce((acc, [k, v]) => {
        const n = num(v);
        if (Number.isFinite(n) && n > 0) acc[k] = n;
        return acc;
      }, {}),
    });
  }, [result, inputs.unitValues]);

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
    inputs, setComponent, addComponent, removeComponent,
    setSpec, applyTemplate, setTargetVolume, setUnitValue,
    result, giveaway, templates: SPEC_TEMPLATES,
    persistence, notifications, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
