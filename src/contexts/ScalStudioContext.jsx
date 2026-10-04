// SCAL Studio state (SC3; SCAL-U1). Modeled on WaterfloodDesignContext:
// string form state, ALL engine results useMemo-derived and never persisted
// (saved_scal_projects stores inputs; fits and curves are pure functions
// recomputed on load), studio notifications, 10 s debounced autosave.
//
// SCAL-U1 adds the model around the inputs (identification, per-input
// sources, the unit system, the origin of the working Corey set, the sample
// pedigree), the kr-1 block saved with the project for other apps to read
// by id, and record sharing (useScalProjects). The engine units never
// change: four other apps read the saved inputs directly.
//
// Thin-real lock (ReservoirEngineering-Module.md 4.2): Corey + Leverett J
// only. The fw preview reuses the Waterflood engine's makeFwFunction for a
// curves-only look at mobility; no Welge or displacement math lives here.
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import { setProvenanceField, serializeProvenance } from '@/lib/inputProvenance/model';
import { KR_CONTRACT_PAYLOAD_KEY } from '@/lib/inputProvenance/krContract';
import {
  EMPTY_IDENTIFICATION, fittedOrigin, LAB_SYSTEM_FLUIDS, appliedOwFromFit, appliedGoFromFit,
} from '@/utils/scalstudio/model';
import {
  DEFAULT_CURVES, DEFAULT_CAPILLARY, DEFAULT_HEIGHT, buildReservoirProps, buildJSpec,
  deriveCurves, deriveSamples, deriveReservoirPc, deriveHeightProfile, inputsFromPayload,
} from '@/utils/scalstudio/workspace';
import { buildScalKrContract } from '@/utils/scalstudio/krHandoff';
import { fwlPatch } from '@/utils/scalstudio/fwlDatum';
import { SCAL_UNIT_SYSTEMS, scalUnits } from '@/utils/scalstudio/units';
import { useScalProjects } from '@/components/scalstudio/useScalProjects';

const ScalStudioContext = createContext(null);

export const useScalStudio = () => {
  const ctx = useContext(ScalStudioContext);
  if (!ctx) throw new Error('useScalStudio must be used within ScalStudioProvider');
  return ctx;
};

// The builders live in the pure pipeline (utils/scalstudio/workspace) and
// are re-exported here, where Petrophysics and the SC tests import them.
export {
  DEFAULT_CURVES, LAB_SYSTEM_PRESETS, DEFAULT_CAPILLARY, DEFAULT_HEIGHT,
  buildOwParams, buildGoParams, buildReservoirProps, buildJSpec,
} from '@/utils/scalstudio/workspace';

/** Payload schema: 1 (SC3, inputs only), 2 (SCAL-U1: identification, sources, unit system, curve origin, kr-1 block). */
export const PROJECT_SCHEMA = 2;

/**
 * @param {{children: any, sharingStore?: ?object, profileSystem?: ?string, build?: ?string}} props
 *   `sharingStore` is a record sharing store (supabaseSharingStore() on the page, a memory store in
 *   tests, null for the plain owner-only saves); `profileSystem` the system the Suite unit profile
 *   leans to, for a new workspace.
 */
