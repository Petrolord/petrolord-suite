// gm-1.0.0 publish contract (the pp-1.0.0 pattern verbatim, engine
// 'geomechanics-studio'): SHMIN / SHMAX / UCS as Float32 MPa curves on the
// profile grid, with the overwrite-own provenance filter. Pure; the
// backends apply staleOwnCurves + saveLogs.

export const GM_PIPELINE_VERSION = 'gm-1.0.0';
export const GM_ENGINE_NAME = 'geomechanics-studio';

const MPA = 1e6;

const SPECS = [
  { mnemonic: 'SHMIN', key: 'shminPa', description: (p) => `Minimum horizontal stress (poroelastic, nu=${p.nu ?? 0.25}, regime ${p.regime ?? 'NF'})` },
  { mnemonic: 'SHMAX', key: 'shmaxPa', description: (p) => `Maximum horizontal stress (poroelastic, nu=${p.nu ?? 0.25}, regime ${p.regime ?? 'NF'})` },
  { mnemonic: 'UCS', key: 'ucsPa', description: (p) => `Unconfined compressive strength (${p.ucs?.correlation ?? 'horsrud'})` },
];

export function preparePublishLogs({ profile, params, meta = {} }) {
  const { tvdM } = profile;
  if (!tvdM?.length) throw new Error('Nothing to publish: empty profile.');
  const stepM = tvdM.length > 1 ? tvdM[1] - tvdM[0] : null;
  return SPECS.map((spec) => {
    const src = profile[spec.key];
    const data = new Float32Array(tvdM.length);
    let nullCount = 0;
    for (let i = 0; i < tvdM.length; i += 1) {
      const v = src[i];
      if (v == null || !Number.isFinite(v)) {
        data[i] = NaN;
        nullCount += 1;
      } else {
        data[i] = v / MPA;
      }
    }
    return {
      mnemonic: spec.mnemonic,
      description: spec.description(params || {}),
      unit: 'MPA',
      data,
      startMdM: tvdM[0],
      stopMdM: tvdM[tvdM.length - 1],
      stepM,
      nSamples: tvdM.length,
      nullCount,
      provenance: {
        computed: true,
        engine: GM_ENGINE_NAME,
        pipeline_version: GM_PIPELINE_VERSION,
        project_id: meta.projectId ?? null,
        params: { ...(params || {}) },
        input_log_ids: meta.inputLogIds || [],
      },
    };
  });
}

// Overwrite-own filter: delete an existing log only when it is computed, by
// THIS engine, for THIS case, and its mnemonic is being republished.
export function staleOwnCurves(existingLogs, preparedLogs, projectId) {
  const mnemonics = new Set(preparedLogs.map((l) => l.mnemonic));
  return (existingLogs || []).filter((log) => log.provenance?.computed === true
    && log.provenance?.engine === GM_ENGINE_NAME
    && log.provenance?.project_id === projectId
    && mnemonics.has(log.mnemonic));
}
