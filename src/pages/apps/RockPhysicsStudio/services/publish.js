// Publish preparation (RP1, 2026-09-06): the fluid-substituted case
// becomes geo_wells_logs curves on the well, VP_SUB / VS_SUB / RHOB_SUB
// over the whole depth grid (the in-situ value outside the zone, the
// substituted value inside), SI units (m/s, kg/m3) like the Pore
// Pressure Studio publish (MPa), full provenance, overwrite-own: a
// republish replaces only this engine's curves for the same well and
// project. Pure; the backends do the I/O.

// rp-1.1.0 (RP-U1, 2026-10-01): DT_SUB added (us/m, so Seismolord's
// synthetics list it as a sonic); provenance carries the porosity basis,
// the Sw source, the K_min source and the Gassmann limits
// rp-1.2.0 (RP-U2, 2026-10-01): vp_source / vp_method say when the sonic
// itself is an estimate; DT_EST publishes the pseudo-sonic as its own curve
export const PIPELINE_VERSION = 'rp-1.2.0';
export const ENGINE = 'rock-physics-studio';

const SPECS = [
  { mnemonic: 'VP_SUB', key: 'vp', unit: 'M/S', what: 'P velocity' },
  { mnemonic: 'VS_SUB', key: 'vs', unit: 'M/S', what: 'S velocity' },
  { mnemonic: 'RHOB_SUB', key: 'rho', unit: 'KG/M3', what: 'Bulk density' },
  { mnemonic: 'DT_SUB', key: 'dt', unit: 'US/M', what: 'Compressional slowness' },
];
const slowness = (vp) => (Number.isFinite(vp) && vp > 0 ? 1e6 / vp : NaN);

/**
 * @param {{depth: ArrayLike<number>, vp, vs, rho, vsSource?: string}} model the well model (SI)
 * @param {{vp, vs, rho, done: number}} sub substituteInterval output (SI, zone samples filled)
 * @param {number[]} indices the zone's sample indices
 * @param {{name: string, top_md_m: number, base_md_m: number}} zone
 * @param {{scenario: object, rock: object, kmin: number, projectId?: string|null, inputLogIds?: string[]}} meta
 */
export function preparePublishLogs(model, sub, indices, zone, meta) {
  if (!model?.depth?.length) throw new Error('Load a well first.');
  if (!indices?.length) throw new Error('The zone has no samples to publish.');
  const n = model.depth.length;
  const inZone = new Uint8Array(n);
  for (const i of indices) inZone[i] = 1;
  const step = n > 1 ? model.depth[1] - model.depth[0] : null;
  const fluidA = meta.scenario?.fluidA; const fluidB = meta.scenario?.fluidB;
  const label = `${describeFluid(fluidA)} to ${describeFluid(fluidB)}`;
  return SPECS.map((spec) => {
    const isDt = spec.key === 'dt';
    const src = isDt ? model.vp : model[spec.key];
    const alt = isDt ? sub.vp : sub[spec.key];
    const data = new Float32Array(n);
    let nullCount = 0;
    for (let i = 0; i < n; i++) {
      const raw = inZone[i] && Number.isFinite(alt[i]) ? alt[i] : src[i];
      const v = isDt ? slowness(raw) : raw;
      data[i] = Number.isFinite(v) ? v : NaN;
      if (!Number.isFinite(v)) nullCount += 1;
    }
    return {
      mnemonic: spec.mnemonic,
      description: `${spec.what}, Gassmann ${label} in ${zone.name}${model.vpSource === 'estimated' && spec.key !== 'rho' ? ` (from an ESTIMATED sonic: ${model.vpNote})` : ''}${spec.key === 'vs' && model.vsSource === 'estimated' ? ` (Vs estimated, Greenberg-Castagna${model.vsMethod === 'iterative' ? ', iterated through brine in hydrocarbon samples' : ''})` : ''}`,
      unit: spec.unit,
      data,
      startMdM: model.depth[0],
      stopMdM: model.depth[n - 1],
      stepM: step,
      nSamples: n,
      nullCount,
      provenance: {
        computed: true,
        engine: ENGINE,
        pipeline_version: PIPELINE_VERSION,
        project_id: meta.projectId || null,
        zone: { name: zone.name, top_md_m: zone.top_md_m, base_md_m: zone.base_md_m, samples: indices.length },
        scenario: meta.scenario || null,
        rock: meta.rock || null,
        kmin_pa: meta.kmin ?? null,
        vp_source: model.vpSource || 'measured',
        vp_method: model.vpSource === 'estimated' ? model.vpMethod : null,
        vp_note: model.vpSource === 'estimated' ? model.vpNote : null,
        vs_source: model.vsSource || 'measured',
        vs_method: model.vsSource === 'estimated' ? (model.vsMethod === 'iterative' ? 'greenberg-castagna-iterative' : 'greenberg-castagna') : null,
        vs_iterated_samples: model.vsIter?.applied || 0,
        fluids: label,
        phi_basis: sub.phiBasis || (model.phi ? (model.phiBasis || 'effective') : 'constant'),
        phi_curve: model.phiCurve || null,
        sw_from_log: !!sub.swFromLog,
        sw_b_from_saturation_height: !!sub.swBFromShm,
        pore_pressure_source: meta.scenario?.conditions?.pSource || null,
        kmin_source: sub.kminSource || 'table',
        kmin_minerals: sub.mineralKeys || null,
        limits: { vsh_max: meta.rock?.vshMax ?? null, phi_min: meta.rock?.phiMin ?? null },
        samples_left_in_situ: sub.outside || 0,
        input_log_ids: meta.inputLogIds || [],
      },
    };
  });
}

