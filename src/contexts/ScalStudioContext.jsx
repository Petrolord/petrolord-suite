// SCAL Studio state (SC3). Modeled on WaterfloodDesignContext: string form
// state, ALL engine results useMemo-derived and never persisted
// (saved_scal_projects stores inputs only; fits and curves are pure
// functions recomputed on load), the shared savedProjects service, studio
// notifications, 10 s debounced autosave.
//
// Thin-real lock (ReservoirEngineering-Module.md 4.2): Corey + Leverett J
// only. The fw preview reuses the Waterflood engine's makeFwFunction for a
// curves-only look at mobility; no Welge or displacement math lives here.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { makeFwFunction } from '@/utils/fractionalFlowCalculations';
import {
  validateCoreyParams,
  buildCoreyOilWater,
  buildCoreyGasOil,
  computeJTable,
  fitCoreyToKrTable,
  averageJCurves,
  pcFromJ,
  swVsHeight,
} from '@/utils/scalCalculations';

const ScalStudioContext = createContext(null);

export const useScalStudio = () => {
  const ctx = useContext(ScalStudioContext);
  if (!ctx) throw new Error('useScalStudio must be used within ScalStudioProvider');
  return ctx;
};

const service = createSavedProjectsService('saved_scal_projects', {
  signInMessage: 'Sign in to save SCAL projects.',
});

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export const DEFAULT_CURVES = {
  phase: 'oilwater', // 'oilwater' | 'gasoil'
  ow: { Swc: '0.2', Sor: '0.25', krwMax: '0.35', kroMax: '0.9', nw: '2.5', no: '2.0' },
  go: { Swc: '0.2', Sgc: '0.05', Sorg: '0.15', krgMax: '0.6', krogMax: '0.85', ng: '2.0', nog: '2.5' },
  fwPreviewOn: false,
  muW: '0.5',
  muO: '5.0',
};

// Lab σ·cosθ presets by measurement system (standard SCAL practice values;
// editable per sample). Values in dyn/cm and degrees.
export const LAB_SYSTEM_PRESETS = [
  { key: 'air_brine', label: 'Air-brine', sigma: '72', theta: '0' },
  { key: 'air_mercury', label: 'Air-mercury', sigma: '480', theta: '40' },
  { key: 'oil_brine', label: 'Oil-brine', sigma: '30', theta: '30' },
];

export const DEFAULT_CAPILLARY = {
  jMode: 'manual', // 'manual' (a, b, Swirr typed) | 'samples' (averaged lab J, SC4)
  manual: { a: '0.25', b: '1.4', Swirr: '0.15' },
  SwirrOverride: '',
  includedSampleIds: [],
  reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' },
};

export const DEFAULT_HEIGHT = {
  gammaW: '1.05',
  gammaHc: '0.80',
  fwl_tvdss: '',
  swMin: '0.2',
  swMax: '0.95',
};

// ---- Pure builders (jest-guarded) ----

export function buildOwParams(ow) {
  const p = {
    Swc: num(ow.Swc), Sor: num(ow.Sor),
    krwMax: num(ow.krwMax), kroMax: num(ow.kroMax),
    nw: num(ow.nw), no: num(ow.no),
  };
  const v = validateCoreyParams(p, 'oilwater');
  return v.ok ? { params: p, error: null } : { params: null, error: v.errors[0] };
}

export function buildGoParams(go) {
  const p = {
    Swc: num(go.Swc), Sgc: num(go.Sgc), Sorg: num(go.Sorg),
    krgMax: num(go.krgMax), krogMax: num(go.krogMax),
    ng: num(go.ng), nog: num(go.nog),
  };
  const v = validateCoreyParams(p, 'gasoil');
  return v.ok ? { params: p, error: null } : { params: null, error: v.errors[0] };
}

export function buildReservoirProps(r) {
  const props = {
    k_md: num(r.k_md), phi: num(r.phi),
    sigma_dyncm: num(r.sigma_dyncm), thetaDeg: num(r.thetaDeg),
  };
  if (!(props.k_md > 0) || !(props.phi > 0 && props.phi < 1) || !(props.sigma_dyncm > 0)
    || !(props.thetaDeg >= 0 && props.thetaDeg < 90)) {
    return { props: null, error: 'Reservoir rock needs positive k and sigma, porosity in (0, 1) and a contact angle below 90 degrees.' };
  }
  return { props, error: null };
}

