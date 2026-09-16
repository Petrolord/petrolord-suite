// Corrosion & Integrity Studio state (Facilities F6,
// Facilities-ROADMAP.md §3 app 6) — the upgraded Corrosion Rate
// Predictor on the studio kit, keeping its slug.
//
// The studio speaks field units; the vendored engine is published in
// the correlations' own units (C, bar, m/s, m), so this layer is where
// the conversion lives and nowhere else.
//
// FC9-0: BLANK NOW MEANS BLANK. This layer used to fill a cleared pH box
// with 4.5, which is not a neutral number: it applies a pH factor of
// 0.562, so a cleared box returned 0.755 mm/yr where a typed pH of 4.0
// returns 1.342, a 43.8 percent cut in the answer for leaving a box
// empty. A cleared CO2 box became a positive assertion of zero CO2 and
// a cleared water cut box became 100 percent. Every one of those is
// gone: a blank box reaches the engine as NaN and the engine refuses.
// The two that stay are the inhibitor boxes, where a blank genuinely
// means no inhibitor and a zero is the conservative answer.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { screen } from '@/utils/facilities/engine/corrosion';

const TABLE = 'saved_corrosion_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save corrosion studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_corrosion_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f6_saved_corrosion_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  conditions: {
    tF: '140', pPsig: '725', co2MolPct: '3', h2sMolPct: '0.1', ph: '4.5',
  },
  flow: {
    velocityFtS: '10', idIn: '6', densityLbFt3: '56', viscosityCp: '1',
    flowRegime: 'waterWet', waterCutPct: '100',
  },
  mitigation: {
    inhibitorEfficiencyPct: '90', inhibitorAvailabilityPct: '95',
  },
  integrity: {
    corrosionAllowanceIn: '0.125', consumedIn: '0', designLifeYears: '20',
  },
  sweep: {
    velocitiesFtS: '2,5,10,15,20',
  },
});

const SECTIONS = ['conditions', 'flow', 'mitigation', 'integrity', 'sweep'];

/** The only wetting regimes the engine will accept. */
export const FLOW_REGIMES = ['waterWet', 'intermittent', 'oilWet'];

/**
 * Coerce one restored field. A saved study or an imported .pld can carry
 * anything, and this used to spread it straight into the input state:
 * `parseFloat` takes '5abc' as 5 and '1e999' as Infinity, and the
 * wetting regime went through as whatever string it was.
 */
export const coerceField = (section, key, value, fallback) => {
  if (key === 'flowRegime') {
    if (typeof value !== 'string') return fallback;
    const hit = FLOW_REGIMES.find((r) => r.toLowerCase() === value.replace(/[^a-z]/gi, '').toLowerCase());
    return hit || fallback;
  }
  if (key === 'velocitiesFtS') {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    const kept = String(value).split(/[,\s]+/)
      .filter((t) => /^\d*\.?\d+(e[+-]?\d+)?$/i.test(t))
      .filter((t) => Number.isFinite(parseFloat(t)) && parseFloat(t) > 0);
    return kept.length ? kept.join(',') : fallback;
  }
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  // a whole number and nothing else: '5abc' and '1e999' are not numbers
  if (!/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(trimmed)) return fallback;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? trimmed : fallback;
};

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base };
  SECTIONS.forEach((s) => {
    const restored = (raw[s] && typeof raw[s] === 'object' && !Array.isArray(raw[s])) ? raw[s] : {};
    out[s] = { ...base[s] };
    Object.keys(base[s]).forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(restored, k)) {
        out[s][k] = coerceField(s, k, restored[k], base[s][k]);
      }
    });
  });
  return out;
};

const CorrosionContext = createContext();

