// Control Valve & Choke Sizing state (Facilities F11,
// Facilities-ROADMAP.md §3 app 11) — a NEW app on a fresh slug.
//
// The studio sizes at three flows, not one, because a valve that
// passes the maximum and cannot control at the minimum is the failure
// a single-point Cv calculation never shows.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  VALVE_STYLES, liquidValve, gasValve,
  valveAuthority, characteristicFor, noiseIndication, travelCheck,
} from '@/utils/facilities/engine/controlValve';
import { erosionalCheck, erosionalC, EROSIONAL_C } from '@/utils/production/engine/chokePerformance';

/**
 * Every derived block below is wrapped in this. A bare useMemo over an
 * engine call takes the whole studio down on a throw.
 */
const safe = (label, fn) => {
  try {
    return fn();
  } catch (e) {
    console.error(`${label} failed`, e);
    return { error: `The ${label} calculation could not be completed. Check the inputs above.` };
  }
};

const TABLE = 'saved_valve_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save valve studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_valve_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f11_saved_valve_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  service: {
    phase: 'liquid', styleId: 'globeCage',
    p1Psia: '200', p2Psia: '150',
  },
  liquid: {
    qMinGpm: '150', qNormGpm: '500', qMaxGpm: '750',
    sg: '0.85', pvPsia: '5', pcPsia: '3200',
  },
  gas: {
    qMinScfh: '150000', qNormScfh: '500000', qMaxScfh: '750000',
    gasSg: '0.65', tF: '100', z: '0.95', k: '1.28',
  },
  valve: {
    cvRated: '100', rangeability: '50', characteristic: 'equalPercentage',
    dpSystemTotalPsi: '120', fp: '1',
    outletIdIn: '4.026', erosionalCPreset: 'continuous',
  },
});

const SECTIONS = ['service', 'liquid', 'gas', 'valve'];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  return out;
};

const ValveContext = createContext();

