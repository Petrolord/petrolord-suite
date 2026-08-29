// Relief & Flare Studio state (Facilities F2,
// Facilities-ROADMAP.md §3 app 5) — the upgraded Relief & Blowdown
// Sizer on the studio kit, keeping its slug and its table.
//
// Everything is a live derivation over the vendored API 520/521
// engine: a PSV case, the fire duty feeding it, the knockout drum,
// the radiation solve both ways, and the blowdown march. A saved
// study is inputs only; results are re-derived on load.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  selectOrifice, gasVaporArea, liquidArea, steamArea,
  wettedAreaFt2, fireHeatInput, fireReliefLoad,
  dropoutVelocityFtS, koDrumHorizontal,
  radiationIntensity, distanceForIntensity, RADIATION_LEVELS,
  blowdown, criticalPressureRatio,
} from '@/utils/facilities/engine/relief';

const TABLE = 'saved_relief_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save relief studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_relief_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the relief table migrations.";
  }
  if (/updated_at/.test(msg)) {
    return "Saving needs the f2_relief_updated_at migration applied.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  scenario: 'gas',
  gas: {
    wLbHr: '50000', setPsig: '285', overpressurePct: '10', backPsig: '0',
    tF: '150', mw: '19', z: '0.9', k: '1.25', kd: '0.975', kb: '1', kc: '1',
  },
  liquid: {
    qGpm: '500', setPsig: '250', backPsig: '50', overpressurePct: '10',
    sg: '0.9', muCp: '0', kd: '0.65', kw: '1', kc: '1',
  },
  steam: {
    wLbHr: '60000', setPsig: '300', overpressurePct: '10',
    kd: '0.975', kb: '1', kc: '1', ksh: '1',
  },
  fire: {
    orientation: 'horizontal', diameterFt: '10', lengthFt: '40', liquidLevelFt: '5',
    adequateDrainage: 'yes', envFactor: '1', latentBtuLb: '150',
    setPsig: '285', overpressurePct: '21', tF: '150', mw: '19', z: '0.9', k: '1.25',
  },
  drum: {
    qVaporMMscfd: '30', pPsia: '30', tF: '150', gasSg: '0.7',
    dropletMicron: '300', rhoLLbFt3: '31.2', rhoVLbFt3: '', muVCp: '0.012',
    diameterFt: '8', liquidFraction: '0.25',
  },
  radiation: {
    reliefWLbHr: '100000', lhvBtuLb: '20000', fractionRadiated: '0.3',
    transmissivity: '1', distanceM: '100', allowableKwM2: '4.73',
  },
  blowdownIn: {
    volumeFt3: '500', p0Psig: '1000', tF: '100', pEndPsig: '100',
    mw: '19', k: '1.3', z: '0.9', orificeDIn: '1', cd: '0.85',
  },
});

const SECTIONS = ['gas', 'liquid', 'steam', 'fire', 'drum', 'radiation', 'blowdownIn'];

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  const out = { ...base, scenario: raw.scenario || base.scenario };
  SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...(raw[s] || {}) };
  });
  return out;
};

const ReliefContext = createContext();