const HC_NAMES = { gas: 'gas', 'oil-dead': 'dead oil', 'oil-live': 'live oil' };

/** "100% brine", "20% brine + 80% gas": the scenario side in words. */
export function describeFluid(side) {
  if (!side) return '?';
  const parts = [];
  if (side.sw > 0) parts.push(`${Math.round(side.sw * 100)}% brine`);
  if (side.sw < 1) {
    const kind = typeof side.hc === 'string' ? side.hc : side.hc?.kind;
    parts.push(`${Math.round((1 - side.sw) * 100)}% ${HC_NAMES[kind] || kind || 'hydrocarbon'}`);
  }
  return parts.join(' + ') || 'fluid';
}

/** The overwrite-own filter both backends apply before saving. */
export function staleOwnCurves(existingLogs, preparedLogs, projectId) {
  const mnemonics = new Set(preparedLogs.map((l) => l.mnemonic));
  return existingLogs.filter((l) => l.provenance?.computed
    && l.provenance?.engine === ENGINE
    && (l.provenance?.project_id || null) === (projectId || null)
    && mnemonics.has(l.mnemonic));
}

export const ESTIMATED_SONIC_MNEMONIC = 'DT_EST';

/**
 * The pseudo-sonic as a curve other apps can list (U2-007): DT_EST in
 * us/m over the well's depth grid, described as an estimate, with the
 * method, its constants and any calibration in the provenance. Overwrite
 * own, like the substituted curves.
 * @param {Object} model a model whose vpSource is 'estimated'
 * @param {{projectId?: ?string, inputLogIds?: string[]}} meta
 */
export function prepareEstimatedSonicLog(model, meta = {}) {
  if (!model?.depth?.length) throw new Error('Load a well first.');
  if (model.vpSource !== 'estimated') throw new Error('This well has a sonic log; there is no estimated sonic to publish.');
  const n = model.depth.length;
  const data = new Float32Array(n);
  let nullCount = 0;
  for (let i = 0; i < n; i++) {
    const v = slowness(model.vp[i]);
    data[i] = Number.isFinite(v) ? v : NaN;
    if (!Number.isFinite(v)) nullCount += 1;
  }
  if (nullCount === n) throw new Error('The estimate has no values to publish.');
  const p = model.pseudo || {};
  return {
    mnemonic: ESTIMATED_SONIC_MNEMONIC,
    description: `ESTIMATED compressional slowness (no sonic log): ${model.vpNote}`,
    unit: 'US/M',
    data,
    startMdM: model.depth[0],
    stopMdM: model.depth[n - 1],
    stepM: n > 1 ? model.depth[1] - model.depth[0] : null,
    nSamples: n,
    nullCount,
    provenance: {
      computed: true,
      estimated: true,
      engine: ENGINE,
      pipeline_version: PIPELINE_VERSION,
      project_id: meta.projectId || null,
      method: model.vpMethod,
      note: model.vpNote,
      constants: model.vpMethod === 'faust' ? { faust_gamma: p.faustGamma } : { gardner_a: p.gardnerA, gardner_b: 0.25 },
      calibrated_on: p.calibratedOn || null,
      input_log_ids: meta.inputLogIds || [],
    },
  };
}
