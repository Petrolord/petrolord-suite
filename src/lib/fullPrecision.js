// Full precision (W3 of the NextGen graded-field follow-on programme, D3).
//
// Suite product cards round for reading. A course capstone grades some of those
// same quantities to 1e-4 or finer, so a learner needs a way to see the digits
// the engine computed. Each app that a capstone reads from carries a "Full
// precision" switch (FullPrecisionToggle), OFF by default: with it off every
// card prints exactly what it printed before. With it on, the graded
// quantities print at 6 decimals (money in $MM at 4 decimals, or more where a
// tolerance needs it), with no thousands separators so a value pastes cleanly
// into an answer box.
//
// These are the only formatters the switch uses. They never round a value that
// is then used in a calculation; they only turn a number into text.

export const FULL_PRECISION_DECIMALS = 6;
export const MONEY_MM_DECIMALS = 4;

// A number as plain text at a fixed number of decimals: no grouping, no
// exponent for ordinary magnitudes, and never "-0.000000". Anything that is
// not a finite number prints as "--", the Suite's usual placeholder.
export function formatFull(value, decimals = FULL_PRECISION_DECIMALS) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return '--';
  const v = Number(value);
  if (!Number.isFinite(v)) return '--';
  const d = Math.max(0, Math.min(20, Math.trunc(decimals)));
  const s = v.toFixed(d);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

// Money held in USD, printed in $MM (millions) at 4 decimals by default.
export function formatMoneyMM(usd, decimals = MONEY_MM_DECIMALS) {
  if (usd === null || usd === undefined || usd === '') return '--';
  const v = Number(usd);
  return Number.isFinite(v) ? formatFull(v / 1e6, decimals) : '--';
}

// The one switch: `normal` is whatever the card printed before (a string or a
// node), returned untouched when full precision is off.
export function pickPrecision(full, normal, value, decimals = FULL_PRECISION_DECIMALS) {
  return full ? formatFull(value, decimals) : normal;
}

// A sample (for example a Monte Carlo NPV sample) sorted ascending, as CSV
// text with one value per row at full precision. `header` names the column.
// Rows keep their rank so a learner can read any percentile rule by hand.
export function sortedSampleCsv(values, header = 'value', decimals = 10) {
  const xs = (Array.isArray(values) || ArrayBuffer.isView(values) ? Array.from(values) : [])
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const lines = [`rank,${header}`];
  xs.forEach((x, i) => lines.push(`${i + 1},${formatFull(x, decimals)}`));
  return `${lines.join('\n')}\n`;
}

// Hand a text file to the browser as a download. Returns false where there is
// no DOM (tests, SSR) so callers can fall back.
export function downloadText(filename, text, type = 'text/csv') {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