export const useRelief = () => {
  const context = useContext(ReliefContext);
  if (!context) throw new Error('useRelief must be used within a ReliefStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Relieving pressure from set + overpressure (psia). */
export const relievingPsia = (setPsig, overpressurePct) =>
  setPsig * (1 + overpressurePct / 100) + 14.7;

export const ReliefStudioProvider = ({ children }) => {
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
  const setScenario = useCallback((scenario) => {
    setInputs((prev) => ({ ...prev, scenario }));
  }, []);

  // --- PSV sizing, per scenario ---
  const psv = useMemo(() => {
    try {
      if (inputs.scenario === 'gas') {
        const g = inputs.gas;
        const p1 = relievingPsia(num(g.setPsig), num(g.overpressurePct, 10));
        const r = gasVaporArea({
          wLbHr: num(g.wLbHr), p1Psia: p1, p2Psia: num(g.backPsig, 0) + 14.7,
          tR: num(g.tF) + 459.67, mw: num(g.mw), z: num(g.z, 1), k: num(g.k, 1.4),
          kd: num(g.kd, 0.975), kb: num(g.kb, 1), kc: num(g.kc, 1),
        });
        if (r.error) return r;
        return { ...r, p1Psia: p1, orifice: selectOrifice(r.areaIn2), scenario: 'gas' };
      }
      if (inputs.scenario === 'liquid') {
        const l = inputs.liquid;
        const r = liquidArea({
          qGpm: num(l.qGpm),
          p1Psig: num(l.setPsig) * (1 + num(l.overpressurePct, 10) / 100),
          p2Psig: num(l.backPsig, 0),
          sg: num(l.sg), muCp: num(l.muCp, 0),
          kd: num(l.kd, 0.65), kw: num(l.kw, 1), kc: num(l.kc, 1),
        });
        if (r.error) return r;
        return { ...r, orifice: selectOrifice(r.areaIn2), scenario: 'liquid' };
      }
      if (inputs.scenario === 'steam') {
        const s = inputs.steam;
        const p1 = relievingPsia(num(s.setPsig), num(s.overpressurePct, 10));
        const r = steamArea({
          wLbHr: num(s.wLbHr), p1Psia: p1,
          kd: num(s.kd, 0.975), kb: num(s.kb, 1), kc: num(s.kc, 1), ksh: num(s.ksh, 1),
        });
        if (r.error) return r;
        return { ...r, p1Psia: p1, orifice: selectOrifice(r.areaIn2), scenario: 'steam' };
      }
      // fire: geometry -> duty -> load -> vapor sizing at the ACTUAL
      // relieving pressure (121 percent of set for the fire case).
      const f = inputs.fire;
      const wet = wettedAreaFt2({
        orientation: f.orientation, diameterFt: num(f.diameterFt),
        lengthFt: num(f.lengthFt), liquidLevelFt: num(f.liquidLevelFt),
      });
      if (wet.error) return wet;
      const duty = fireHeatInput({
        wettedFt2: wet.areaFt2,
        adequateDrainage: f.adequateDrainage === 'yes',
        envFactor: num(f.envFactor, 1),
      });
      if (duty.error) return duty;
      const load = fireReliefLoad({ qBtuHr: duty.qBtuHr, latentBtuLb: num(f.latentBtuLb) });
      if (load.error) return load;
      const p1 = relievingPsia(num(f.setPsig), num(f.overpressurePct, 21));
      const r = gasVaporArea({
        wLbHr: load.wLbHr, p1Psia: p1, p2Psia: 14.7,
        tR: num(f.tF) + 459.67, mw: num(f.mw), z: num(f.z, 1), k: num(f.k, 1.4),
      });
      if (r.error) return r;
      return {
        ...r,
        p1Psia: p1,
        orifice: selectOrifice(r.areaIn2),
        scenario: 'fire',
        wettedFt2: wet.areaFt2,
        qBtuHr: duty.qBtuHr,
        wLbHr: load.wLbHr,
        loadWarning: load.warning,
      };
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs]);

  // --- Knockout drum ---
  const drum = useMemo(() => {
    const d = inputs.drum;
    const pPsia = num(d.pPsia);
    const tR = num(d.tF) + 459.67;
    // vapor density: typed, or ideal-gas at drum conditions
    const rhoV = num(d.rhoVLbFt3, NaN) > 0
      ? num(d.rhoVLbFt3)
      : (28.9625 * num(d.gasSg, 0.7) * pPsia) / (10.7316 * tR);
    const settle = dropoutVelocityFtS({
      dropletMicron: num(d.dropletMicron, 300),
      rhoLLbFt3: num(d.rhoLLbFt3), rhoVLbFt3: rhoV, muVCp: num(d.muVCp, 0.012),
    });
    if (settle.error) return settle;
    const qActs = (num(d.qVaporMMscfd) * 1e6 / 86400) * (14.65 / pPsia) * (tR / 520);
    const size = koDrumHorizontal({
      qVaporAcfs: qActs, udFtS: settle.udFtS,
      diameterFt: num(d.diameterFt), liquidFraction: num(d.liquidFraction, 0.25),
    });
    if (size.error) return size;
    return { ...settle, ...size, rhoVUsed: rhoV, qVaporAcfs: qActs };
  }, [inputs.drum]);

  // --- Radiation ---
  const radiation = useMemo(() => {
    const r = inputs.radiation;
    const qKw = (num(r.reliefWLbHr) * num(r.lhvBtuLb)) * 0.29307107e-3; // Btu/hr -> kW
    if (!(qKw > 0)) return { error: 'radiation needs a positive relief rate and heating value' };
    const at = radiationIntensity({
      qKw, distanceM: num(r.distanceM),
      fractionRadiated: num(r.fractionRadiated, 0.3), transmissivity: num(r.transmissivity, 1),
    });
    const need = distanceForIntensity({
      qKw, allowableKwM2: num(r.allowableKwM2, 4.73),
      fractionRadiated: num(r.fractionRadiated, 0.3), transmissivity: num(r.transmissivity, 1),
    });
    if (at.error) return at;
    return { qKw, kWm2: at.kWm2, requiredDistanceM: need.error ? null : need.distanceM };
  }, [inputs.radiation]);

  // --- Blowdown ---
  const blowdownResult = useMemo(() => {
    const b = inputs.blowdownIn;
    return blowdown({
      volumeFt3: num(b.volumeFt3), p0Psia: num(b.p0Psig) + 14.7, t0R: num(b.tF) + 459.67,
      pEndPsia: num(b.pEndPsig) + 14.7, mw: num(b.mw), k: num(b.k, 1.4), z: num(b.z, 0.9),
      orificeDIn: num(b.orificeDIn), cd: num(b.cd, 0.85),
    });
  }, [inputs.blowdownIn]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 2,
    scenario: inputs.scenario,
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
    setScenario,
    radiationLevels: RADIATION_LEVELS,
    criticalPressureRatio,
    // derived
    psv,
    drum,
    radiation,
    blowdownResult,
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

  return <ReliefContext.Provider value={value}>{children}</ReliefContext.Provider>;
};
