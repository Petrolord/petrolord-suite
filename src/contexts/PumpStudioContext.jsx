// Pump Station Designer state (Facilities F10,
// Facilities-ROADMAP.md §3 app 10) — a NEW app on a fresh slug.
//
// Everything hangs off one solve: where the pump curve meets the
// system curve. The trim, the speed change, the parallel case and the
// NPSH check are all asked at that point rather than at a duty
// somebody typed in.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  systemCurve, fitPumpCurve, dutyPoint, pumpPower,
  npshAvailable, npshCheck, speedChange, impellerTrim,
  viscosityCorrection, combineParallel, combineSeries, operatingRegion,
} from '@/utils/facilities/engine/pumps';

const TABLE = 'saved_pump_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save pump studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_pump_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the f10_saved_pump_projects migration.";
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  fluid: {
    sg: '0.85', viscosityCSt: '5', vapourPressurePsia: '0.5',
  },
  system: {
    staticHeadFt: '150', frictionHeadFt: '200', atFlowGpm: '1500',
  },
  pump: {
    q1: '0', h1: '520', q2: '800', h2: '470', q3: '1600', h3: '330', q4: '2200', h4: '180',
    efficiency: '0.78', qBepGpm: '1500', npshrFt: '14', speedRpm: '3560',
  },
  suction: {
    suctionPressurePsia: '14.7', staticSuctionLiftFt: '8', suctionFrictionFt: '3',
  },
  changes: {
    speedRatio: '1', diameterRatio: '1', nParallel: '1', nSeries: '1',
    motorEfficiency: '0.94',
  },
});

const SECTIONS = ['fluid', 'system', 'pump', 'suction', 'changes'];

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

const PumpContext = createContext();

