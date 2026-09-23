// Data Quality Studio (Data & AI D1): figures in engine reasons, for reading.
//
// The engine prints every figure in a reason as the shortest round-trip
// decimal, so a reason can read "z = 2.9999999999999996". The CSV and PDF
// exports keep that text as the engine wrote it. On screen, displayReason
// shortens long decimals without changing what the sentence says:
//
//   - integers (no decimal point, no exponent) are left exactly as printed;
//   - a decimal is rounded to at most 6 decimal places and trailing zeros
//     are trimmed, keeping at least 4 significant figures for a small
//     number, so 0.0000012345 does not read as 0.000001 or 0;
//   - a figure in exponent form keeps 6 significant figures;
//   - if rounding would make a figure read the same as another figure in
//     the same reason whose value differs (2.9999999999999996 beyond the
//     threshold 3 would read "3 ... 3"), that figure is shown unrounded.
//
// Rounding is monotone, so two figures can never swap order; a tie is the
// only way a comparison can read wrong, and the last rule removes it.

const MAX_DECIMALS = 6;
const MIN_SIGNIFICANT = 4;

// A number standing on its own: not part of a word or identifier such as
// Ekene-03 or DT2, and not glued to a following letter or digit.
const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w])/g;

const isPlainInteger = (text) => !/[.eE]/.test(text);

/**
 * One figure, as printed by the engine, shortened for reading. Returns the
 * text unchanged when it is an integer or already short enough.
 */
export function roundFigure(text) {
  if (isPlainInteger(text)) return text;
  const x = Number(text);
  if (!Number.isFinite(x) || x === 0) return text;
  if (/[eE]/.test(text)) {
    const short = String(Number(x.toPrecision(6)));
    return short.length < text.length ? short : text;
  }
  const exponent = Math.floor(Math.log10(Math.abs(x)));
  const decimals = Math.min(20, Math.max(MAX_DECIMALS, MIN_SIGNIFICANT - 1 - exponent));
  const short = x.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return short.length < text.length ? short : text;
}

/** A number (not text) for display, by the same rule as a reason figure. */
export function displayNumber(x) {
  if (x === null || x === undefined || (typeof x === 'number' && Number.isNaN(x))) return '';
  if (x === Infinity) return 'infinity';
  if (x === -Infinity) return 'minus infinity';
  if (typeof x !== 'number') return String(x);
  return roundFigure(String(x));
}

/** The reason with its figures shortened, per the rules above. */
export function displayReason(reason) {
  if (typeof reason !== 'string' || !reason) return reason ?? '';
  const tokens = [];
  reason.replace(NUMBER, (text, offset) => {
    const rounded = roundFigure(text);
    tokens.push({ text, offset, value: Number(text), rounded, shown: rounded });
    return text;
  });
  if (!tokens.length) return reason;
  tokens.forEach((t) => {
    if (t.rounded === t.text) return;
    const collides = tokens.some((o) => o !== t && o.value !== t.value && Number(o.rounded) === Number(t.rounded));
    if (collides) t.shown = t.text;
  });
  let out = '';
  let at = 0;
  tokens.forEach((t) => {
    out += reason.slice(at, t.offset) + t.shown;
    at = t.offset + t.text.length;
  });
  return out + reason.slice(at);
}
