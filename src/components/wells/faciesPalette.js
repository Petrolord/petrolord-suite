// Colours for discrete facies (code) curves, shared by the strip tracks
// (Well Correlation, Petrophysics) and the crossplot colour-by. A category
// whose name says what it is gets the colour a geoscientist expects
// (hydrocarbon warm, brine blue, shale grey-green, sand yellow); anything
// else takes a categorical palette colour that stays the same for its code.

const NAMED = [
  { re: /\b(hydrocarbon|oil|gas|condensate|pay)\b/i, color: '#ea580c' },
  { re: /\b(brine|water|wet|aquifer)\b/i, color: '#2563eb' },
  { re: /\bcoal|lignite\b/i, color: '#1f2937' },
  { re: /\b(carbonate|limestone|dolomite|chalk)\b/i, color: '#06b6d4' },
  { re: /\b(shale|clay|mud|mudstone|claystone|silt|siltstone)\b/i, color: '#7c8a6a' },
  { re: /\b(sand|sandstone)\b/i, color: '#facc15' },
];

/** Categorical fallback palette (distinct on white and on dark panels). */
export const CATEGORY_COLORS = ['#e11d48', '#16a34a', '#9333ea', '#0891b2', '#d97706', '#db2777', '#4f46e5', '#65a30d', '#0d9488', '#b45309'];

/**
 * The colour of one facies category.
 * @param {string} name category name ('' when the code has none)
 * @param {number} code its integer code (keeps the fallback colour stable)
 */
export function faciesColor(name, code) {
  const n = String(name || '');
  for (const { re, color } of NAMED) if (re.test(n)) return color;
  const k = Number.isFinite(code) ? Math.abs(Math.round(code)) : 0;
  return CATEGORY_COLORS[(k + CATEGORY_COLORS.length - 1) % CATEGORY_COLORS.length];
}

/** True when a registry log row is a discrete code curve (facies). */
export function isCodeLog(row) {
  if (!row) return false;
  return row.provenance?.kind === 'facies' || String(row.unit || '').toUpperCase() === 'CODE' || /^(RP_)?(FACIES|LITH|LITHOLOGY|EFAC)\b/i.test(String(row.mnemonic || ''));
}

/**
 * The code curve to show for a well: the named mnemonic when given and
 * present, else RP_FACIES, else the newest code log. Null when none.
 * @param {Array} rows registry log rows (geo_wells_logs)
 * @param {Object} logs raw curves keyed by mnemonic
 * @param {string} [mnemonic]
 */
export function pickCodeLog(rows, logs, mnemonic = null) {
  const have = (rows || []).filter((r) => logs?.[r.mnemonic]);
  if (mnemonic) return have.find((r) => r.mnemonic === mnemonic || r.mnemonic.toUpperCase() === mnemonic.toUpperCase()) || null;
  const codes = have.filter(isCodeLog);
  return codes.find((r) => r.mnemonic === 'RP_FACIES') || codes[codes.length - 1] || null;
}

/**
 * Categories of a code curve: every positive integer code named in the
 * provenance or present in the samples, in code order, with its name and
 * colour; `index` maps each sample to its category index (NaN for 0 = none
 * and for nulls) so a strip track can draw it.
 * @param {Object} row registry log row (provenance.codes [{code, name}])
 * @param {ArrayLike<number>} data samples
 */
export function codeCategories(row, data) {
  const names = new Map();
  for (const c of row?.provenance?.codes || []) {
    const code = Math.round(Number(c.code));
    if (code > 0) names.set(code, String(c.name || ''));
  }
  const present = new Map();
  for (let i = 0; i < (data?.length || 0); i++) {
    const v = data[i];
    if (!Number.isFinite(v) || v <= -900) continue;
    const code = Math.round(v);
    if (code > 0) present.set(code, (present.get(code) || 0) + 1);
  }
  const codes = [...new Set([...names.keys(), ...present.keys()])].sort((a, b) => a - b);
  const cats = codes.map((code) => {
    const name = names.get(code) || `Code ${code}`;
    return { code, name, color: faciesColor(names.get(code) || '', code), count: present.get(code) || 0 };
  });
  const pos = new Map(cats.map((c, k) => [c.code, k]));
  const index = new Float32Array(data?.length || 0);
  for (let i = 0; i < index.length; i++) {
    const v = data[i];
    const k = Number.isFinite(v) && v > -900 ? pos.get(Math.round(v)) : undefined;
    index[i] = k == null ? NaN : k;
  }
  return { categories: cats, index };
}
