// Publish preparation (P4, plan Q4): the computed prognosis becomes
// geo_wells_logs curves — PP / FP / OBG in MPa (f32) with full
// provenance, the Petrophysics Studio publish shape. Overwrite-own
// contract lives in the backends: republishing replaces only this
// engine's curves for the same well + mnemonic + project; imported
// LAS curves and other projects' results are untouchable.
//
// PP-U1-001 (2026-10-01): curves are written on the registry MD grid of
// the samples actually computed. Before, the below-mudline depths were
// written as start + i x step, so every DT gap (dropped with its depth)
// moved all deeper values up by the gap: a 200 m gap put the 3,700 m
// pressure at 3,500 m MD with nothing said. Gaps are now nulls at their
// own MD. Pipeline pp-1.1.0 also records the depth reference (TVD from
// the survey or vertical, mudline MD, water depth); readers accept any
// pp-1.x curve.

export const PIPELINE_VERSION = 'pp-1.1.0';
/** Readers accept every curve of this pipeline major version. */
export const PIPELINE_MAJOR = /^pp-1\./;

const MPA = 1e6;

const SPECS = [
  { mnemonic: 'PP', key: 'porePressurePa', description: (p) => `Pore pressure (${p.method}${p.method === 'eaton' ? ` n=${p.eatonN}` : p.method === 'eaton-resistivity' ? ` n=${p.eatonNRes ?? 1.2}` : ''})` },
  { mnemonic: 'FP', key: 'fracPressurePa', description: (p) => (p.fracMethod === 'matthews-kelly' ? `Fracture pressure (Matthews and Kelly k0=${p.k0 ?? 0.75})` : p.fracMethod === 'daines' ? `Fracture pressure (Daines nu=${p.nu} beta=${p.beta ?? 0})` : `Fracture pressure (K from nu=${p.nu})`) },
  { mnemonic: 'OBG', key: 'overburdenPa', description: () => 'Overburden stress (density integration)' },
];

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
}

/**
 * The uniform MD grid the curves are written on and, per grid node, the
 * computed sample index it carries (or -1 for a gap). The step is the
 * typical sample spacing; a node takes the sample within a hundredth of a
 * step of it, so a regular log with gaps keeps every value exactly at its
 * own MD and the gaps become nulls.
 * @param {number[]} mdM MD of each computed sample, increasing
 */
export function mdGrid(mdM) {
  const n = mdM.length;
  if (n === 1) return { startMdM: mdM[0], stepM: null, index: [0] };
  const diffs = [];
  for (let i = 1; i < n; i++) { const d = mdM[i] - mdM[i - 1]; if (d > 0) diffs.push(d); }
  const step = median(diffs);
  const start = mdM[0];
  const count = Math.round((mdM[n - 1] - start) / step) + 1;
  const index = new Array(count).fill(-1);
  const tol = 0.01 * step;
  for (let i = 0; i < n; i++) {
    const k = Math.round((mdM[i] - start) / step);
    if (k >= 0 && k < count && Math.abs(mdM[i] - (start + k * step)) <= tol && index[k] < 0) index[k] = i;
  }
  return { startMdM: start, stepM: step, index };
}

/**
 * @param {{zBmlM: number[], mdM?: number[], tvdFrom?: string}} input - the engine input actually used
 * @param {object} result - computeProfile output
 * @param {object} params - the workstation params (mudlineMdM converts
 *   the below-mudline grid back to registry MD when the input has no MD)
 * @param {{projectId: string, inputLogIds: string[]}} meta
 */
export function preparePublishLogs(input, result, params, meta) {
  const { zBmlM } = input;
  const mudline = params.mudlineMdM ?? 0;
  const mdM = input.mdM || zBmlM.map((z) => z + mudline);
  const grid = mdGrid(mdM);
  const count = grid.index.length;
  return SPECS.map((spec) => {
    const src = result[spec.key];
    const data = new Float32Array(count);
    let nullCount = 0;
    for (let k = 0; k < count; k++) {
      const i = grid.index[k];
      const v = i >= 0 ? src[i] : NaN;
      data[k] = Number.isFinite(v) ? v / MPA : NaN;
      if (!Number.isFinite(v)) nullCount += 1;
    }
    return {
      mnemonic: spec.mnemonic,
      description: spec.description(params),
      unit: 'MPA',
      data,
      startMdM: grid.startMdM,
      stopMdM: grid.stepM ? grid.startMdM + (count - 1) * grid.stepM : grid.startMdM,
      stepM: grid.stepM,
      nSamples: count,
      nullCount,
      provenance: {
        computed: true,
        engine: 'pore-pressure-studio',
        pipeline_version: PIPELINE_VERSION,
        project_id: meta.projectId,
        params: { ...params },
        input_log_ids: meta.inputLogIds || [],
        depth_reference: {
          index: 'MD below RKB',
          tvd_from: input.tvdFrom || 'vertical',
          mudline_md_m: mudline,
          water_depth_m: params.waterDepthM ?? null,
          pressure: 'gauge, sea level and pore fluid column',
        },
      },
    };
  });
}

/** The overwrite-own filter both backends apply before saving. */
export function staleOwnCurves(existingLogs, preparedLogs, projectId) {
  const mnemonics = new Set(preparedLogs.map((l) => l.mnemonic));
  return existingLogs.filter((l) => l.provenance?.computed
    && l.provenance?.engine === 'pore-pressure-studio'
    && l.provenance?.project_id === projectId
    && mnemonics.has(l.mnemonic));
}

/**
 * PP-U1-003: why the curves cannot be published as they stand, or null.
 * An offshore well's registry MD is measured from the rotary table, so the
 * mudline sits at the air gap plus the water depth; with the mudline MD
 * left shallower than the water depth the log MD is read as depth below
 * mudline, the water column is added on top, and the published curves
 * would land shallower than the depths they were computed for.
 */
export function publishBlocker(params, { source = 'well', fmt = (m) => `${m} m` } = {}) {
  if (source !== 'well') return 'Only a well prognosis can be published (a velocity trend has no well to publish to).';
  const wd = Number(params?.waterDepthM) || 0;
  const ml = Number(params?.mudlineMdM) || 0;
  if (wd > 0 && ml < wd) {
    return `Set the mudline MD in Parameters first: with ${fmt(wd)} of water the mudline sits at least ${fmt(wd)} below the rotary table (air gap plus water depth), and the mudline MD is ${fmt(ml)}, so the log depths would be read from the wrong datum.`;
  }
  return null;
}
