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
    // Apply speed and trim to the curve by scaling its head function.
    // Both act on a single machine before combining.
    const base = curve;
    const scaled = {
      headAt: (q) => {
        // invert the flow scaling, then scale head back up
        const qEquivalent = q / (speedRatio * diameterRatio);
        const h = base.headAt(qEquivalent);
        const trimShortfall = diameterRatio < 0.95
          ? Math.min(0.12, ((1 - diameterRatio) * 100 - 5) * 0.006)
          : 0;
        return h * speedRatio ** 2 * diameterRatio ** 2 * (1 - trimShortfall);
      },
    };
    let combined = scaled;
    if (nSer > 1) combined = combineSeries({ pump: combined, n: nSer });
    if (nPar > 1) combined = combineParallel({ pump: combined, n: nPar });
    return { curve: combined, speedRatio, diameterRatio, nPar, nSer };
  }, [curve, inputs.changes]);

  /** The duty point: everything else is asked here. */
  const duty = useMemo(() => {
    if (configured.error) return { error: configured.error };
    if (system.error) return { error: system.error };
    const qMax = Math.max(4000, num(inputs.pump.q4, 2200) * 3);
    return dutyPoint({ pump: configured.curve, system, qMaxGpm: qMax });
  }, [configured, system, inputs.pump.q4]);

  /** Power at the duty. */
  const power = useMemo(() => {
    if (duty.error) return { error: duty.error };
    return pumpPower({
      qGpm: duty.qGpm,
      headFt: duty.headFt,
      sg: num(inputs.fluid.sg, 1),
      efficiency: num(inputs.pump.efficiency, 0.75),
      motorEfficiency: num(inputs.changes.motorEfficiency, 0.94),
    });
  }, [duty, inputs.fluid.sg, inputs.pump.efficiency, inputs.changes.motorEfficiency]);

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

  /** What a speed or trim change would do to the duty, as numbers. */
  const changeEffect = useMemo(() => {
    if (duty.error || power.error) return null;
    const sr = num(inputs.changes.speedRatio, 1);
    const dr = num(inputs.changes.diameterRatio, 1);
    return {
      speed: speedChange({
        qGpm: duty.qGpm, headFt: duty.headFt, brakeHp: power.brakeHp, speedRatio: sr,
      }),
      trim: impellerTrim({
        qGpm: duty.qGpm, headFt: duty.headFt, brakeHp: power.brakeHp, diameterRatio: dr,
      }),
    };
  }, [duty, power, inputs.changes]);

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
    power,
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