export const useValve = () => {
  const context = useContext(ValveContext);
  if (!context) throw new Error('useValve must be used within a ValveStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const ValveStudioProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const setSection = useCallback((section, key, value) => {
    setInputs((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }, []);

  const isLiquid = inputs.service.phase === 'liquid';

  /** Size at all three flows: min, normal and max. */
  const cases = useMemo(() => {
    const built = safe('sizing', () => {
    const s = inputs.service;
    const common = {
      p1Psia: num(s.p1Psia),
      p2Psia: num(s.p2Psia),
      styleId: s.styleId,
      fp: num(inputs.valve.fp),
    };
    // No fallbacks: an empty box is not the same input as a typed one.
    // The vapour pressure one mattered most, because a cleared Pv box
    // used to supply exactly the engine default that switched the whole
    // cavitation screen off and printed "stable" in green.
    const build = (label, q) => {
      if (!(q > 0)) return { label, error: 'no flow stated' };
      const r = isLiquid
        ? liquidValve({
          ...common, qGpm: q,
          sg: num(inputs.liquid.sg),
          pvPsia: num(inputs.liquid.pvPsia),
          pcPsia: num(inputs.liquid.pcPsia),
        })
        : gasValve({
          ...common, qScfh: q,
          gasSg: num(inputs.gas.gasSg),
          tF: num(inputs.gas.tF),
          z: num(inputs.gas.z),
          k: num(inputs.gas.k),
        });
      return { label, flow: q, ...r };
    };
    return isLiquid
      ? [
        build('Minimum', num(inputs.liquid.qMinGpm)),
        build('Normal', num(inputs.liquid.qNormGpm)),
        build('Maximum', num(inputs.liquid.qMaxGpm)),
      ]
      : [
        build('Minimum', num(inputs.gas.qMinScfh)),
        build('Normal', num(inputs.gas.qNormScfh)),
        build('Maximum', num(inputs.gas.qMaxScfh)),
      ];
    });
    // always an array, so no consumer has to guard the shape
    return Array.isArray(built) ? built : [{ label: 'Sizing', error: built.error }];
  }, [inputs, isLiquid]);

  /** Authority and the characteristic it implies. */
  const authority = useMemo(() => safe('authority', () => {
    const dpValve = num(inputs.service.p1Psia) - num(inputs.service.p2Psia);
    const a = valveAuthority({
      dpValvePsi: dpValve,
      dpSystemTotalPsi: num(inputs.valve.dpSystemTotalPsi),
    });
    if (a.error) return a;
    const recommendation = characteristicFor({ authority: a.authority });
    // The studio used to show a recommended characteristic it never
    // applied, beside a dropdown nothing reconciled it with.
    const chosen = inputs.valve.characteristic === 'linear' ? 'linear' : 'equalPercentage';
    return {
      ...a,
      recommendation,
      chosenCharacteristic: chosen,
      recommendationApplied: recommendation.characteristic === chosen,
      disagreement: recommendation.characteristic === chosen ? null
        : `the travel figures below use the ${chosen === 'linear' ? 'linear' : 'equal percentage'} trim selected in the inputs, not the ${recommendation.characteristicLabel} this authority recommends. Change the characteristic to see the recommended trim, or keep the selection deliberately`,
    };
  }), [inputs.service, inputs.valve.dpSystemTotalPsi, inputs.valve.characteristic]);

  /** Travel at each flow against the rated Cv. */
  const travel = useMemo(() => safe('travel', () => {
    const cvOf = (label) => {
      const c = cases.find((x) => x.label === label);
      return c && !c.error ? c.cv : NaN;
    };
    return travelCheck({
      cvRequiredMin: cvOf('Minimum'),
      cvRequiredNormal: cvOf('Normal'),
      cvRequiredMax: cvOf('Maximum'),
      cvRated: num(inputs.valve.cvRated),
      characteristic: inputs.valve.characteristic === 'linear' ? 'linear' : 'equalPercentage',
      rangeability: num(inputs.valve.rangeability),
    });
  }), [cases, inputs.valve]);

  /** Noise indication at the maximum gas case. */
  const noise = useMemo(() => safe('noise indication', () => {
    if (isLiquid) return null;
    return noiseIndication({
      p1Psia: num(inputs.service.p1Psia),
      p2Psia: num(inputs.service.p2Psia),
      qScfh: num(inputs.gas.qMaxScfh),
      gasSg: num(inputs.gas.gasSg),
      tF: num(inputs.gas.tF),
    });
  }), [isLiquid, inputs.service, inputs.gas]);

  /**
   * Erosional limit on the body, reusing the validated RP 14E, AND THE
   * ACTUAL VELOCITY TO COMPARE IT WITH. The card used to compute a limit
   * and never compute a velocity, so the check it advertised could not
   * fire on any input at all. The velocity comes from the maximum case's
   * in-situ volumetric rate through the outlet bore the user states.
   *
   * The C factor is a stated choice from the published presets rather
   * than a two-phase continuous-service value silently applied to a
   * single-phase liquid.
   */
  const erosional = useMemo(() => safe('erosional', () => {
    const outletIdIn = num(inputs.valve.outletIdIn);
    if (!(outletIdIn > 0)) {
      return { error: 'state the valve outlet or downstream line bore to compare a velocity against the limit' };
    }
    const preset = erosionalC(inputs.valve.erosionalCPreset);
    let rho;
    let inSituBpd;
    if (isLiquid) {
      const sg = num(inputs.liquid.sg);
      const qGpm = num(inputs.liquid.qMaxGpm);
      if (!(sg > 0) || !(qGpm > 0)) {
        return { error: 'the erosional check needs a specific gravity and a maximum liquid rate' };
      }
      rho = sg * 62.366;
      // gpm to bbl/d
      inSituBpd = (qGpm * 60 * 24) / 42;
    } else {
      const gasSg = num(inputs.gas.gasSg);
      const p2 = num(inputs.service.p2Psia);
      const z = num(inputs.gas.z);
      const tR = num(inputs.gas.tF) + 459.67;
      const qScfh = num(inputs.gas.qMaxScfh);
      if (!(gasSg > 0) || !(p2 > 0) || !(z > 0) || !(tR > 0) || !(qScfh > 0)) {
        return { error: 'the erosional check needs a gas gravity, an outlet pressure, a z factor, a temperature and a maximum rate' };
      }
      rho = (28.9625 * gasSg * p2) / (z * 10.7316 * tR);
      // scfh at the 14.696 psia and 519.67 R base to actual ft3/d at outlet
      const actualFt3PerHr = qScfh * (14.696 / p2) * (tR / 519.67) * z;
      inSituBpd = (actualFt3PerHr * 24) / 5.614583333333333;
    }
    if (!(rho > 0)) return { error: 'cannot form a density for the erosional check' };
    const check = erosionalCheck({
      inSituBpd, idIn: outletIdIn, mixtureDensityLbFt3: rho, cFactor: preset.c,
    });
    if (check.error) return { error: check.error };
    return {
      ...check,
      rhoLbFt3: rho,
      inSituBpd,
      outletIdIn,
      preset,
      presets: EROSIONAL_C,
      phase: isLiquid ? 'liquid' : 'gas',
    };
  }), [isLiquid, inputs.liquid.sg, inputs.liquid.qMaxGpm, inputs.gas,
    inputs.service.p2Psia, inputs.valve.outletIdIn, inputs.valve.erosionalCPreset]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 1,
    ...SECTIONS.reduce((acc, s) => ({ ...acc, [s]: inputs[s] }), {}),
    modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { ...serialize(name), id });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Study "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [serialize, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) {
        addNotification('Study not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload?.name || projects.find((p) => p.id === id)?.name || 'Untitled study');
      setInputs(restored);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [projects, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
        setLastSaveTime(null);
      }
      setProjects(await service.list());
      addNotification('Study deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a study first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serialize(projectName));
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, projectName, serialize, addNotification]);

  const autosaveRef = useRef(null);
  autosaveRef.current = () => serialize(projectName);
  useEffect(() => {
    if (!currentProjectId || !hydrated) return undefined;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await service.save(currentProjectId, autosaveRef.current());
        setLastSaveTime(new Date());
        setSaveError(null);
      } catch (e) {
        console.error(e);
        setSaveError('Auto-save failed');
      } finally {
        setIsSaving(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [inputs, currentProjectId, hydrated]);

  const value = {
    inputs,
    setSection,
    isLiquid,
    styles: VALVE_STYLES,
    // derived
    cases,
    authority,
    travel,
    noise,
    erosional,
    // projects
    projects,
    currentProjectId,
    projectName,
    createProject,
    openProject,
    deleteProject,
    manualSave,
    isSaving,
    saveError,
    lastSaveTime,
    // notifications
    notifications,
    addNotification,
    removeNotification,
  };

  return <ValveContext.Provider value={value}>{children}</ValveContext.Provider>;
};