export const usePump = () => {
  const context = useContext(PumpContext);
  if (!context) throw new Error('usePump must be used within a PumpStudioProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A fitted curve that does not droop is not a pump curve, so where it
 * crosses the system is not a duty point. The engine warns about it and
 * then answers anyway; the studio refuses, by name, rather than printing
 * a flow and a head as headline figures (FC3 findings P2, G8).
 */
export const NON_DROOPING_CURVE = 'the fitted curve does not fall with flow, so where it crosses the system is not a duty point: check the four curve points, because a centrifugal head curve must droop';
const droops = (curve) => !curve.error && curve.coefficients?.c2 < 0;

/** The band over which the affinity laws are worth quoting (FC3 finding P4). */
export const SPEED_RATIO_MIN = 0.5;
export const SPEED_RATIO_MAX = 1.5;

/**
 * The factors that a speed change and a trim apply to a whole curve,
 * read OUT of the engine at unit duty rather than restated here.
 *
 * `speedChange` and `impellerTrim` are both homogeneous of degree one in
 * the duty they are given, so asking them what they do to a duty of
 * 1 gpm at 1 ft at 1 bhp returns exactly the factors, and scaling the
 * curve by them is the same law the engine applies to a point. That is
 * what keeps the curve and the point from disagreeing (FC3 findings S1
 * and S2), and it means an engine repair moves both together.
 */
export const changeFactors = ({ speedRatio, diameterRatio }) => {
  const trim = impellerTrim({
    qGpm: 1, headFt: 1, brakeHp: 1, diameterRatio,
  });
  if (trim.error) return { error: trim.error };
  const speed = speedChange({
    qGpm: 1, headFt: 1, brakeHp: 1, speedRatio,
  });
  if (speed.error) return { error: speed.error };
  return {
    qScale: trim.qGpm * speed.qGpm,
    hScale: trim.headFt * speed.headFt,
    hpScale: trim.brakeHp * speed.brakeHp,
    trimPercent: trim.trimPercent,
    shortfallPct: trim.shortfallPct,
    trimWarning: trim.warning,
    speedWarning: (speedRatio < SPEED_RATIO_MIN || speedRatio > SPEED_RATIO_MAX)
      ? `a speed ratio of ${speedRatio} is well outside the range the affinity laws hold over for a real machine (about ${SPEED_RATIO_MIN} to ${SPEED_RATIO_MAX} of rated speed): read the result as an extrapolation, and note that the error lands hardest on the power, which goes as the cube`
      : null,
  };
};

const withMultiples = (pump, nPar, nSer) => {
  let combined = pump;
  if (nSer > 1) combined = combineSeries({ pump: combined, n: nSer });
  if (nPar > 1) combined = combineParallel({ pump: combined, n: nPar });
  return combined;
};

export const PumpStudioProvider = ({ children }) => {
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

  /** The catalogue curve. */
  const curve = useMemo(() => {
    const p = inputs.pump;
    const points = [
      { qGpm: num(p.q1, 0), headFt: num(p.h1) },
      { qGpm: num(p.q2), headFt: num(p.h2) },
      { qGpm: num(p.q3), headFt: num(p.h3) },
      { qGpm: num(p.q4), headFt: num(p.h4) },
    ].filter((pt) => Number.isFinite(pt.qGpm) && Number.isFinite(pt.headFt));
    return fitPumpCurve({ points });
  }, [inputs.pump]);

  /** The system. */
  const system = useMemo(() => systemCurve({
    staticHeadFt: num(inputs.system.staticHeadFt, 0),
    frictionHeadFt: num(inputs.system.frictionHeadFt),
    atFlowGpm: num(inputs.system.atFlowGpm),
  }), [inputs.system]);

  /** The machine as configured: trim, speed and multiples applied. */
  const configured = useMemo(() => {
    if (curve.error) return { error: curve.error };
    const c = inputs.changes;
    const speedRatio = num(c.speedRatio, 1);
    const diameterRatio = num(c.diameterRatio, 1);
    const nPar = Math.max(1, Math.round(num(c.nParallel, 1)));
    const nSer = Math.max(1, Math.round(num(c.nSeries, 1)));
    // The speed and the trim scale the whole curve, by the same factors
    // the engine applies to a point (see changeFactors). A trim ratio
    // above 1 or a speed ratio at or below 0 is the engine's refusal,
    // by name, rather than a curve nobody can build.
    const factors = changeFactors({ speedRatio, diameterRatio });
    if (factors.error) return { error: factors.error };
    const scaled = { headAt: (q) => curve.headAt(q / factors.qScale) * factors.hScale };
    return {
      curve: withMultiples(scaled, nPar, nSer),
      // the same machine count with no speed or trim change, which is
      // what "before" means on the changes card
      baseCurve: withMultiples(curve, nPar, nSer),
      factors,
      speedRatio,
      diameterRatio,
      nPar,
      nSer,
      changed: speedRatio !== 1 || diameterRatio !== 1,
    };
  }, [curve, inputs.changes]);

  const qMaxSearchGpm = useMemo(
    () => Math.max(4000, num(inputs.pump.q4, 2200) * 3),
    [inputs.pump.q4],
  );

  /** The duty point: everything else is asked here. */
  const duty = useMemo(() => {
    if (configured.error) return { error: configured.error };
    if (system.error) return { error: system.error };
    if (!droops(curve)) return { error: NON_DROOPING_CURVE };
    return dutyPoint({ pump: configured.curve, system, qMaxGpm: qMaxSearchGpm });
  }, [configured, system, curve, qMaxSearchGpm]);

  /** The duty before any speed or trim change, on the same system. */
  const baseDuty = useMemo(() => {
    if (configured.error) return { error: configured.error };
    if (system.error) return { error: system.error };
    if (!droops(curve)) return { error: NON_DROOPING_CURVE };
    return dutyPoint({ pump: configured.baseCurve, system, qMaxGpm: qMaxSearchGpm });
  }, [configured, system, curve, qMaxSearchGpm]);

  /**
   * Power at a duty. The motor efficiency is the one input the engine
   * does not bound, and an unbounded one gives a motor drawing less than
   * its own shaft power. The shaft side does not depend on it, so the
   * shaft side is still computed and only the motor figures are refused,
   * by name (FC3 finding P3).
   */
  const powerAt = useCallback((point) => {
    if (!point || point.error) return { error: point?.error };
    const motorEfficiency = num(inputs.changes.motorEfficiency, 0.94);
    const motorOk = motorEfficiency > 0 && motorEfficiency <= 1;
    const p = pumpPower({
      qGpm: point.qGpm,
      headFt: point.headFt,
      sg: num(inputs.fluid.sg, 1),
      efficiency: num(inputs.pump.efficiency, 0.75),
      motorEfficiency: motorOk ? motorEfficiency : 0.94,
    });
    if (p.error || motorOk) return p;
    return {
      hydraulicHp: p.hydraulicHp,
      brakeHp: p.brakeHp,
      motorInputHp: null,
      motorInputKw: null,
      motorError: 'the motor efficiency must be above 0 and at most 1: a motor cannot deliver more shaft power than it draws, so the motor input is not computed',
    };
  }, [inputs.changes.motorEfficiency, inputs.fluid.sg, inputs.pump.efficiency]);

  /** Power at the duty. */
  const power = useMemo(() => powerAt(duty), [powerAt, duty]);

  /** Power at the duty before the change. */
  const basePower = useMemo(() => powerAt(baseDuty), [powerAt, baseDuty]);

  /** NPSH at the duty. */
  const npsh = useMemo(() => {
    const a = npshAvailable({
      suctionPressurePsia: num(inputs.suction.suctionPressurePsia),
      vapourPressurePsia: num(inputs.suction.vapourPressurePsia ?? inputs.fluid.vapourPressurePsia, 0),
      sg: num(inputs.fluid.sg, 1),
      staticSuctionLiftFt: num(inputs.suction.staticSuctionLiftFt, 0),
      suctionFrictionFt: num(inputs.suction.suctionFrictionFt, 0),
    });
    if (a.error) return a;
    const check = npshCheck({ npshaFt: a.npshaFt, npshrFt: num(inputs.pump.npshrFt) });
    return { ...a, check };
  }, [inputs.suction, inputs.fluid, inputs.pump.npshrFt]);

  /** Where the duty sits relative to best efficiency. */
  const region = useMemo(() => {
    if (duty.error) return { error: duty.error };
    const nPar = configured.error ? 1 : configured.nPar;
    // per-machine flow is what the pump itself sees
    return operatingRegion({
      qGpm: duty.qGpm / nPar,
      qBepGpm: num(inputs.pump.qBepGpm),
    });
  }, [duty, configured, inputs.pump.qBepGpm]);

  /** Viscosity correction on the catalogue BEP. */
  const viscosity = useMemo(() => viscosityCorrection({
    qBepGpm: num(inputs.pump.qBepGpm),
    headBepFt: curve.error ? NaN : curve.headAt(num(inputs.pump.qBepGpm)),
    viscosityCSt: num(inputs.fluid.viscosityCSt, 1),
    speedRpm: num(inputs.pump.speedRpm, 3560),
  }), [curve, inputs.pump.qBepGpm, inputs.pump.speedRpm, inputs.fluid.viscosityCSt]);

  /** Curve data for the chart: pump, system, and the duty marker. */
  const chart = useMemo(() => {
    if (curve.error || system.error) return { error: curve.error || system.error };
    const qMax = Math.max(num(inputs.pump.q4, 2200) * 1.2,
      duty.error ? 0 : duty.qGpm * 1.3);
    const n = 60;
    const rows = [];
    for (let i = 0; i <= n; i += 1) {
      const q = (qMax * i) / n;
      const pumpH = configured.error ? null : configured.curve.headAt(q);
      rows.push({
        q,
        pump: Number.isFinite(pumpH) && pumpH > 0 ? pumpH : null,
        system: system.headAt(q),
      });
    }
    return { rows, qMax };
  }, [curve, system, configured, duty, inputs.pump.q4]);

  /**
   * What the speed or trim change actually bought.
   *
   * Two different questions live here and the studio used to answer both
   * as if they were one (FC3 finding S1):
   *
   *  - `after` is the new OPERATING point, solved as a fresh crossing of
   *    the changed pump curve with the system. The machine changed and
   *    the piping did not, so the operating point has to be found again.
   *  - `onCurve` is where the old duty point LANDS on the changed curve
   *    under the affinity and trim laws. It sits on the pump curve and
   *    not on the system curve, so no pump ever runs there. It is what
   *    the laws say and it is worth seeing, labelled as what it is.
   *
   * Both are taken from the duty BEFORE the change, so the change is
   * applied exactly once.
   */
  const changeEffect = useMemo(() => {
    if (configured.error) return { error: configured.error };
    if (baseDuty.error) return { error: baseDuty.error };
    if (duty.error) return { error: duty.error };
    if (power.error) return { error: power.error };
    if (basePower.error) return { error: basePower.error };
    const before = {
      qGpm: baseDuty.qGpm, headFt: baseDuty.headFt, brakeHp: basePower.brakeHp,
    };
    // the engine's own laws, composed on the unchanged duty: the speed
    // law is exact, the trim law carries the published shortfall
    const sped = speedChange({ ...before, speedRatio: configured.speedRatio });
    if (sped.error) return { error: sped.error };
    const trimmed = impellerTrim({ ...sped, diameterRatio: configured.diameterRatio });
    if (trimmed.error) return { error: trimmed.error };
    return {
      changed: configured.changed,
      speedRatio: configured.speedRatio,
      diameterRatio: configured.diameterRatio,
      before,
      after: { qGpm: duty.qGpm, headFt: duty.headFt, brakeHp: power.brakeHp },
      onCurve: { qGpm: trimmed.qGpm, headFt: trimmed.headFt, brakeHp: trimmed.brakeHp },
      idealQGpm: trimmed.idealQGpm,
      idealHeadFt: trimmed.idealHeadFt,
      trimPercent: trimmed.trimPercent,
      shortfallPct: trimmed.shortfallPct,
      trimWarning: trimmed.warning,
      speedWarning: configured.factors.speedWarning,
    };
  }, [configured, baseDuty, duty, power, basePower]);

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
    curve,
    system,
    configured,
    duty,
    baseDuty,
    power,
    basePower,
    npsh,
    region,
    viscosity,
    chart,
    changeEffect,
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

  return <PumpContext.Provider value={value}>{children}</PumpContext.Provider>;
};
