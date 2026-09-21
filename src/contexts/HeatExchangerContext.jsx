// Heat Exchanger & Cooling Studio state (Facilities F4,
// Facilities-ROADMAP.md §3 app 4): the upgraded Heat Exchanger Sizer
// on the studio kit, keeping its slug and its table.
//
// The chain is explicit: energy balance, LMTD, computed F, U from its
// named resistances, area, tube count and shell. The predecessor typed
// both U and F; here U is assembled and F is computed, so the two
// numbers that decide the size are visible.
//
// THE TUBE COUNT IS A LOOP AND IT IS CLOSED NOW. This file used to pass
// a hard-coded `nTubes: 200` into the tube-side film while the card
// beside it printed 92, so the studio computed U at a tube count the
// same screen contradicted: the area came out 24.7 percent high, U 19.8
// percent low, and the Reynolds number on the panel was 37 percent of
// the self-consistent one. The film, the coefficient, the area and the
// bundle are now iterated to a single tube count, and the trail is
// reported so the user can see it settle.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  capacityRate, energyBalance, lmtd, lmtdGroups, lmtdCorrectionF,
  overallUOutside, tubeSideFilm, areaRequired, tubeCount,
  effectivenessFromNtu, airCooler,
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
    checkAmbientF: '110', draftType: 'forced', barometricPsia: '14.7',
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

/**
 * Read a number out of a text box, and refuse anything that is not one.
 *
 * `parseFloat` used to be good enough for the boxes, which are
 * type="number", but it is not good enough for a SAVED STUDY: a stored
 * '50000 lb/hr' or '80000abc' parsed to a number and gave a full
 * answer, and a stored '50,000' parsed to 50 and reached the engine as
 * a valid duty that then tripped the stream-cross refusal, so the
 * studio blamed the physics for a typing problem.
 */
const num = (v, fallback = NaN) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  if (t === '') return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
};

/** The arrangement the engine names, from the one the Select emits. */
const arrangementFor = (value) => {
  if (value === 'parallel') return 'parallel';
  if (value === 'shell') return 'shell1';
  return 'counter';
};

