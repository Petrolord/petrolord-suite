// Separator & Slug Catcher Studio state (Facilities F5,
// Facilities-ROADMAP.md §3 app 5) — the rebuilt Separator & Slug
// Catcher Designer on the studio kit, keeping its slug.
//
// The whole chain is live over the vendored API 12J / GPSA engine:
// conditions -> z and densities -> K -> settling -> vessel, with the
// L/D family swept so the size is chosen from a table.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  K_BASE, kValue, gasDensityLbFt3, oilDensityLbFt3,
  terminalVelocityFtS, gasActualFt3S,
  verticalTwoPhase, horizontalTwoPhase, horizontalThreePhase, ldSweep,
  vesselSlugCatcher, fingerSlugCatcher,
} from '@/utils/facilities/engine/separatorSizing';

const TABLE = 'saved_separator_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save separator studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_separator_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f5_saved_separator_projects migration.";
  }
  return msg || 'Unexpected error.';
};

/**
 * Customary L/D (slenderness) band per vessel type. Mirrors the engine's
 * documentation of ldSweep (packages/engines/engines/facilities/
 * separatorSizing.js: "Customary slenderness is 3 to 5 for horizontal
 * separators and 2 to 4 for vertical ones"). The engine exports no
 * constant for it; adopt one here if it ever does.
 */
export const LD_BAND = Object.freeze({
  horizontal2: Object.freeze({ min: 3, max: 5 }),
  horizontal3: Object.freeze({ min: 3, max: 5 }),
  vertical2: Object.freeze({ min: 2, max: 4 }),
});

export const ldBandFor = (type) => LD_BAND[type] || LD_BAND.horizontal2;

/**
 * The example case a new study opens with. These are initial prefilled
 * values only (labelled as an example in the UI): a field the user
 * clears stays blank and the run names it as missing.
 */
export const defaultInputs = () => ({
  vessel: {
    type: 'horizontal2', // horizontal2 | vertical2 | horizontal3
    internalsId: 'horizontalMesh', kOverride: '',
    liquidLevelFrac: '0.5', allowanceFt: '6',
    diametersFt: '4,6,8,10,12',
    ldMin: String(LD_BAND.horizontal2.min), ldMax: String(LD_BAND.horizontal2.max),
  },
  process: {
    qGasMMscfd: '20', pPsig: '985', tF: '100', gasSg: '0.65',
    qOilBpd: '6000', qWaterBpd: '4000',
    oilApi: '35', waterSg: '1.05',
    oilRetentionMin: '3', waterRetentionMin: '5',
    muOilCp: '2', muWaterCp: '0.7', dropletMicron: '500',
  },
  slug: {
    mode: 'vessel',
    slugBbl: '200', qLiquidBpd: '10000', holdMin: '5',
    fillFraction: '0.6', ldRatio: '4',
    fingerIdIn: '24', nFingers: '6', fingerFill: '0.8',
  },
});

const SECTIONS = ['vessel', 'process', 'slug'];

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

const SeparatorContext = createContext();

