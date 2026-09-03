// Standard pipeline inputs <- registry mnemonics (Petrophysics Studio,
// extracted from PetroWorkstation at PS7 so the curves cache and the
// field view share one alias table). Base name matching; ':n'
// duplicate suffixes ignored; first match wins.
//
// 2026-09-03 (owner finding): service companies name the same
// measurement many ways (resistivity alone: RES, RESD, ILD, LLD, RLA5,
// AT90, A34H, P40H, ...). The alias table below is deliberately wide,
// and candidatesFor also offers curves whose LAS DESCRIPTION names the
// measurement, so the explorer picker can bind any of them explicitly.
// Auto-mapping (mapLogs) still uses aliases only: a description match is
// a suggestion the user confirms, never a silent substitution. Curves
// that map to no input are still displayable: layouts address them as
// `log:<MNEMONIC>` (layout/layoutSchema.js).

export const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD', 'DEPTH_MD', 'MDEPTH'],
  GR: ['GR', 'SGR', 'CGR', 'GRC', 'GRD', 'GRS', 'ECGR', 'HSGR', 'HCGR', 'GRR', 'GAM', 'GAMM', 'GRGC', 'GR_EDTC', 'GRTO'],
  RHOB: ['RHOB', 'DEN', 'ZDEN', 'RHOZ', 'DENS', 'ROBB', 'RHO8', 'RHOM', 'ALCDLC', 'BDCFM', 'DENB', 'DENC', 'RHOB_HR'],
  NPHI: ['NPHI', 'TNPH', 'CNC', 'NPOR', 'NPHL', 'NPHS', 'APLC', 'HNPO', 'NEUT', 'TNPL', 'CN', 'NPRL', 'CNCF', 'NPHI_LS', 'PHIN'],
  DT: ['DT', 'DTC', 'AC', 'DTCO', 'DT24', 'DTL', 'DTLN', 'DTLF', 'DT4P', 'DTP', 'DTCM', 'SONIC'],
  RT: [
    'RT', 'RES', 'RESD', 'RDEP', 'RD', 'ILD', 'LLD', 'RLLD', 'HLLD', 'HDRS', 'RT_HRLT', 'RT90', 'RESDEEP',
    'RLA5', 'RLA4', 'RLA3', 'AT90', 'AT60', 'AT30', 'AF90', 'AF60', 'AF30', 'AHT90', 'AHT60', 'AHF90',
    'A16H', 'A22H', 'A28H', 'A34H', 'A40H', 'P16H', 'P22H', 'P28H', 'P34H', 'P40H',
    'RACEHM', 'RACELM', 'RPCEHM', 'RPCELM', 'M2R9', 'M2R6', 'M2R3', 'M2RX', 'RTHM', 'RTLM', 'RXO_D', 'RLL3', 'RILD',
  ],
  // PS8 conditioning inputs (never consumed by the pipeline math;
  // CAL/DRHO drive bad-hole flagging, PEF is charted/quicklooked)
  CAL: ['CAL', 'CALI', 'HCAL', 'CALX', 'CALY', 'CALS', 'CLDC', 'DCAL', 'HCALI', 'CALD', 'CADE'],
  DRHO: ['DRHO', 'ZCOR', 'HDRA', 'DCOR', 'DRHO_HR', 'RHOC'],
  PEF: ['PEF', 'PE', 'PEFZ', 'PEDN', 'PEF8', 'PEFL', 'PEFA'],
};

/** Description keywords that make a curve a CANDIDATE for an input
 *  (picker only; never auto-mapped). */
export const DESCRIPTION_HINTS = {
  GR: /GAMMA/i,
  RHOB: /BULK\s*DENS|DENSITY(?!\s*CORR)/i,
  NPHI: /NEUTRON/i,
  DT: /SONIC|SLOWNESS|TRANSIT|COMPRESSIONAL/i,
  RT: /RESIST|LATEROLOG|INDUCTION|ATTENUATION\s*RESIST|PHASE\s*RESIST/i,
  CAL: /CALIPER/i,
  DRHO: /DENSITY\s*CORR/i,
  PEF: /PHOTOELECTRIC|PHOTO-ELECTRIC/i,
};

const base = (mnemonic) => String(mnemonic || '').toUpperCase().split(':')[0];

/** All logs that could serve as this input: alias matches, description
 *  hints, plus this app's own conditioned outputs (KEY_CND). The
 *  EXPLICIT picker rule: a conditioned or description-matched curve is
 *  never substituted silently — the user selects it in the explorer. */
export function candidatesFor(key, logs) {
  const aliases = CURVE_ALIASES[key] || [];
  const hint = DESCRIPTION_HINTS[key];
  return logs.filter((log) => {
    const b = base(log.mnemonic);
    if (aliases.includes(b) || b === `${key}_CND`) return true;
    return !!(hint && log.description && hint.test(String(log.description)));
  });
}

export function mapLogs(logs) {
  const byBase = new Map();
  for (const log of logs) {
    const b = base(log.mnemonic);
    if (!byBase.has(b)) byBase.set(b, log);
  }
  const mapped = {};
  for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
    const hit = aliases.find((a) => byBase.has(a));
    mapped[key] = hit ? byBase.get(hit) : null;
  }
  return mapped;
}

/** Logs bound to no input by the current mapping (raw curves the user
 *  can still put on a track as `log:<MNEMONIC>`). */
export function unmappedLogs(logs, mapped) {
  const bound = new Set(Object.values(mapped || {}).filter(Boolean).map((l) => l.id));
  return (logs || []).filter((l) => !bound.has(l.id) && base(l.mnemonic) !== 'DEPT' && base(l.mnemonic) !== 'DEPTH' && base(l.mnemonic) !== 'MD');
}
