// Production Network Studio state (Production P11,
// Production-ROADMAP.md app 11).
//
// This is the studio P6.5 was built for. Every well node carries the
// SHARED per-well record, so a network is assembled out of the same
// well descriptions the gas lift, ESP, rod pump, gas well, choke and
// flow assurance studios are all designing against. Describe a well
// once and it turns up here already described.
//
// Live versus explicit run, by the usual rule of what it costs. The
// topology, the well models and their validity are live: they are
// cheap and a user building a network needs to see it go valid as the
// last connection lands. THE SOLVE IS NOT LIVE. It samples a
// characteristic curve for every branch and every well -- hundreds of
// traverses -- and then Newtons the whole network, and then does it
// again once per well for the standalone comparison. That is seconds,
// not milliseconds, so it runs when asked and goes stale when the
// inputs move.
import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import * as spine from '@/lib/productionSpine';
import { num } from '@/utils/nodal/numerics';
import {
  defaultWellInputs, buildWellModel, mergeWellInputs, fromWellModelPayload,
  wellModelProblems,
} from '@/utils/production/wellModel';
import {
  runNetwork, deliverySweep, PIPE_SCHEDULE, scheduleRow, ROUGHNESS_IN,
  barlowPressurePsi, LINE_PIPE_GRADES,
} from '@/utils/production/network';
import { buildNetwork } from '@/utils/production/engine/networkSolve';

const TABLE = 'saved_network_projects';

export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save networks.',
});

export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01'
    || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return "Saving isn't set up yet. Run the p11_saved_network_projects migration.";
  }
  return msg || 'Unexpected error.';
};

/** A well node: the shared record, plus the duty it is flowing at. */
export const defaultWellNode = (label, over = {}) => ({
  id: uuidv4(),
  kind: 'well',
  label,
  spineWellId: null,
  model: defaultWellInputs(),
  duty: { wctPct: '20', gor: '', wgr: '5', cgr: '20' },
  ...over,
});

export const defaultJunction = (label) => ({
  id: uuidv4(), kind: 'junction', label,
});

export const defaultSink = (label) => ({
  id: uuidv4(), kind: 'sink', label, pressurePsia: '180',
});

export const defaultBranch = (from, to, label, over = {}) => ({
  id: uuidv4(),
  from,
  to,
  label,
  lengthFt: '4000',
  npsPick: '4',
  schedulePick: '40',
  idIn: '4.026',
  riseFt: '0',
  roughnessIn: '0.0018',
  correlation: 'beggsBrill',
  tempF: '115',
  gradeId: 'x52',
  designFactor: '0.72',
  ...over,
});

/**
 * A three-well header on a trunk: the smallest network that shows the
 * thing this studio exists to show. One well on its own has nothing to
 * fight with.
 */
export const defaultInputs = () => {
  const wellA = defaultWellNode('P-1');
  const wellB = defaultWellNode('P-2');
  const wellC = defaultWellNode('P-3');
  wellA.model.inflow = { ...wellA.model.inflow, pr: '3000', pb: '2100', calMode: 'pi', pi: '1.4' };
  wellB.model.inflow = { ...wellB.model.inflow, pr: '2700', pb: '2000', calMode: 'pi', pi: '0.9' };
  wellC.model.inflow = { ...wellC.model.inflow, pr: '3200', pb: '2200', calMode: 'pi', pi: '1.8' };
  [wellA, wellB, wellC].forEach((w) => {
    w.model.well = { ...w.model.well, depthFt: '7500', whtF: '140', bhtF: '200' };
    w.model.fluid = { ...w.model.fluid, api: '34', gasSg: '0.7', gor: '500' };
    w.model.completion = { ...w.model.completion, idIn: '2.992' };
  });
  wellB.duty = { ...wellB.duty, wctPct: '45' };
  wellC.duty = { ...wellC.duty, wctPct: '5' };

  const header = defaultJunction('Header');
  const sink = defaultSink('Separator');

  return {
    nodes: [wellA, wellB, wellC, header, sink],
    branches: [
      defaultBranch(wellA.id, header.id, 'P-1 flowline', { lengthFt: '3200', npsPick: '3', idIn: '3.068', tempF: '120' }),
      defaultBranch(wellB.id, header.id, 'P-2 flowline', { lengthFt: '5400', npsPick: '3', idIn: '3.068', tempF: '115' }),
      defaultBranch(wellC.id, header.id, 'P-3 flowline', { lengthFt: '2100', npsPick: '3', idIn: '3.068', tempF: '125' }),
      defaultBranch(header.id, sink.id, 'Trunk line', { lengthFt: '12000', npsPick: '6', idIn: '6.065', tempF: '105' }),
    ],
    sweep: { minPsia: '80', maxPsia: '400', points: '8' },
    link: { fieldId: null },
  };
};

