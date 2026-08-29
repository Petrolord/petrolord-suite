// Heat Exchanger & Cooling Studio state (Facilities F4,
// Facilities-ROADMAP.md §3 app 4) — the upgraded Heat Exchanger Sizer
// on the studio kit, keeping its slug and its table.
//
// The chain is explicit: energy balance -> LMTD -> computed F ->
// U from its named resistances -> area -> tube count and shell. The
// predecessor typed both U and F; here U is assembled and F is
// computed, so the two numbers that decide the size are visible.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  capacityRate, energyBalance, lmtd, lmtdGroups, lmtdCorrectionF,
  overallU, tubeSideFilm, areaRequired, tubeCount,
  effectivenessFromNtu, ntuFromEffectiveness, airCooler,
} from '@/utils/facilities/engine/heatTransfer';

const TABLE = 'saved_heat_exchanger_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save exchanger studies.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  if (error?.code === '42P01' || /relation[^\n]*saved_heat_exchanger_projects[^\n]*does not exist/i.test(msg)) {
    return "Saving isn't set up yet. Run the heat exchanger table migrations.";
  }
  if (/updated_at/.test(msg)) {
    return 'Saving needs the f4_heat_exchanger_updated_at migration applied.';
  }
  return msg || 'Unexpected error.';
};

export const defaultInputs = () => ({
  streams: {
    hotMLbHr: '50000', hotCpBtuLbF: '0.55', hotInF: '300',
    coldMLbHr: '80000', coldCpBtuLbF: '1.0', coldInF: '100',
    dutyMode: 'hotOut', hotOutF: '200', coldOutF: '160', qMMBtuHr: '2.75',
    arrangement: 'counter', shellPasses: '1',
  },
  film: {
    uMode: 'assembled',
    uTypedBtuHrFt2F: '120',
    hoBtuHrFt2F: '200',
    hiMode: 'computed', hiTypedBtuHrFt2F: '800',
    doIn: '0.75', diIn: '0.62', kWallBtuHrFtF: '26',
    foulingOut: '0.001', foulingIn: '0.002',
    tubeMuCp: '0.5', tubeKBtuHrFtF: '0.08', tubeMuWallCp: '',
  },
  geometry: {
    tubeLengthFt: '16', layoutDeg: '30', tubePasses: '2', bundleClearanceIn: '2.5',
  },
  rating: {
    arrangement: 'counter', areaFt2: '1200', uBtuHrFt2F: '120',
  },
  air: {
    qMMBtuHr: '20', processInF: '250', processOutF: '150',
    ambientF: '95', airRiseF: '30', uBtuHrFt2F: '4.5',
    staticPressureInH2O: '0.6', fanEfficiency: '0.65', motorEfficiency: '0.92',
    checkAmbientF: '110',
  },
});

const SECTIONS = ['streams', 'film', 'geometry', 'rating', 'air'];

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

const HeatExchangerContext = createContext();

export const useHeatExchanger = () => {
  const context = useContext(HeatExchangerContext);
  if (!context) throw new Error('useHeatExchanger must be used within a HeatExchangerProvider');
  return context;
};