/**
 * Resolve the working J spec from capillary config + samples.
 * manual mode: power law typed directly. samples mode: geometric-mean
 * average over the included samples' J tables (SC4).
 * -> { jSpec, meta, error }
 */
export function buildJSpec(capillary, samples) {
  if (capillary.jMode === 'manual') {
    const a = num(capillary.manual.a);
    const b = num(capillary.manual.b);
    const Swirr = num(capillary.manual.Swirr);
    if (!(a > 0) || !(b > 0) || !(Swirr >= 0 && Swirr < 1)) {
      return { jSpec: null, meta: null, error: 'Manual J needs positive a and b and Swirr in [0, 1).' };
    }
    return { jSpec: { type: 'power', a, b, Swirr }, meta: { mode: 'manual' }, error: null };
  }
  const included = (samples ?? []).filter(
    (s) => capillary.includedSampleIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3,
  );
  if (included.length === 0) {
    return { jSpec: null, meta: null, error: 'Include at least one sample with a computed J table, or switch to manual mode.' };
  }
  const swirrOverride = num(capillary.SwirrOverride);
  const avg = averageJCurves(
    included.map((s) => ({ name: s.name, jRows: s.jRows })),
    Number.isFinite(swirrOverride) ? { Swirr: swirrOverride } : {},
  );
  if (!avg.ok) return { jSpec: null, meta: null, error: avg.errors[0] };
  if (!avg.fit) {
    return { jSpec: null, meta: { mode: 'samples', avg }, error: 'The averaged J curve could not be fitted; check the sample data.' };
  }
  // The averaged fit lives on the normalized Sw* axis (Swirr 0 there). Map
  // it back to true Sw with the shared Swirr the averaging used.
  const swirr = Number.isFinite(swirrOverride)
    ? swirrOverride
    : Math.max(0, Math.min(...included.flatMap((s) => s.jRows.map((r) => r.Sw))) - 0.02);
  return {
    jSpec: { type: 'power', a: avg.fit.a, b: avg.fit.b, Swirr: swirr },
    meta: { mode: 'samples', avg, sampleCount: included.length },
    error: null,
  };
}

