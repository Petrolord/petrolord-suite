// Relief & Flare Studio state (Facilities F2,
// Facilities-ROADMAP.md §3 app 5). The upgraded Relief & Blowdown
// Sizer on the studio kit, keeping its slug and its table.
//
// Everything is a live derivation over the vendored API 520/521
// engine: a PSV case, the fire duty feeding it, the knockout drum,
// the radiation solve both ways, and the blowdown march. A saved
// study is inputs only; results are re-derived on load.
//
// FC5-0: this layer used to LAUNDER inputs the engine deliberately
// refuses. `num` was `parseFloat`, which reads '50,000' as 50 and
// '0.5.5' as 0.5, so a thousands separator typed into the relief load
// box sized 0.002454 in2 instead of 2.453842 and printed orifice D
// where the answer is L. A saved study carries whatever string it was
// saved with, so this is reachable without a keyboard. `num` now
// parses the WHOLE value or hands the engine a NaN, which the engine
// refuses by name, and the fallback applies to an EMPTY box only.
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

/** One standard base for this studio, the package's own: 14.696 psia and
 *  519.67 R, with R = 10.7316 psia.ft3/(lbmol.R) and air at 28.9625. */
const R_PSIA_FT3 = 10.7316;
const AIR_MW = 28.9625;
const P_STD_PSIA = 14.696;
const T_STD_R = 519.67;
export const SCF_PER_LBMOL = (R_PSIA_FT3 * T_STD_R) / P_STD_PSIA;

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
    backPsig: '0', kd: '0.975', kb: '1', kc: '1',
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

export const num = (v, fallback = NaN) => {
  if (v === '' || v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  // Number() parses the WHOLE string or returns NaN: '50,000', '50 000',
  // '50000 lb/hr', '0.5.5' and '1/2' all refuse instead of being
  // silently truncated to their leading digits.
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
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
      // FC5-0: the fire tab used to hardcode a 14.7 psia back pressure and
      // drop the Kd, Kb and Kc the gas tab honours, so the fire case always
      // ran the engine defaults. A typed Kd of 0.9 moves the app's own fire
      // case from 1.235639 to 1.338609 in2, orifice J to orifice K.
      const r = gasVaporArea({
        wLbHr: load.wLbHr, p1Psia: p1, p2Psia: num(f.backPsig, 0) + 14.7,
        tR: num(f.tF) + 459.67, mw: num(f.mw), z: num(f.z, 1), k: num(f.k, 1.4),
        kd: num(f.kd, 0.975), kb: num(f.kb, 1), kc: num(f.kc, 1),
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
    try {
      const d = inputs.drum;
      const pPsia = num(d.pPsia);
      const tR = num(d.tF) + 459.67;
      const mw = AIR_MW * num(d.gasSg, 0.7);
      // vapor density: typed, or ideal-gas at drum conditions
      const rhoV = num(d.rhoVLbFt3, NaN) > 0
        ? num(d.rhoVLbFt3)
        : (mw * pPsia) / (R_PSIA_FT3 * tR);
      const settle = dropoutVelocityFtS({
        dropletMicron: num(d.dropletMicron, 300),
        rhoLLbFt3: num(d.rhoLLbFt3), rhoVLbFt3: rhoV, muVCp: num(d.muVCp, 0.012),
      });
      if (settle.error) return settle;
      // FC5-0: the standard-to-actual conversion used to be
      // (MMscfd 1e6 / 86400) (14.65 / P) (T / 520), a 14.65 psia and 520 R
      // base, while the vapour density three lines above used the package's
      // own 14.696 and 519.67. Two halves of one derivation disagreed about
      // standard conditions, by 0.3763 percent carried straight into the
      // answer, and no compressibility was applied either. It now goes
      // through the MASS rate and divides by the density actually used, so
      // there is ONE base, and a typed real density carries its own z.
      const massLbHr = ((num(d.qVaporMMscfd) * 1e6) / SCF_PER_LBMOL) * mw / 24;
      const qActs = massLbHr / (3600 * rhoV);
      const size = koDrumHorizontal({
        qVaporAcfs: qActs, udFtS: settle.udFtS,
        diameterFt: num(d.diameterFt), liquidFraction: num(d.liquidFraction, 0.25),
      });
      if (size.error) return size;
      return {
        ...settle, ...size, rhoVUsed: rhoV, qVaporAcfs: qActs, massLbHr, mwUsed: mw,
      };
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs.drum]);

  // --- Radiation ---
  const radiation = useMemo(() => {
    try {
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
      // the setback solves the SAME four inputs, so if it refuses, say so
      // rather than printing a blank beside an intensity that computed
      return {
        qKw,
        kWm2: at.kWm2,
        requiredDistanceM: need.error ? null : need.distanceM,
        setbackError: need.error || null,
      };
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [inputs.radiation]);

  // --- Blowdown ---
  const blowdownResult = useMemo(() => {
    try {
      const b = inputs.blowdownIn;
      return blowdown({
        volumeFt3: num(b.volumeFt3), p0Psia: num(b.p0Psig) + 14.7, t0R: num(b.tF) + 459.67,
        pEndPsia: num(b.pEndPsig) + 14.7, mw: num(b.mw), k: num(b.k, 1.4), z: num(b.z, 0.9),
        orificeDIn: num(b.orificeDIn), cd: num(b.cd, 0.85),
      });
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
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