const num = (v, fallback = NaN) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const HeatExchangerProvider = ({ children }) => {
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

  /** Energy balance + LMTD + F, the chain that sets the driving force. */
  const thermal = useMemo(() => {
    const s = inputs.streams;
    const cHot = capacityRate({ mLbHr: num(s.hotMLbHr), cpBtuLbF: num(s.hotCpBtuLbF) });
    const cCold = capacityRate({ mLbHr: num(s.coldMLbHr), cpBtuLbF: num(s.coldCpBtuLbF) });
    const args = { cHot, cCold, thIn: num(s.hotInF), tcIn: num(s.coldInF) };
    if (s.dutyMode === 'duty') args.qBtuHr = num(s.qMMBtuHr) * 1e6;
    else if (s.dutyMode === 'coldOut') args.tcOut = num(s.coldOutF);
    else args.thOut = num(s.hotOutF);
    const bal = energyBalance(args);
    if (bal.error) return bal;
    const l = lmtd({
      thIn: args.thIn, thOut: bal.thOut, tcIn: args.tcIn, tcOut: bal.tcOut,
      arrangement: s.arrangement === 'parallel' ? 'parallel' : 'counter',
    });
    if (l.error) return { ...bal, error: l.error };
    const groups = lmtdGroups({
      thIn: args.thIn, thOut: bal.thOut, tcIn: args.tcIn, tcOut: bal.tcOut,
    });
    // F applies to shell-and-tube; pure counter or parallel flow is F = 1.
    const needsF = s.arrangement === 'shell';
    const fRes = needsF && !groups.error
      ? lmtdCorrectionF({ p: groups.p, r: groups.r, shellPasses: num(s.shellPasses, 1) })
      : { f: 1 };
    return {
      cHot, cCold, cMin: Math.min(cHot, cCold), cr: Math.min(cHot, cCold) / Math.max(cHot, cCold),
      ...bal, ...l, ...groups, fResult: fRes, f: fRes.error ? null : fRes.f,
      fError: fRes.error || null, fWarning: fRes.warning || null,
      arrangement: s.arrangement,
    };
  }, [inputs.streams]);

  /** U, either typed or assembled from its resistances. */
  const coefficient = useMemo(() => {
    const f = inputs.film;
    if (f.uMode === 'typed') {
      return { uDirtyBtuHrFt2F: num(f.uTypedBtuHrFt2F), typed: true };
    }
    let hi = num(f.hiTypedBtuHrFt2F);
    let film = null;
    if (f.hiMode === 'computed') {
      const s = inputs.streams;
      film = tubeSideFilm({
        mLbHr: num(s.coldMLbHr),
        diIn: num(f.diIn),
        muCp: num(f.tubeMuCp),
        kBtuHrFtF: num(f.tubeKBtuHrFtF),
        cpBtuLbF: num(s.coldCpBtuLbF),
        muWallCp: num(f.tubeMuWallCp, 0),
        nTubes: 200,
        passes: num(inputs.geometry.tubePasses, 2),
      });
      if (film.error) return { error: film.error, film };
      hi = film.hBtuHrFt2F;
    }
    const u = overallU({
      hoBtuHrFt2F: num(f.hoBtuHrFt2F),
      hiBtuHrFt2F: hi,
      doIn: num(f.doIn), diIn: num(f.diIn),
      kWallBtuHrFtF: num(f.kWallBtuHrFtF, 26),
      foulingOut: num(f.foulingOut, 0), foulingIn: num(f.foulingIn, 0),
    });
    return u.error ? u : { ...u, film, typed: false };
  }, [inputs.film, inputs.streams, inputs.geometry.tubePasses]);

  /** Area and bundle geometry. */
  const sizing = useMemo(() => {
    if (thermal.error) return { error: thermal.error };
    if (coefficient.error) return { error: coefficient.error };
    if (thermal.fError) return { error: thermal.fError };
    const a = areaRequired({
      qBtuHr: thermal.qBtuHr,
      uBtuHrFt2F: coefficient.uDirtyBtuHrFt2F,
      lmtdF: thermal.lmtdF,
      f: thermal.f ?? 1,
    });
    if (a.error) return a;
    const g = inputs.geometry;
    const tubes = tubeCount({
      areaFt2: a.areaFt2,
      doIn: num(inputs.film.doIn),
      tubeLengthFt: num(g.tubeLengthFt),
      layoutDeg: num(g.layoutDeg, 30),
      passes: num(g.tubePasses, 2),
      bundleClearanceIn: num(g.bundleClearanceIn, 2.5),
    });
    return { ...a, tubes };
  }, [thermal, coefficient, inputs.geometry, inputs.film.doIn]);

  /** Rating: what a given area and U actually achieve. */
  const rating = useMemo(() => {
    if (thermal.error) return { error: thermal.error };
    const r = inputs.rating;
    const ua = num(r.areaFt2) * num(r.uBtuHrFt2F);
    if (!(ua > 0) || !(thermal.cMin > 0)) return { error: 'rating needs a positive area, U and capacity rate' };
    const ntu = ua / thermal.cMin;
    const eff = effectivenessFromNtu({ ntu, cr: thermal.cr, arrangement: r.arrangement });
    const qMax = thermal.cMin * (num(inputs.streams.hotInF) - num(inputs.streams.coldInF));
    const q = eff * qMax;
    return {
      ntu, effectiveness: eff, qMaxBtuHr: qMax, qBtuHr: q,
      thOut: num(inputs.streams.hotInF) - q / thermal.cHot,
      tcOut: num(inputs.streams.coldInF) + q / thermal.cCold,
      dutyVsDesign: thermal.qBtuHr > 0 ? q / thermal.qBtuHr : null,
    };
  }, [thermal, inputs.rating, inputs.streams.hotInF, inputs.streams.coldInF]);

  /** Area an effectiveness target demands (the inverse question). */
  const ntuTarget = useMemo(() => {
    if (thermal.error || !(thermal.cMin > 0)) return null;
    const r = inputs.rating;
    const eff = rating.error ? null : rating.effectiveness;
    if (!(eff > 0)) return null;
    const n = ntuFromEffectiveness({ effectiveness: eff, cr: thermal.cr, arrangement: r.arrangement });
    return n.error ? { error: n.error } : { ntu: n.ntu };
  }, [thermal, rating, inputs.rating]);

  /** Air cooler, with the hot-day derate. */
  const cooler = useMemo(() => {
    const a = inputs.air;
    return airCooler({
      qBtuHr: num(a.qMMBtuHr) * 1e6,
      processInF: num(a.processInF), processOutF: num(a.processOutF),
      ambientF: num(a.ambientF), airRiseF: num(a.airRiseF),
      uBtuHrFt2F: num(a.uBtuHrFt2F),
      staticPressureInH2O: num(a.staticPressureInH2O, 0.6),
      fanEfficiency: num(a.fanEfficiency, 0.65),
      motorEfficiency: num(a.motorEfficiency, 0.92),
      checkAmbientF: num(a.checkAmbientF, NaN),
    });
  }, [inputs.air]);

  // --- Project lifecycle (studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId,
    name,
    schema: 2,
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
    thermal,
    coefficient,
    sizing,
    rating,
    ntuTarget,
    cooler,
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

  return <HeatExchangerContext.Provider value={value}>{children}</HeatExchangerContext.Provider>;
};