/** Every derived block is wrapped: a throw used to white-screen the tab. */
const guarded = (label, fn) => {
  try {
    return fn();
  } catch (e) {
    return { error: `${label} could not be computed: ${e?.message || String(e)}` };
  }
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
  const thermal = useMemo(() => guarded('the driving force', () => {
    const s = inputs.streams;
    const hot = capacityRate({ mLbHr: num(s.hotMLbHr), cpBtuLbF: num(s.hotCpBtuLbF) });
    if (hot.error) return { error: `hot stream: ${hot.error}` };
    const cold = capacityRate({ mLbHr: num(s.coldMLbHr), cpBtuLbF: num(s.coldCpBtuLbF) });
    if (cold.error) return { error: `cold stream: ${cold.error}` };
    const cHot = hot.cBtuHrF;
    const cCold = cold.cBtuHrF;
    const arrangement = arrangementFor(s.arrangement);
    const args = {
      cHot, cCold, thIn: num(s.hotInF), tcIn: num(s.coldInF), arrangement,
    };
    if (s.dutyMode === 'duty') args.qBtuHr = num(s.qMMBtuHr) * 1e6;
    else if (s.dutyMode === 'coldOut') args.tcOut = num(s.coldOutF);
    else args.thOut = num(s.hotOutF);
    const bal = energyBalance(args);
    if (bal.error) return { error: bal.error };
    const l = lmtd({
      thIn: args.thIn, thOut: bal.thOut, tcIn: args.tcIn, tcOut: bal.tcOut, arrangement,
    });
    if (l.error) return { ...bal, error: l.error };
    const groups = lmtdGroups({
      thIn: args.thIn, thOut: bal.thOut, tcIn: args.tcIn, tcOut: bal.tcOut,
    });
    // F applies to shell-and-tube; pure counter or parallel flow is F = 1.
    const needsF = arrangement === 'shell1';
    let fRes = { f: 1, shellPasses: null };
    if (needsF) {
      fRes = groups.error
        ? { error: groups.error }
        : lmtdCorrectionF({ p: groups.p, r: groups.r, shellPasses: num(s.shellPasses) });
    }
    const cMin = Math.min(cHot, cCold);
    return {
      cHot,
      cCold,
      cMin,
      cr: cMin / Math.max(cHot, cCold),
      ...bal,
      ...l,
      p: groups.error ? null : groups.p,
      r: groups.error ? null : groups.r,
      groupsError: groups.error || null,
      fResult: fRes,
      f: fRes.error ? null : fRes.f,
      fError: fRes.error || null,
      fWarning: fRes.warning || null,
      shellPassesUsed: fRes.shellPasses ?? null,
      arrangement: s.arrangement,
      engineArrangement: arrangement,
    };
  }), [inputs.streams]);

  /**
   * U, the area and the bundle, ITERATED to one tube count.
   *
   * The film needs a tube count, the tube count needs an area, and the
   * area needs the film. The map is a contraction (more tubes lowers the
   * velocity, which lowers hi, which raises the area, which asks for
   * more tubes, but by less each time), so plain iteration settles: from
   * a seed of one tube per pass the default case runs 2, 60, 72, 74 and
   * stops. The shipped studio short-circuited the loop with a literal
   * 200 and printed the first iterate's bundle beside the zeroth
   * iterate's coefficient.
   */
  const design = useMemo(() => guarded('the surface', () => {
    if (thermal.error) return { error: thermal.error };
    if (thermal.fError) return { error: thermal.fError };
    const f = inputs.film;
    const g = inputs.geometry;
    const s = inputs.streams;
    const passes = num(g.tubePasses);
    const doIn = num(f.doIn);
    const diIn = num(f.diIn);
    const fFactor = thermal.f ?? 1;

    const sizeFrom = (u) => {
      const a = areaRequired({
        qBtuHr: thermal.qBtuHr,
        uBtuHrFt2F: u.uDirtyBtuHrFt2F,
        lmtdF: thermal.lmtdF,
        f: fFactor,
      });
      if (a.error) return { error: a.error };
      const tubes = tubeCount({
        areaFt2: a.areaFt2,
        doIn,
        tubeLengthFt: num(g.tubeLengthFt),
        layoutDeg: num(g.layoutDeg),
        passes,
        bundleClearanceIn: num(g.bundleClearanceIn),
      });
      if (tubes.error) return { error: tubes.error, areaFt2: a.areaFt2 };
      return { areaFt2: a.areaFt2, tubes };
    };

    if (f.uMode === 'typed') {
      const typedU = num(f.uTypedBtuHrFt2F);
      if (!(typedU > 0)) return { error: `a typed U must be positive Btu/hr.ft2.F; it was ${f.uTypedBtuHrFt2F || 'empty'}` };
      const u = { uDirtyBtuHrFt2F: typedU, typed: true };
      const sized = sizeFrom(u);
      return sized.error ? { ...sized, u } : { u, film: null, ...sized };
    }

    const assemble = (hi) => overallUOutside({
      hoBtuHrFt2F: num(f.hoBtuHrFt2F),
      hiBtuHrFt2F: hi,
      doIn,
      diIn,
      kWallBtuHrFtF: num(f.kWallBtuHrFtF),
      foulingOut: num(f.foulingOut),
      foulingIn: num(f.foulingIn),
    });

    if (f.hiMode === 'typed') {
      const u = assemble(num(f.hiTypedBtuHrFt2F));
      if (u.error) return { error: u.error };
      const sized = sizeFrom(u);
      return sized.error ? { ...sized, u } : { u: { ...u, typed: false }, film: null, ...sized };
    }

    const step = (nTubes) => {
      const film = tubeSideFilm({
        mLbHr: num(s.coldMLbHr),
        diIn,
        muCp: num(f.tubeMuCp),
        kBtuHrFtF: num(f.tubeKBtuHrFtF),
        cpBtuLbF: num(s.coldCpBtuLbF),
        muWallCp: num(f.tubeMuWallCp, 0),
        nTubes,
        passes,
        service: 'heating',
      });
      if (film.error) return { error: film.error, film, atTubes: nTubes };
      const u = assemble(film.hBtuHrFt2F);
      if (u.error) return { error: u.error, film, atTubes: nTubes };
      const sized = sizeFrom(u);
      if (sized.error) return { ...sized, film, u, atTubes: nTubes };
      return { film, u: { ...u, typed: false }, ...sized, atTubes: nTubes };
    };

    if (!Number.isInteger(passes) || passes < 1) {
      return { error: `the number of tube passes must be a whole number of at least 1; it was ${g.tubePasses || 'empty'}` };
    }
    // A seed ladder, because an intermediate tube count can land in the
    // transition band the engine refuses. The first seed that evaluates
    // starts the loop; if none does, the refusal is reported with the
    // tube count that produced it, which is the actionable form.
    const seeds = [passes, 6 * passes, 30 * passes, 150 * passes];
    let current = null;
    let firstError = null;
    let seed = null;
    for (let i = 0; i < seeds.length && !current; i += 1) {
      const attempt = step(seeds[i]);
      if (attempt.error) {
        if (!firstError) firstError = attempt;
      } else {
        current = attempt;
        seed = seeds[i];
      }
    }
    if (!current) {
      return {
        ...firstError,
        error: `${firstError.error} (tried ${seeds.join(', ')} tubes)`,
      };
    }

    const trail = [seed];
    let n = seed;
    for (let i = 0; i < 40; i += 1) {
      const next = current.tubes.nTubes;
      if (next === n) {
        return {
          ...current,
          tubeTrail: trail,
          tubeIterations: i + 1,
          tubeCountConverged: true,
          tubeCountNote: null,
        };
      }
      if (trail.includes(next)) {
        // The tube count is a Math.ceil of a continuous requirement, so
        // two adjacent counts can chase each other. The larger one is
        // the bundle that covers the duty, and the studio says which.
        const settled = step(Math.max(n, next));
        return {
          ...(settled.error ? current : settled),
          tubeTrail: [...trail, next],
          tubeIterations: i + 1,
          tubeCountConverged: false,
          tubeCountNote: `the tube count settles between ${Math.min(n, next)} and ${Math.max(n, next)} tubes, because the count is a whole number rounded up from a continuous area. The larger bundle is shown, which is the one that covers the duty.`,
        };
      }
      const attempt = step(next);
      if (attempt.error) {
        return {
          ...attempt,
          error: `${attempt.error} (reached at ${next} tubes while the count was settling from ${trail.join(', ')})`,
          tubeTrail: [...trail, next],
        };
      }
      trail.push(next);
      n = next;
      current = attempt;
    }
    return {
      error: `the tube count did not settle in 40 passes: ${trail.join(', ')}`,
      tubeTrail: trail,
    };
  }), [thermal, inputs.film, inputs.geometry, inputs.streams]);

  /** The panels' two historic shapes, now views over one iterated design. */
  const coefficient = useMemo(() => {
    if (design.error && !design.u) return { error: design.error, film: design.film || null };
    if (!design.u) return { error: design.error || 'no coefficient' };
    return {
      ...design.u,
      film: design.film || null,
      typed: !!design.u.typed,
      tubeTrail: design.tubeTrail || null,
      tubeIterations: design.tubeIterations ?? null,
      tubeCountConverged: design.tubeCountConverged ?? null,
      tubeCountNote: design.tubeCountNote ?? null,
    };
  }, [design]);

  const sizing = useMemo(() => {
    if (design.error) return { error: design.error };
    return { areaFt2: design.areaFt2, tubes: design.tubes };
  }, [design]);

  /** Rating: what a given area and U actually achieve. */
  const rating = useMemo(() => guarded('the rating', () => {
    if (thermal.error) return { error: thermal.error };
    const r = inputs.rating;
    const area = num(r.areaFt2);
    const u = num(r.uBtuHrFt2F);
    if (!(area > 0)) return { error: `the installed area must be positive ft2; it was ${r.areaFt2 || 'empty'}` };
    if (!(u > 0)) return { error: `the rating U must be positive Btu/hr.ft2.F; it was ${r.uBtuHrFt2F || 'empty'}` };
    if (!(thermal.cMin > 0)) return { error: 'rating needs a positive capacity rate' };
    const ntu = (area * u) / thermal.cMin;
    const eff = effectivenessFromNtu({ ntu, cr: thermal.cr, arrangement: r.arrangement });
    if (eff.error) return { error: eff.error };
    const qMax = thermal.cMin * (num(inputs.streams.hotInF) - num(inputs.streams.coldInF));
    const q = eff.effectiveness * qMax;
    return {
      ntu,
      effectiveness: eff.effectiveness,
      ceiling: eff.ceiling,
      qMaxBtuHr: qMax,
      qBtuHr: q,
      thOut: num(inputs.streams.hotInF) - q / thermal.cHot,
      tcOut: num(inputs.streams.coldInF) + q / thermal.cCold,
      dutyVsDesign: thermal.qBtuHr > 0 ? q / thermal.qBtuHr : null,
    };
  }), [thermal, inputs.rating, inputs.streams.hotInF, inputs.streams.coldInF]);

  /** Air cooler, with the hot-day RATING. */
  const cooler = useMemo(() => guarded('the air cooler', () => {
    const a = inputs.air;
    const check = num(a.checkAmbientF);
    return airCooler({
      qBtuHr: num(a.qMMBtuHr) * 1e6,
      processInF: num(a.processInF), processOutF: num(a.processOutF),
      ambientF: num(a.ambientF), airRiseF: num(a.airRiseF),
      uBtuHrFt2F: num(a.uBtuHrFt2F),
      staticPressureInH2O: num(a.staticPressureInH2O),
      fanEfficiency: num(a.fanEfficiency),
      motorEfficiency: num(a.motorEfficiency),
      draftType: a.draftType || 'forced',
      barometricPsia: num(a.barometricPsia),
      // An empty box omits the block rather than asking the engine to
      // rate a NaN ambient.
      ...(String(a.checkAmbientF ?? '').trim() === '' ? {} : { checkAmbientF: check }),
    });
  }), [inputs.air]);

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
