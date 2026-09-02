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
};

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