export const useSeparator = () => {
  const context = useContext(SeparatorContext);
  if (!context) throw new Error('useSeparator must be used within a SeparatorStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseDiameters = (text) => String(text)
  .split(/[,\s]+/)
  .map((t) => parseFloat(t))
  .filter((n) => Number.isFinite(n) && n > 0);

const isBlank = (v) => !Number.isFinite(parseFloat(v));

/**
 * Required inputs, by the label the user sees, that are blank (or not a
 * number) for the vessel tab. The optional K override is not listed:
 * blank there means "use the derated correlation", as its hint says.
 */
export const missingVesselInputs = (inputs) => {
  const v = inputs?.vessel || {};
  const p = inputs?.process || {};
  const threePhase = v.type === 'horizontal3';
  const vertical = v.type === 'vertical2';
  const checks = [
    ['Candidate diameters (ft)', parseDiameters(v.diametersFt ?? '').length === 0],
    ['L/D minimum', isBlank(v.ldMin)],
    ['L/D maximum', isBlank(v.ldMax)],
    ['Gas (MMscfd)', isBlank(p.qGasMMscfd)],
    ['Pressure (psig)', isBlank(p.pPsig)],
    ['Temperature (F)', isBlank(p.tF)],
    ['Gas gravity', isBlank(p.gasSg)],
    ['Oil (bpd)', isBlank(p.qOilBpd)],
    ['Water (bpd)', isBlank(p.qWaterBpd)],
    ['Oil gravity (API)', isBlank(p.oilApi)],
    ['Water SG', (threePhase || num(p.qWaterBpd, 0) > 0) && isBlank(p.waterSg)],
    [threePhase ? 'Oil retention (min)' : 'Liquid retention (min)', isBlank(p.oilRetentionMin)],
    ['Liquid level (fraction of diameter)', !vertical && isBlank(v.liquidLevelFrac)],
    ['Height allowance (ft)', vertical && isBlank(v.allowanceFt)],
    ['Water retention (min)', threePhase && isBlank(p.waterRetentionMin)],
    ['Oil visc (cp)', threePhase && isBlank(p.muOilCp)],
    ['Water visc', threePhase && isBlank(p.muWaterCp)],
    ['Droplet (um)', threePhase && isBlank(p.dropletMicron)],
  ];
  return checks.filter(([, missing]) => missing).map(([label]) => label);
};

/** Required inputs that are blank for the slug catcher tab. */
export const missingSlugInputs = (inputs) => {
  const s = inputs?.slug || {};
  const finger = s.mode === 'finger';
  const checks = finger
    ? [
      ['Slug volume (bbl)', isBlank(s.slugBbl)],
      ['Finger bore (in)', isBlank(s.fingerIdIn)],
      ['Number of fingers', isBlank(s.nFingers)],
      ['Fill fraction', isBlank(s.fingerFill)],
    ]
    : [
      ['Slug volume (bbl)', isBlank(s.slugBbl)],
      ['Normal liquid (bpd)', isBlank(s.qLiquidBpd)],
      ['Normal hold (min)', isBlank(s.holdMin)],
      ['Fill fraction', isBlank(s.fillFraction)],
      ['L/D ratio', isBlank(s.ldRatio)],
    ];
  return checks.filter(([, missing]) => missing).map(([label]) => label);
};

export const missingMessage = (labels) => `Missing required inputs: ${labels.join(', ')}.`;

/**
 * The selected vessel is the first candidate inside the L/D band. When
 * none is, nothing is selected: an out-of-band row is never promoted.
 */
export const selectVessel = (sweep) => {
  if (!sweep || sweep.error) return { error: sweep?.error || 'no sweep' };
  if (sweep.preferred) return sweep.preferred;
  return {
    error: `No candidate in the L/D band (${sweep.ldMin} to ${sweep.ldMax}), so no vessel is selected. Add candidate diameters or revise the band.`,
    noCandidate: true,
  };
};

/**
 * Changing the vessel type moves an untouched L/D band to the new type's
 * customary band. A band the user has edited is left as they set it.
 */
export const applyVesselTypeChange = (vessel, nextType) => {
  const prevBand = ldBandFor(vessel.type);
  const nextBand = ldBandFor(nextType);
  const untouched = num(vessel.ldMin) === prevBand.min && num(vessel.ldMax) === prevBand.max;
  return {
    ...vessel,
    type: nextType,
    ...(untouched ? { ldMin: String(nextBand.min), ldMax: String(nextBand.max) } : {}),
  };
};


export const SeparatorStudioProvider = ({ children }) => {
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
    setInputs((prev) => {
      if (section === 'vessel' && key === 'type') {
        return { ...prev, vessel: applyVesselTypeChange(prev.vessel, value) };
      }
      return { ...prev, [section]: { ...prev[section], [key]: value } };
    });
  }, []);

  const vesselMissing = useMemo(() => missingVesselInputs(inputs), [inputs]);
  const slugMissing = useMemo(() => missingSlugInputs(inputs), [inputs]);

  /** Conditions: z, densities, K, settling velocity, actual gas rate. */
  const conditions = useMemo(() => {
    // Missing stays missing (FC1-0): name the blanks, substitute nothing.
    if (vesselMissing.length) return { error: missingMessage(vesselMissing), missing: vesselMissing };
    const p = inputs.process;
    const v = inputs.vessel;
    const pPsia = num(p.pPsig) + 14.7;
    const gas = gasDensityLbFt3({ pPsia, tF: num(p.tF), gasSg: num(p.gasSg) });
    if (gas.error) return gas;
    const rhoOil = oilDensityLbFt3(num(p.oilApi));
    const qWater = num(p.qWaterBpd);
    // Water SG is only required when there is water to weigh.
    const rhoWater = qWater > 0 || v.type === 'horizontal3' ? num(p.waterSg) * 62.4 : NaN;
    const qOil = num(p.qOilBpd);
    const qLiquid = qOil + qWater;
    // The gas load sees the mixed liquid it is separating from.
    const rhoLiquid = qLiquid > 0
      ? (rhoOil * qOil + (qWater > 0 ? rhoWater * qWater : 0)) / qLiquid
      : rhoOil;
    const k = kValue({
      internalsId: v.internalsId, pPsig: num(p.pPsig),
      kOverride: num(v.kOverride, 0),
    });
    if (k.error) return k;
    const vt = terminalVelocityFtS({
      k: k.k, rhoLLbFt3: rhoLiquid, rhoGLbFt3: gas.rhoLbFt3,
    });
    if (vt.error) return vt;
    const qGasAct = gasActualFt3S({
      qGasMMscfd: num(p.qGasMMscfd), pPsia, tF: num(p.tF), z: gas.z,
    });
    return {
      pPsia, z: gas.z, rhoGas: gas.rhoLbFt3, rhoOil, rhoWater, rhoLiquid,
      qOil, qWater, qLiquid, kResult: k, k: k.k,
      vTerminalFtS: vt.vFtS, qGasActFt3S: qGasAct,
    };
  }, [inputs.process, inputs.vessel, vesselMissing]);

  /** The L/D family across the candidate diameters. */
  const sweep = useMemo(() => {
    if (conditions.error) return { error: conditions.error };
    const v = inputs.vessel;
    const p = inputs.process;
    const diametersFt = parseDiameters(v.diametersFt);
    if (!diametersFt.length) return { error: 'list at least one candidate diameter' };
    const common = {
      diametersFt,
      ldMin: num(v.ldMin),
      ldMax: num(v.ldMax),
      qGasActFt3S: conditions.qGasActFt3S,
      vTerminalFtS: conditions.vTerminalFtS,
      liquidLevelFrac: num(v.liquidLevelFrac),
    };
    if (v.type === 'vertical2') {
      return ldSweep({
        ...common, mode: 'vertical2',
        qLiquidBpd: conditions.qLiquid,
        retentionMin: num(p.oilRetentionMin),
        allowanceFt: num(v.allowanceFt),
      });
    }
    if (v.type === 'horizontal3') {
      return ldSweep({
        ...common, mode: 'horizontal3',
        qOilBpd: conditions.qOil, qWaterBpd: conditions.qWater,
        oilRetentionMin: num(p.oilRetentionMin),
        waterRetentionMin: num(p.waterRetentionMin),
        sgOil: conditions.rhoOil / 62.4,
        sgWater: num(p.waterSg),
        muOilCp: num(p.muOilCp),
        muWaterCp: num(p.muWaterCp),
        dropletMicron: num(p.dropletMicron),
      });
    }
    return ldSweep({
      ...common, mode: 'horizontal2',
      qLiquidBpd: conditions.qLiquid,
      retentionMin: num(p.oilRetentionMin),
    });
  }, [conditions, inputs.vessel, inputs.process]);

  /** The chosen vessel: the first candidate in the L/D band, or none. */
  const selected = useMemo(() => selectVessel(sweep), [sweep]);

  /** Detailed result of the selected vessel (for the three-phase view). */
  const detail = useMemo(() => {
    if (selected.error) return { error: selected.error };
    return selected.result;
  }, [selected]);

  /** Slug catcher. */
  const slug = useMemo(() => {
    if (slugMissing.length) return { error: missingMessage(slugMissing), missing: slugMissing };
    const s = inputs.slug;
    if (s.mode === 'finger') {
      return fingerSlugCatcher({
        slugBbl: num(s.slugBbl),
        fingerIdIn: num(s.fingerIdIn),
        nFingers: num(s.nFingers),
        fillFraction: num(s.fingerFill),
      });
    }
    return vesselSlugCatcher({
      slugBbl: num(s.slugBbl),
      qLiquidBpd: num(s.qLiquidBpd),
      holdMin: num(s.holdMin),
      fillFraction: num(s.fillFraction),
      ldRatio: num(s.ldRatio),
    });
  }, [inputs.slug, slugMissing]);

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
    internalsOptions: K_BASE,
    ldBand: ldBandFor(inputs.vessel.type),
    // derived
    conditions,
    sweep,
    selected,
    detail,
    slug,
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

  return <SeparatorContext.Provider value={value}>{children}</SeparatorContext.Provider>;
};
