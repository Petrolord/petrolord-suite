// Publish preparation (P4, plan Q4): the computed prognosis becomes
// geo_wells_logs curves — PP / FP / OBG in MPa (f32) with full
// provenance, the Petrophysics Studio publish shape. Overwrite-own
// contract lives in the backends: republishing replaces only this
// engine's curves for the same well + mnemonic + project; imported
// LAS curves and other projects' results are untouchable.

export const PIPELINE_VERSION = 'pp-1.0.0';

const MPA = 1e6;

const SPECS = [
  { mnemonic: 'PP', key: 'porePressurePa', description: (p) => `Pore pressure (${p.method}${p.method === 'eaton' ? ` n=${p.eatonN}` : ''})` },
  { mnemonic: 'FP', key: 'fracPressurePa', description: (p) => `Fracture pressure (K from nu=${p.nu})` },
  { mnemonic: 'OBG', key: 'overburdenPa', description: () => 'Overburden stress (density integration)' },
];

/**
 * @param {{zBmlM: number[]}} input - the engine input actually used
 * @param {object} result - computeProfile output
 * @param {object} params - the workstation params (mudlineMdM converts
 *   the below-mudline grid back to registry MD)
 * @param {{projectId: string, inputLogIds: string[]}} meta
 */
export function preparePublishLogs(input, result, params, meta) {
  const { zBmlM } = input;
  const mudline = params.mudlineMdM ?? 0;
  const step = zBmlM.length > 1 ? zBmlM[1] - zBmlM[0] : null;
  return SPECS.map((spec) => {
    const src = result[spec.key];
    const data = new Float32Array(src.length);
    let nullCount = 0;
    for (let i = 0; i < src.length; i++) {
      data[i] = src[i] / MPA;
      if (!Number.isFinite(src[i])) nullCount += 1;
    }
    return {
      mnemonic: spec.mnemonic,
      description: spec.description(params),
      unit: 'MPA',
      data,
      startMdM: zBmlM[0] + mudline,
      stopMdM: zBmlM[zBmlM.length - 1] + mudline,
      stepM: step,
      nSamples: data.length,
      nullCount,
      provenance: {
        computed: true,
        engine: 'pore-pressure-studio',
        pipeline_version: PIPELINE_VERSION,
        project_id: meta.projectId,
        params: { ...params },
        input_log_ids: meta.inputLogIds || [],
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
