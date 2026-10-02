/**
 * Report Kit: text that jsPDF's standard fonts can print.
 *
 * The standard fonts (Helvetica and friends) carry Latin-1 only. A Greek
 * letter, a superscript or a typographic dash sent to doc.text() comes out
 * as a wrong glyph or throws the widths off, so every string a report
 * prints goes through pdfText first: the symbols the Suite screens use are
 * spelled out (phi, mu, sqrt, 2, 3), and whatever is still outside Latin-1
 * becomes a question mark.
 *
 * A report that would rather fail than print a question mark builds with
 * `strictText: true`, or calls assertPrintable on its own strings: the
 * characters with no spelling are then listed in the error.
 */

// Symbols the screens use that a report spells out.
const SPELL = [
  [/Δ/g, 'd'], [/[μµ]/g, 'mu'], [/[φϕΦ]/g, 'phi'], [/√/g, 'sqrt'], [/²/g, '2'], [/³/g, '3'],
  [/·/g, ' '], [/[—–−]/g, '-'], [/[“”]/g, '"'], [/[‘’]/g, "'"], [/…/g, '...'], [/≥/g, '>='], [/≤/g, '<='],
  [/×/g, 'x'], [/°/g, 'deg '], [/π/g, 'pi'], [/→/g, 'to'],
];

const spell = (value) => {
  let s = value == null ? '' : String(value);
  for (const [re, to] of SPELL) s = s.replace(re, to);
  return s;
};

/** Text safe for jsPDF's standard fonts: symbols spelled out, anything outside Latin-1 replaced by "?". */
export function pdfText(value) {
  return spell(value).replace(/[^\x00-\xff]/g, '?');
}

/** The distinct characters of a string that have no spelling and would print as "?". */
export function unprintable(value) {
  const found = spell(value).match(/[^\x00-\xff]/gu) || [];
  return [...new Set(found)];
}

/** True when pdfText would print the string without a single "?" substitution. */
export const isPrintable = (value) => unprintable(value).length === 0;

/**
 * pdfText that refuses instead of substituting. Throws an Error naming the
 * characters (with their code points) that cannot be printed.
 */
export function assertPrintable(value, where = 'report text') {
  const bad = unprintable(value);
  if (bad.length) {
    const list = bad.map((c) => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
    throw new Error(`Report Kit: ${where} holds characters the PDF fonts cannot print: ${list}. Spell them out in Latin-1.`);
  }
  return pdfText(value);
}

/** The text function a report uses: pdfText, or the refusing one when strict. */
export const textFilter = (strict) => (strict ? (v) => assertPrintable(v) : pdfText);
