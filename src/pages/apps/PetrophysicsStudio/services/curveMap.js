// Standard pipeline inputs <- registry mnemonics (Petrophysics Studio,
// extracted from PetroWorkstation at PS7 so the curves cache and the
// field view share one alias table). Base name matching; ':n'
// duplicate suffixes ignored; first match wins.

export const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD'],
  GR: ['GR', 'SGR', 'CGR', 'GRC'],
  RHOB: ['RHOB', 'DEN', 'ZDEN'],
  NPHI: ['NPHI', 'TNPH', 'CNC', 'NPOR'],
  DT: ['DT', 'DTC', 'AC', 'DTCO'],
  RT: ['RT', 'RES', 'ILD', 'LLD', 'RDEP', 'RD'],
  // PS8 conditioning inputs (never consumed by the pipeline math;
  // CAL/DRHO drive bad-hole flagging, PEF is charted/quicklooked)
  CAL: ['CAL', 'CALI', 'HCAL', 'CALX'],
  DRHO: ['DRHO', 'ZCOR', 'HDRA'],
  PEF: ['PEF', 'PE', 'PEFZ'],
};

const base = (mnemonic) => mnemonic.toUpperCase().split(':')[0];

/** All logs that could serve as this input: alias matches plus this
 *  app's own conditioned outputs (KEY_CND). The EXPLICIT picker rule:
 *  a conditioned curve is never substituted silently — the user
 *  selects it in the explorer. */
export function candidatesFor(key, logs) {
  const aliases = CURVE_ALIASES[key] || [];
  return logs.filter((log) => {
    const b = base(log.mnemonic);
    return aliases.includes(b) || b === `${key}_CND`;
  });
}

export function mapLogs(logs) {
  const byBase = new Map();
  for (const log of logs) {
    const base = log.mnemonic.toUpperCase().split(':')[0];
    if (!byBase.has(base)) byBase.set(base, log);
  }
  const mapped = {};
  for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
    const hit = aliases.find((a) => byBase.has(a));
    mapped[key] = hit ? byBase.get(hit) : null;
  }
  return mapped;
}