export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  const base = defaultInputs();
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.branches)) return base;
  return {
    // Nodes and branches are LISTS, so they are replaced outright. A
    // spread would leave the default three-well network sitting behind
    // whatever was saved.
    nodes: raw.nodes.map((n) => ({
      ...n,
      model: n.kind === 'well' ? mergeWellInputs(n.model || {}, defaultWellInputs()) : undefined,
      duty: n.kind === 'well' ? { ...defaultWellNode('x').duty, ...(n.duty || {}) } : undefined,
    })),
    branches: raw.branches.map((b) => ({ ...defaultBranch('', '', ''), ...b })),
    sweep: { ...base.sweep, ...(raw.sweep || {}) },
    link: { ...base.link, ...(raw.link || {}) },
  };
};

const NetworkContext = createContext();

export const useProductionNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useProductionNetwork must be used within a ProductionNetworkProvider');
  return ctx;
};

/** Flatten the studio inputs into the shape the analytics take. */
export const analysisInputsFrom = (inputs) => ({
  nodes: inputs.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    pressurePsia: n.kind === 'sink' ? n.pressurePsia : undefined,
    duty: n.duty,
  })),
  branches: inputs.branches.map((b) => ({
    id: b.id,
    from: b.from,
    to: b.to,
    label: b.label,
    lengthFt: b.lengthFt,
    idIn: b.idIn,
    riseFt: b.riseFt,
    roughnessIn: b.roughnessIn,
    correlation: b.correlation,
    tempF: b.tempF,
  })),
});