export const ScalStudioProvider = ({ children, sharingStore = null, profileSystem = null, build = null }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  // Persisted inputs
  const [curves, setCurves] = useState(DEFAULT_CURVES);
  const [samples, setSamples] = useState([]); // [{id, name, depth_ft, k_md, phi, sigma_dyncm, thetaDeg, krRows, pcRows, ...pedigree}]
  const [capillary, setCapillary] = useState(DEFAULT_CAPILLARY);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [notes, setNotes] = useState('');
  const [identification, setIdentification] = useState(EMPTY_IDENTIFICATION);
  const [inputMeta, setInputMeta] = useState({});
  const [unitSystemSaved, setUnitSystemSaved] = useState(null); // null: a new workspace follows the profile
  const unitSystem = SCAL_UNIT_SYSTEMS.includes(unitSystemSaved) ? unitSystemSaved : (profileSystem || 'oilfield');
  const setUnitSystem = useCallback((v) => setUnitSystemSaved(SCAL_UNIT_SYSTEMS.includes(v) ? v : 'oilfield'), []);
  const u = useMemo(() => scalUnits(unitSystem), [unitSystem]);

  // ---- Sample CRUD (Lab Data tab, SC4) ----
  const addSample = useCallback((sample) => {
    const id = uuidv4();
    setSamples((prev) => [...prev, {
      id,
      name: sample?.name || `Sample ${prev.length + 1}`,
      depth_ft: '', k_md: '', phi: '',
      sigma_dyncm: '72', thetaDeg: '0', // air-brine preset default
      fluids: LAB_SYSTEM_FLUIDS.air_brine,
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
  // the origin record stays: curveOriginStatus says "edited after the fit" from the values
  const setOwField = useCallback((k, v) => setCurves((prev) => ({ ...prev, ow: { ...prev.ow, [k]: v } })), []);
  const setGoField = useCallback((k, v) => setCurves((prev) => ({ ...prev, go: { ...prev.go, [k]: v } })), []);
  const setCapillaryField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, [k]: v })), []);
  const setManualJField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, manual: { ...prev.manual, [k]: v } })), []);
  const setReservoirField = useCallback((k, v) => setCapillary((prev) => ({ ...prev, reservoir: { ...prev.reservoir, [k]: v } })), []);
  const setHeightField = useCallback((k, v) => setHeight((prev) => ({ ...prev, [k]: v })), []);
  // the FWL entry, its TVD and its registry well: the stored TVDSS follows (SCAL-U1-014)
  const setFwlEntry = useCallback((change) => setHeight((prev) => fwlPatch(prev, change)), []);
  const setIdentificationField = useCallback((k, v) => setIdentification((prev) => ({ ...prev, [k]: v })), []);
  const setSourceField = useCallback((key, field, value) => setInputMeta((prev) => setProvenanceField(prev, key, field, value)), []);

  // ---- Derived (the pure pipeline of utils/scalstudio/workspace) ----
  const { ow, go, owStatus, goStatus, owCurves, goCurves, fwPreview } = useMemo(() => deriveCurves(curves), [curves]);
  const goSwc = curves.go?.Swc;
  const samplesDerived = useMemo(() => deriveSamples(samples, { goSwc }), [samples, goSwc]);

  // Apply a sample's fitted Corey parameters to the Curves tab working set
  // (values become strings, the studio form convention), and keep the record
  // of the fit with them (SCAL-U1-004).
  const applyKrFitToCurves = useCallback((sampleId) => {
    const s = samplesDerived.find((x) => x.id === sampleId);
    if (!s?.krFit?.params) {
      addNotification('That sample has no successful Corey fit to apply.', 'error');
      return;
    }
    const applied = appliedOwFromFit(s.krFit.params);
    setCurves((prev) => ({
      ...prev,
      phase: 'oilwater',
      ow: applied,
      owOrigin: fittedOrigin({ sample: s, fit: s.krFit, applied }),
    }));
    addNotification(`Fitted Corey set from "${s.name}" applied to the Curves tab.`, 'success');
  }, [samplesDerived, addNotification]);

  // SCAL-U2-004: the same for a sample's gas-oil fit
  const applyGoFitToCurves = useCallback((sampleId) => {
    const s = samplesDerived.find((x) => x.id === sampleId);
    if (!s?.goFit?.params) {
      addNotification('That sample has no successful gas-oil Corey fit to apply.', 'error');
      return;
    }
    const applied = appliedGoFromFit(s.goFit.params);
    setCurves((prev) => ({
      ...prev,
      phase: 'gasoil',
      go: applied,
      goOrigin: fittedOrigin({ sample: s, fit: s.goFit, applied, set: 'gas_oil' }),
    }));
    addNotification(`Fitted gas-oil Corey set from "${s.name}" applied to the Curves tab.`, 'success');
  }, [samplesDerived, addNotification]);

  // ---- Derived: working J spec, reservoir Pc, saturation-height ----
  const jResolved = useMemo(() => buildJSpec(capillary, samplesDerived), [capillary, samplesDerived]);
  const reservoir = useMemo(() => buildReservoirProps(capillary.reservoir), [capillary.reservoir]);
  const reservoirPc = useMemo(() => deriveReservoirPc(jResolved, reservoir, height), [jResolved, reservoir, height]);
  const heightProfile = useMemo(() => deriveHeightProfile(jResolved, reservoir, height), [jResolved, reservoir, height]);

  // ---- The kr-1 block (SCAL-U1, RL11): one builder for save, handoff and report ----
  const projectRef = useRef({ id: null, name: '' });
  const contractFor = useCallback((id, name, generatedAt = new Date()) => buildScalKrContract({
    curves, ow, go, capillary, jResolved, reservoir, height, heightProfile, samples, identification,
    projectId: id, projectName: name, build, generatedAt,
  }), [curves, ow, go, capillary, jResolved, reservoir, height, heightProfile, samples, identification, build]);

  // ---- Project persistence (inputs, the model around them, the kr-1 block) ----
  const serialize = useCallback((id, name) => ({
    id,
    name,
    schema: PROJECT_SCHEMA,
    unitSystem,
    identification,
    inputMeta: serializeProvenance(inputMeta),
    curves,
    samples,
    capillary,
    height,
    notes,
    [KR_CONTRACT_PAYLOAD_KEY]: contractFor(id, name),
    modified: new Date().toISOString(),
  }), [unitSystem, identification, inputMeta, curves, samples, capillary, height, notes, contractFor]);

  const hydrate = useCallback((payload) => {
    const i = inputsFromPayload(payload);
    setCurves(i.curves);
    setSamples(i.samples);
    setCapillary(i.capillary);
    setHeight(i.height);
    setNotes(i.notes);
    setIdentification(i.identification);
    setInputMeta(i.inputMeta);
    setUnitSystemSaved(i.unitSystem);
  }, []);

  const changeKey = useMemo(() => [curves, samples, capillary, height, notes, identification, inputMeta, unitSystem], [curves, samples, capillary, height, notes, identification, inputMeta, unitSystem]);
  const proj = useScalProjects({ serialize, hydrate, changeKey, addNotification, sharingStore });
  projectRef.current = { id: proj.currentProjectId, name: proj.projectName };
  const contract = useMemo(
    () => contractFor(proj.currentProjectId, proj.projectName),
    [contractFor, proj.currentProjectId, proj.projectName],
  );

  // The project file (SCAL-U1-010): the saved payload itself, and a reader
  // that restores all of it (the SC5 import took the samples only).
  const serializeForExport = useCallback(
    () => serialize(proj.currentProjectId, proj.projectName || 'scal-project'),
    [serialize, proj.currentProjectId, proj.projectName],
  );
  const hydrateFromFile = useCallback((payload) => hydrate(payload), [hydrate]);

  const value = {
    // shell plumbing
    notifications, addNotification, removeNotification,
    // projects and sharing
    ...proj,
    // inputs
    curves, setCurveField, setOwField, setGoField,
    samples, setSamples, addSample, updateSample, removeSample,
    applyKrFitToCurves, applyGoFitToCurves,
    capillary, setCapillaryField, setManualJField, setReservoirField,
    height, setHeightField, setFwlEntry,
    notes, setNotes,
    identification, setIdentificationField,
    inputMeta, setSourceField,
    unitSystem, setUnitSystem, u, profileSystem, followsProfile: unitSystemSaved == null && !!profileSystem,
    // derived
    ow, go, owStatus, goStatus, owCurves, goCurves, fwPreview,
    samplesDerived, jResolved, reservoir, reservoirPc, heightProfile,
    contract, contractFor, build, serialize, serializeForExport, hydrateFromFile,
  };

  return <ScalStudioContext.Provider value={value}>{children}</ScalStudioContext.Provider>;
};
