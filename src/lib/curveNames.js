// Curve mnemonic naming shared by the LAS merge, the digitizer and any door
// that writes a registry log (2026-09-03).
//
//   nameKey           case-insensitive, trimmed comparison key
//   nextFreeName      the registry convention for a repeated mnemonic: the
//                     next free ':n' suffix (the curve alias mapper ignores
//                     ':n', so GR:2 still maps as GR)
//   digitizedCurveName a digitized curve is ALWAYS a new row (owner rule):
//                     <MNEM>_DIG, then _DIG:2, _DIG:3 ...; an incoming ':n'
//                     suffix is dropped first and _DIG is never doubled

export const nameKey = (m) => String(m || '').trim().toUpperCase();

export function nextFreeName(name, existingNames) {
  const taken = new Set((existingNames || []).map(nameKey));
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; n < 1000; n++) {
    const cand = `${name}:${n}`;
    if (!taken.has(nameKey(cand))) return cand;
  }
  return `${name}:${Date.now()}`;
}

export function digitizedCurveName(mnemonic, existingNames) {
  const base = nameKey(mnemonic).split(':')[0] || 'CURVE';
  const named = base.endsWith('_DIG') ? base : `${base}_DIG`;
  return nextFreeName(named, existingNames);
}