export const useCorrosion = () => {
  const context = useContext(CorrosionContext);
  if (!context) throw new Error('useCorrosion must be used within a CorrosionStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Field to correlation units, in one place. */
export const toEngineUnits = (inputs) => {
  const c = inputs.conditions;
  const f = inputs.flow;
  const m = inputs.mitigation;
  return {
    tC: (num(c.tF) - 32) / 1.8,
    pTotalBar: (num(c.pPsig) + 14.7) / 14.5038,
    co2MolFrac: num(c.co2MolPct) / 100,
    h2sMolFrac: num(c.h2sMolPct) / 100,
    ph: num(c.ph),
    velocityMS: num(f.velocityFtS) * 0.3048,
    diameterM: num(f.idIn) * 0.0254,
    densityKgM3: num(f.densityLbFt3) * 16.0185,
    viscosityPaS: num(f.viscosityCp) * 1e-3,
    flowRegime: f.flowRegime,
    waterCutFrac: num(f.waterCutPct) / 100,
    // A blank inhibitor box means no inhibitor, which is the
    // conservative reading and the only fallback kept here.
    inhibitorEfficiencyPct: num(m.inhibitorEfficiencyPct, 0),
    inhibitorAvailabilityPct: num(m.inhibitorAvailabilityPct, 100),
  };
};

const MM_PER_IN = 25.4;

/** mm/yr to mils per year. */
export const mpy = (mmYr) => (Number.isFinite(mmYr) ? (mmYr / MM_PER_IN) * 1000 : null);

export const CorrosionStudioProvider = ({ children }) => {
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

  /** The full screen at the stated conditions. */
  const result = useMemo(() => {
    const eng = toEngineUnits(inputs);
    const i = inputs.integrity;
    const out = screen({
      ...eng,
      corrosionAllowanceMm: num(i.corrosionAllowanceIn, 0) * MM_PER_IN,
      consumedMm: num(i.consumedIn, 0) * MM_PER_IN,
      designLifeYears: num(i.designLifeYears, 0),
    });
    if (out.error) return out;
    return {
      ...out,
      // mpy beside mm/yr everywhere, because every input on this screen
      // is a field unit and the allowance is in inches
      rateMpy: mpy(out.rate.rateMmYr),
      uninhibitedMpy: mpy(out.rate.uninhibitedMmYr),
      rateWithFilmCreditMpy: mpy(out.rateWithFilmCreditMmYr),
    };
  }, [inputs]);

  /**
   * Rate against velocity, through the SAME screen the studio runs, so
   * the curve obeys the film-stripping rule the other tab states. It
   * used to call `corrosionRate` alone and never recompute the wall
   * shear, so a sweep could run straight through the shear at which
   * the other tab says the inhibitor film is gone and draw a smooth
   * line over it.
   */
  const velocitySweep = useMemo(() => {
    const eng = toEngineUnits(inputs);
    const i = inputs.integrity;
    const vels = String(inputs.sweep.velocitiesFtS)
      .split(/[,\s]+/)
      .map((t) => parseFloat(t))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!vels.length) return { error: 'list at least one velocity' };
    const rows = vels.map((vFtS) => {
      const s = screen({
        ...eng,
        velocityMS: vFtS * 0.3048,
        corrosionAllowanceMm: num(i.corrosionAllowanceIn, 0) * MM_PER_IN,
        consumedMm: num(i.consumedIn, 0) * MM_PER_IN,
        designLifeYears: num(i.designLifeYears, 0),
      });
      if (s.error) return { velocityFtS: vFtS, error: s.error };
      return {
        velocityFtS: vFtS,
        rateMmYr: s.rate.rateMmYr,
        uninhibitedMmYr: s.rate.uninhibitedMmYr,
        rateMpy: mpy(s.rate.rateMmYr),
        controlling: s.rate.controlling,
        category: s.category,
        tauPa: s.shear.tauPa,
        filmRisk: s.shear.filmRisk,
        filmStripped: s.filmStripped,
        withheld: Boolean(s.withheld),
        error: null,
      };
    });
    const drawn = rows.filter((r) => !r.error);
    const firstStripped = drawn.find((r) => r.filmStripped) || null;
    return {
      rows,
      // where the inhibitor film stops surviving, so the chart can mark
      // it instead of drawing straight through it
      strippingVelocityFtS: firstStripped ? firstStripped.velocityFtS : null,
      allZero: drawn.length > 0 && drawn.every((r) => r.rateMmYr === 0),
      flowRegime: eng.flowRegime,
    };
  }, [inputs]);

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
    // derived
    result,
    velocitySweep,
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

  return <CorrosionContext.Provider value={value}>{children}</CorrosionContext.Provider>;
};
