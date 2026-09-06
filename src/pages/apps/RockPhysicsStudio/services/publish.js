// Publish preparation (RP1, 2026-09-06): the fluid-substituted case
// becomes geo_wells_logs curves on the well, VP_SUB / VS_SUB / RHOB_SUB
// over the whole depth grid (the in-situ value outside the zone, the
// substituted value inside), SI units (m/s, kg/m3) like the Pore
// Pressure Studio publish (MPa), full provenance, overwrite-own: a
// republish replaces only this engine's curves for the same well and
// project. Pure; the backends do the I/O.

export const PIPELINE_VERSION = 'rp-1.0.0';
export const ENGINE = 'rock-physics-studio';

const SPECS = [
  { mnemonic: 'VP_SUB', key: 'vp', unit: 'M/S', what: 'P velocity' },
  { mnemonic: 'VS_SUB', key: 'vs', unit: 'M/S', what: 'S velocity' },
  { mnemonic: 'RHOB_SUB', key: 'rho', unit: 'KG/M3', what: 'Bulk density' },
];

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
    const src = model[spec.key];
    const alt = sub[spec.key];
    const data = new Float32Array(n);
    let nullCount = 0;
    for (let i = 0; i < n; i++) {
      const v = inZone[i] && Number.isFinite(alt[i]) ? alt[i] : src[i];
      data[i] = Number.isFinite(v) ? v : NaN;
      if (!Number.isFinite(v)) nullCount += 1;
    }
    return {
      mnemonic: spec.mnemonic,
      description: `${spec.what}, Gassmann ${label} in ${zone.name}${spec.key === 'vs' && model.vsSource === 'estimated' ? ' (Vs estimated, Greenberg-Castagna)' : ''}`,
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
        vs_source: model.vsSource || 'measured',
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