export const ProductionNetworkProvider = ({ children }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();

  const [inputs, setInputs] = useState(defaultInputs);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [fields, setFields] = useState([]);
  const [spineWells, setSpineWells] = useState([]);
  const [busyMessage, setBusyMessage] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [result, setResult] = useState(null);
  const [sweep, setSweep] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  // --- topology editing ---
  const patch = useCallback((updater) => setInputs((prev) => updater(prev)), []);

  const setNode = useCallback((id, key, value) => patch((prev) => ({
    ...prev,
    nodes: prev.nodes.map((n) => (n.id === id ? { ...n, [key]: value } : n)),
  })), [patch]);

  const setNodeModel = useCallback((id, section, key, value) => patch((prev) => ({
    ...prev,
    nodes: prev.nodes.map((n) => (n.id === id
      ? { ...n, model: { ...n.model, [section]: { ...n.model[section], [key]: value } } }
      : n)),
  })), [patch]);

  const setNodeDuty = useCallback((id, key, value) => patch((prev) => ({
    ...prev,
    nodes: prev.nodes.map((n) => (n.id === id ? { ...n, duty: { ...n.duty, [key]: value } } : n)),
  })), [patch]);

  const setBranch = useCallback((id, key, value) => patch((prev) => ({
    ...prev,
    branches: prev.branches.map((b) => (b.id === id ? { ...b, [key]: value } : b)),
  })), [patch]);

  /** Picking a nominal size fills the bore; it stays editable. */
  const applySchedule = useCallback((id, nps, schedule) => {
    const row = scheduleRow(Number(nps), schedule);
    patch((prev) => ({
      ...prev,
      branches: prev.branches.map((b) => (b.id === id
        ? {
          ...b,
          npsPick: String(nps),
          schedulePick: schedule,
          idIn: row ? String(row.id) : b.idIn,
        }
        : b)),
    }));
  }, [patch]);

  const addWell = useCallback(() => {
    const n = defaultWellNode(`P-${inputs.nodes.filter((x) => x.kind === 'well').length + 1}`);
    const junction = inputs.nodes.find((x) => x.kind === 'junction')
      || inputs.nodes.find((x) => x.kind === 'sink');
    patch((prev) => ({
      ...prev,
      nodes: [...prev.nodes, n],
      branches: junction
        ? [...prev.branches, defaultBranch(n.id, junction.id, `${n.label} flowline`)]
        : prev.branches,
    }));
    setSelectedId(n.id);
    setResult(null);
  }, [inputs.nodes, patch]);

  const addJunction = useCallback(() => {
    const n = defaultJunction(`Manifold ${inputs.nodes.filter((x) => x.kind === 'junction').length + 1}`);
    patch((prev) => ({ ...prev, nodes: [...prev.nodes, n] }));
    setSelectedId(n.id);
    setResult(null);
  }, [inputs.nodes, patch]);

  const addBranch = useCallback((from, to) => {
    if (!from || !to || from === to) return;
    const a = inputs.nodes.find((n) => n.id === from);
    const b = inputs.nodes.find((n) => n.id === to);
    patch((prev) => ({
      ...prev,
      branches: [...prev.branches, defaultBranch(from, to, `${a?.label || '?'} to ${b?.label || '?'}`)],
    }));
    setResult(null);
  }, [inputs.nodes, patch]);

  const removeNode = useCallback((id) => {
    patch((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      branches: prev.branches.filter((b) => b.from !== id && b.to !== id),
    }));
    setSelectedId(null);
    setResult(null);
  }, [patch]);

  const removeBranch = useCallback((id) => {
    patch((prev) => ({ ...prev, branches: prev.branches.filter((b) => b.id !== id) }));
    setResult(null);
  }, [patch]);

  // --- live derivations (cheap only) ---
  const wellModels = useMemo(() => {
    const out = {};
    inputs.nodes.filter((n) => n.kind === 'well').forEach((n) => {
      try {
        out[n.id] = buildWellModel(n.model);
      } catch (e) {
        console.error(e);
        out[n.id] = null;
      }
    });
    return out;
  }, [inputs.nodes]);

  /**
   * Topology validity, live. Runs the engine's own validator so the
   * message a user sees while drawing is the same one the solve would
   * have given, rather than a second opinion written for the UI.
   */
  const topology = useMemo(() => buildNetwork({
    nodes: inputs.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      pressurePsia: n.kind === 'sink' ? num(n.pressurePsia, NaN) : undefined,
    })),
    branches: inputs.branches.map((b) => ({ id: b.id, from: b.from, to: b.to, label: b.label })),
  }), [inputs.nodes, inputs.branches]);

  const wellProblems = useMemo(() => inputs.nodes
    .filter((n) => n.kind === 'well')
    .map((n) => ({ id: n.id, label: n.label, problems: wellModelProblems(n.model) }))
    .filter((r) => r.problems.length), [inputs.nodes]);

  const canRun = topology.ok && wellProblems.length === 0;

  /** The auto layout: depth from the delivery point, so it lays itself out. */
  const layout = useMemo(() => {
    if (!topology.ok) return null;
    const depth = new Map(topology.sinkIds.map((id) => [id, 0]));
    const queue = [...topology.sinkIds];
    while (queue.length) {
      const id = queue.shift();
      for (const link of topology.adjacency.get(id)) {
        if (!depth.has(link.other)) {
          depth.set(link.other, depth.get(id) + 1);
          queue.push(link.other);
        }
      }
    }
    const maxDepth = Math.max(...depth.values(), 1);
    const columns = new Map();
    for (const [id, d] of depth) {
      const col = maxDepth - d;
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col).push(id);
    }
    const positions = {};
    for (const [col, ids] of columns) {
      ids.forEach((id, i) => {
        positions[id] = { col, row: i, rows: ids.length };
      });
    }
    return { positions, columns: maxDepth + 1, depth };
  }, [topology]);

  // --- the explicit runs ---
  const runSignature = useMemo(() => JSON.stringify(inputs), [inputs]);
  const resultStale = !!result && result.signature !== runSignature;
  const sweepStale = !!sweep && sweep.signature !== runSignature;

  const solve = useCallback(async () => {
    if (!canRun) {
      addNotification(topology.ok
        ? 'Some wells are not fully described yet. Open each one and fill in what is missing.'
        : topology.error, 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Sampling every well and every line, then solving the network...');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const r = runNetwork({ inputs: analysisInputsFrom(inputs), wellModels });
      if (!r.ok) {
        addNotification(r.errors.join(' '), 'error');
        setResult(null);
        return;
      }
      setResult({ ...r, signature: runSignature });
      const lost = r.totals.qoAloneStbd - r.totals.qoStbd;
      addNotification(
        lost > 0
          ? `The field makes ${Math.round(r.totals.qoStbd).toLocaleString()} stb/d. Run one at a time against the same separator, these wells would make ${Math.round(r.totals.qoAloneStbd).toLocaleString()}; the ${Math.round(lost).toLocaleString()} stb/d difference is what they cost each other.`
          : `The field makes ${Math.round(r.totals.qoStbd).toLocaleString()} stb/d.`,
        'success',
      );
      r.warnings.forEach((w) => addNotification(w, 'info'));
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [canRun, topology, inputs, wellModels, runSignature, addNotification]);

  const runSweep = useCallback(async () => {
    if (!canRun) {
      addNotification('Fix the network before sweeping it.', 'error');
      return;
    }
    setIsRunning(true);
    setBusyMessage('Solving the whole network at each separator pressure...');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const lo = num(inputs.sweep.minPsia, 80);
      const hi = num(inputs.sweep.maxPsia, 400);
      const n = Math.max(3, Math.round(num(inputs.sweep.points, 8)));
      const list = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
      const s = deliverySweep({
        inputs: analysisInputsFrom(inputs), wellModels, pressures: list,
      });
      if (!s.ok) { addNotification(s.error, 'error'); return; }
      setSweep({ ...s, signature: runSignature });
      const usable = s.points.filter((p) => p.ok);
      if (usable.length > 1) {
        const best = s.slope[0];
        addNotification(
          `Around ${Math.round(best.deliveryPsia)} psia the field gains about ${best.stbdPerPsi.toFixed(1)} stb/d for every psi the separator comes down. That is not a constant: it steepens wherever a well comes back on.`,
          'info',
        );
      }
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setIsRunning(false);
      setBusyMessage(null);
    }
  }, [canRun, inputs, wellModels, runSignature, addNotification]);

  // --- the spine: this is the studio P6.5 was built for ---
  const reloadFields = useCallback(async () => {
    try { setFields(await spine.listFields()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { reloadFields(); }, [reloadFields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inputs.link.fieldId) { setSpineWells([]); return; }
      try {
        const w = await spine.listPoWells(inputs.link.fieldId);
        if (!cancelled) setSpineWells(w);
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [inputs.link.fieldId]);

  /** Pull one well's shared record onto a node. */
  const loadWellFromSpine = useCallback(async (nodeId, spineWellId) => {
    const well = spineWells.find((w) => w.id === spineWellId);
    if (!well) return;
    setBusyMessage(`Loading ${well.name}...`);
    try {
      const row = await spine.getWellModel(spineWellId);
      if (!row?.model_data) {
        addNotification(
          `${well.name} has no shared well record yet. Describe it in any of the well studios and save it to the spine, and it will turn up here.`,
          'info',
        );
        setNode(nodeId, 'spineWellId', spineWellId);
        setNode(nodeId, 'label', well.name);
        return;
      }
      const restored = fromWellModelPayload(row.model_data, defaultWellInputs());
      patch((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId
          ? { ...n, spineWellId, label: well.name, model: restored }
          : n)),
      }));
      setResult(null);
      addNotification(`${well.name} loaded from the shared record.`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [spineWells, patch, setNode, addNotification]);

  /** Pull EVERY well on the field in at once, each on its own flowline. */
  const buildFromField = useCallback(async () => {
    if (!inputs.link.fieldId) {
      addNotification('Pick a field first.', 'info');
      return;
    }
    setBusyMessage('Reading the shared well records...');
    try {
      const rows = await Promise.all(spineWells.map(async (w) => {
        try {
          const row = await spine.getWellModel(w.id);
          return { well: w, model: row?.model_data ? fromWellModelPayload(row.model_data, defaultWellInputs()) : null };
        } catch (e) {
          console.error(e);
          return { well: w, model: null };
        }
      }));
      const described = rows.filter((r) => r.model);
      if (!described.length) {
        addNotification(
          'None of the wells on this field has a shared well record yet. Describe them in the well studios and save each to the spine; this studio is built to consume them.',
          'info',
        );
        return;
      }
      const header = defaultJunction('Header');
      const sink = defaultSink('Separator');
      const nodes = [];
      const branches = [];
      described.forEach((r, i) => {
        const node = defaultWellNode(r.well.name, { spineWellId: r.well.id, model: r.model });
        nodes.push(node);
        branches.push(defaultBranch(node.id, header.id, `${r.well.name} flowline`, {
          lengthFt: String(2000 + i * 400), npsPick: '3', idIn: '3.068',
        }));
      });
      branches.push(defaultBranch(header.id, sink.id, 'Trunk line', {
        lengthFt: '12000', npsPick: '6', idIn: '6.065',
      }));
      patch((prev) => ({ ...prev, nodes: [...nodes, header, sink], branches }));
      setResult(null);
      setSweep(null);
      // Name the wells that were left out rather than counting them. A
      // count tells a user something is missing; a name tells them
      // which studio to go and open.
      const skipped = rows.filter((r) => !r.model).map((r) => r.well.name);
      addNotification(
        `${described.length} well${described.length === 1 ? '' : 's'} pulled onto a header${
          skipped.length
            ? `. Left out for having no shared well record: ${skipped.join(', ')}. Describe ${skipped.length === 1 ? 'it' : 'them'} in any of the well studios and save to the spine, and ${skipped.length === 1 ? 'it' : 'they'} will turn up here.`
            : '.'
        } Set the line lengths and sizes, then solve.`,
        'success',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setBusyMessage(null);
    }
  }, [inputs.link.fieldId, spineWells, patch, addNotification]);

  // --- project lifecycle (the studio-kit recipe) ---
  const serialize = useCallback((name) => ({
    id: currentProjectId, name, schema: 1, inputs, modified: new Date().toISOString(),
  }), [currentProjectId, inputs]);

  useEffect(() => {
    (async () => {
      try { setProjects(await service.list()); } catch (e) {
        console.error(e);
        addNotification(friendlyError(e), 'error');
      }
    })();
  }, [addNotification]);

  const createProject = useCallback(async (name) => {
    const id = uuidv4();
    try {
      await service.save(id, { id, name, schema: 1, inputs, modified: new Date().toISOString() });
      setCurrentProjectId(id);
      setProjectName(name);
      setHydrated(true);
      setLastSaveTime(new Date());
      setSaveError(null);
      setProjects(await service.list());
      addNotification(`Network "${name}" created`, 'success');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [inputs, addNotification]);

  const openProject = useCallback(async (id) => {
    try {
      const payload = await service.load(id);
      const restored = inputsFromPayload(payload);
      if (!restored) { addNotification('Network not found', 'error'); return; }
      setCurrentProjectId(id);
      setProjectName(payload.name || projects.find((p) => p.id === id)?.name || 'Untitled network');
      setInputs(restored);
      setResult(null);
      setSweep(null);
      setSelectedId(null);
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
      addNotification('Network deleted', 'info');
    } catch (e) {
      console.error(e);
      addNotification(friendlyError(e), 'error');
    }
  }, [currentProjectId, addNotification]);

  const manualSave = useCallback(async () => {
    if (!currentProjectId) { addNotification('Create or open a network first', 'info'); return; }
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
    setNode,
    setNodeModel,
    setNodeDuty,
    setBranch,
    applySchedule,
    addWell,
    addJunction,
    addBranch,
    removeNode,
    removeBranch,
    patchLink: (p) => patch((prev) => ({ ...prev, link: { ...prev.link, ...p } })),
    setSweepInput: (k, v) => patch((prev) => ({ ...prev, sweep: { ...prev.sweep, [k]: v } })),
    selectedId,
    setSelectedId,
    pipeSchedule: PIPE_SCHEDULE,
    roughnessOptions: ROUGHNESS_IN,
    grades: LINE_PIPE_GRADES,
    barlowPressurePsi,
    // live
    wellModels,
    topology,
    wellProblems,
    canRun,
    layout,
    // explicit
    result,
    resultStale,
    solve,
    sweep,
    sweepStale,
    runSweep,
    isRunning,
    busyMessage,
    // spine
    fields,
    spineWells,
    loadWellFromSpine,
    buildFromField,
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
    notifications,
    addNotification,
    removeNotification,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};