export const ScalStudioProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // Projects
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Persisted inputs
  const [curves, setCurves] = useState(DEFAULT_CURVES);
  const [samples, setSamples] = useState([]); // [{id, name, depth_ft, k_md, phi, sigma_dyncm, thetaDeg, krRows, pcRows}]
  const [capillary, setCapillary] = useState(DEFAULT_CAPILLARY);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [notes, setNotes] = useState('');

  // ---- Sample CRUD (Lab Data tab, SC4) ----
  const addSample = useCallback((sample) => {
    const id = uuidv4();
    setSamples((prev) => [...prev, {
      id,
      name: sample?.name || `Sample ${prev.length + 1}`,
      depth_ft: '', k_md: '', phi: '',
      sigma_dyncm: '72', thetaDeg: '0', // air-brine preset default
      krRows: [], pcRows: [],
      ...sample,
    }]);
    return id;
  }, []);
  const updateSample = useCallback((id, patch) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);
  const removeSample = useCallback((id) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
    setCapillary((prev) => ({
      ...prev,
      includedSampleIds: prev.includedSampleIds.filter((x) => x !== id),
    }));
  }, []);

  const setCurveField = useCallback((k, v) => setCurves((prev) => ({ ...prev, [k]: v })), []);
  const setOwField = useCallback((k, v) => setCurves((prev) => ({ ...prev, ow: { ...prev.ow, [k]: v } })), []);
  const setGoField = useCallback((k, v) => setCurves((prev) => ({ ...prev, go: { ...prev.go, [k]: v } })), []);
  const setCapillaryField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, [k]: v })), []);
  const setManualJField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, manual: { ...prev.manual, [k]: v } })), []);
  const setReservoirField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, reservoir: { ...prev.reservoir, [k]: v } })), []);
  const setHeightField = useCallback((k, v) => setHeight((prev) => ({ ...prev, [k]: v })), []);

  // ---- Derived: Corey curves ----
  const ow = useMemo(() => buildOwParams(curves.ow), [curves.ow]);
  const go = useMemo(() => buildGoParams(curves.go), [curves.go]);
  const owCurves = useMemo(
    () => (ow.params ? buildCoreyOilWater(ow.params, { n: 101 }) : null),
    [ow],
  );
  const goCurves = useMemo(
    () => (go.params ? buildCoreyGasOil(go.params, { n: 101 }) : null),
    [go],
  );
  const fwPreview = useMemo(() => {
    if (!curves.fwPreviewOn || !ow.params) return null;
    const muW = num(curves.muW);
    const muO = num(curves.muO);
    if (!(muW > 0) || !(muO > 0)) return null;
    const { fw } = makeFwFunction({ krSpec: { type: 'corey', ...ow.params }, muW, muO });
    const rows = [];
    const lo = ow.params.Swc;
    const hi = 1 - ow.params.Sor;
    for (let i = 0; i <= 101; i++) {
      const Sw = lo + ((hi - lo) * i) / 101;
      rows.push({ Sw, fw: fw(Sw) });
    }
    return { rows, muW, muO };
  }, [curves.fwPreviewOn, curves.muW, curves.muO, ow]);

  // ---- Derived: per-sample J tables and Corey fits (consumed by SC4 UI,
  // derived here so capillary averaging and persistence stay one-source) ----
  const samplesDerived = useMemo(() => samples.map((s) => {
    const props = {
      k_md: num(s.k_md), phi: num(s.phi),
      sigma_dyncm: num(s.sigma_dyncm), thetaDeg: num(s.thetaDeg),
    };
    const jTable = (s.pcRows?.length ?? 0) >= 3 ? computeJTable(s.pcRows, props) : null;
    const krFit = (s.krRows?.length ?? 0) >= 3 ? fitCoreyToKrTable(s.krRows) : null;
    return {
      ...s,
      jRows: jTable?.ok ? jTable.rows.map((r) => ({ Sw: r.Sw, J: r.J })) : [],
      jError: jTable && !jTable.ok ? jTable.errors[0] : null,
      krFit: krFit?.ok ? krFit : null,
      krFitError: krFit && !krFit.ok ? krFit.errors[0] : null,
    };
  }), [samples]);

  // Apply a sample's fitted Corey parameters to the Curves tab working set
  // (values become strings, the studio form convention).
  const applyKrFitToCurves = useCallback((sampleId) => {
    const s = samplesDerived.find((x) => x.id === sampleId);
    if (!s?.krFit?.params) {
      addNotification('That sample has no successful Corey fit to apply.', 'error');
      return;
    }
    const p = s.krFit.params;
    setCurves((prev) => ({
      ...prev,
      phase: 'oilwater',
      ow: {
        Swc: p.Swc.toFixed(3),
        Sor: p.Sor.toFixed(3),
        krwMax: p.krwMax.toPrecision(4),
        kroMax: p.kroMax.toPrecision(4),
        nw: p.nw.toFixed(2),
        no: p.no.toFixed(2),
      },
    }));
    addNotification(`Fitted Corey set from "${s.name}" applied to the Curves tab.`, 'success');
  }, [samplesDerived, addNotification]);

  // ---- Derived: working J spec, reservoir Pc, saturation-height ----
  const jResolved = useMemo(
    () => buildJSpec(capillary, samplesDerived),
    [capillary, samplesDerived],
  );
  const reservoir = useMemo(() => buildReservoirProps(capillary.reservoir), [capillary.reservoir]);
  const reservoirPc = useMemo(() => {
    if (!jResolved.jSpec || !reservoir.props) return null;
    const swMin = num(height.swMin);
    const swMax = num(height.swMax);
    const res = pcFromJ(jResolved.jSpec, reservoir.props, {
      n: 61,
      SwMin: Number.isFinite(swMin) ? swMin : null,
      SwMax: Number.isFinite(swMax) ? swMax : null,
    });
    return res.ok ? res.rows : null;
  }, [jResolved, reservoir, height.swMin, height.swMax]);
  const heightProfile = useMemo(() => {
    if (!jResolved.jSpec || !reservoir.props) return null;
    const gammaW = num(height.gammaW);
    const gammaHc = num(height.gammaHc);
    if (!(gammaW > gammaHc)) return null;
    const swMin = num(height.swMin);
    const swMax = num(height.swMax);
    const res = swVsHeight(jResolved.jSpec, reservoir.props, { gammaW, gammaHc }, {
      n: 61,
      SwMin: Number.isFinite(swMin) ? swMin : null,
      SwMax: Number.isFinite(swMax) ? swMax : null,
    });
    return res.ok ? res.rows : null;
  }, [jResolved, reservoir, height]);

  // ---- Project persistence (inputs only; schema: 1) ----
  const serializeInputs = useCallback(() => ({
    id: currentProjectId,
    name: projectName,
    schema: 1,
    curves,
    samples,
    capillary,
    height,
    notes,
    modified: new Date().toISOString(),
  }), [currentProjectId, projectName, curves, samples, capillary, height, notes]);

  const hydrate = useCallback((payload) => {
    setCurves({
      ...DEFAULT_CURVES,
      ...(payload?.curves || {}),
      ow: { ...DEFAULT_CURVES.ow, ...(payload?.curves?.ow || {}) },
      go: { ...DEFAULT_CURVES.go, ...(payload?.curves?.go || {}) },
    });
    setSamples(Array.isArray(payload?.samples) ? payload.samples : []);
    setCapillary({
      ...DEFAULT_CAPILLARY,
      ...(payload?.capillary || {}),
      manual: { ...DEFAULT_CAPILLARY.manual, ...(payload?.capillary?.manual || {}) },
      reservoir: { ...DEFAULT_CAPILLARY.reservoir, ...(payload?.capillary?.reservoir || {}) },
      includedSampleIds: Array.isArray(payload?.capillary?.includedSampleIds)
        ? payload.capillary.includedSampleIds
        : [],
    });
    setHeight({ ...DEFAULT_HEIGHT, ...(payload?.height || {}) });
    setNotes(typeof payload?.notes === 'string' ? payload.notes : '');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setProjects(await service.list());
      } catch (e) {
        console.error(e);
        addNotification('Could not load saved projects', 'error');
      }
    })();
  }, [addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      if (!payload) {
        addNotification('Project not found', 'error');
        return;
      }
      setCurrentProjectId(id);
      setProjectName(payload.name || 'Untitled project');
      hydrate(payload);
      setHydrated(true);
      setSaveError(null);
    } catch (e) {
      console.error(e);
      addNotification('Could not open project', 'error');
    }
  }, [addNotification, hydrate]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, {
        id, name, schema: 1, curves, samples, capillary, height, notes,
        modified: new Date().toISOString(),
      });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setProjects(await service.list());
      addNotification(`Project "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message || 'Could not create project', 'error');
    }
  }, [curves, samples, capillary, height, notes, addNotification]);

  const deleteProject = useCallback(async (id) => {
    try {
      await service.remove(id);
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setProjectName('');
        setHydrated(false);
      }
      setProjects(await service.list());
      addNotification('Project deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification('Could not delete project', 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) {
      addNotification('Create or open a project first', 'info');
      return;
    }
    setIsSaving(true);
    try {
      await service.save(currentProjectId, serializeInputs());
      setLastSaveTime(new Date());
      setSaveError(null);
    } catch (e) {
      console.error(e);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, serializeInputs, addNotification]);

  // Debounced autosave (10 s), only once a project is open.
  const autosaveRef = useRef(serializeInputs);
  autosaveRef.current = serializeInputs;
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
  }, [curves, samples, capillary, height, notes, currentProjectId, hydrated]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    // projects
    projects, currentProjectId, projectName,
    createProject, openProject, deleteProject, manualSave,
    isSaving, saveError, lastSaveTime,
    // inputs
    curves, setCurveField, setOwField, setGoField,
    samples, setSamples, addSample, updateSample, removeSample,
    applyKrFitToCurves,
    capillary, setCapillaryField, setManualJField, setReservoirField,
    height, setHeightField,
    notes, setNotes,
    // derived
    ow, go, owCurves, goCurves, fwPreview,
    samplesDerived, jResolved, reservoir, reservoirPc, heightProfile,
  };

  return <ScalStudioContext.Provider value={value}>{children}</ScalStudioContext.Provider>;
};
