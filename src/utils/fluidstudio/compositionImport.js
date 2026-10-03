/**
 * The composition door of Fluid Systems Studio (FLUID-U2-009; RL10, PL2).
 *
 * A feed composition arrives as a table from a PVT report: one row per
 * component, the amount in mole percent or mole fraction, and the C7+
 * molecular weight and specific gravity either as columns of the C7+ row or
 * as rows of their own. The door reads it with the shared typed reader
 * (src/lib/tabularParse.js), knows the names laboratories write (methane,
 * CH4, C1; i-C4, isobutane; heptanes plus, C7+), takes the basis from the
 * header, from the choice at the door, or from the total (100 or 1), and
 * reads back what it read and what it did not. Weight percent is refused:
 * it needs molecular weights the table does not hold.
 *
 * Pure.
 */
import { parseTabular, questionText, splitRows, detectTableDelimiter } from '../../lib/tabularParse.js';

export const COMPOSITION_KEYS = Object.freeze(['N2', 'CO2', 'H2S', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'nC6', 'C7+']);

// name rules, tried in order; the text is lower case with spaces, dashes and dots removed
const NAME_RULES = [
  ['N2', /^(n2|nitrogen)$/],
  ['CO2', /^(co2|carbondioxide)$/],
  ['H2S', /^(h2s|hydrogensul(ph|f)ide)$/],
  ['C7+', /^(c7\+|c7plus|c7\+fraction|heptanes?\+|heptanesplus|c7p)$/],
  ['C1', /^(c1|ch4|methane)$/],
  ['C2', /^(c2|c2h6|ethane)$/],
  ['C3', /^(c3|c3h8|propane)$/],
  ['iC4', /^(ic4|isobutane|ibutane)$/],
  ['nC4', /^(nc4|nbutane|normalbutane|butane)$/],
  ['iC5', /^(ic5|isopentane|ipentane)$/],
  ['nC5', /^(nc5|npentane|normalpentane|pentane)$/],
  ['nC6', /^(nc6|c6|hexanes?|nhexane)$/],
];
const SCN = /^c(\d{1,2})$/; // a single carbon number heavier than C6
const tidy = (s) => String(s ?? '').toLowerCase().replace(/[\s._-]/g, '').replace(/\(.*\)$/, '');

/** The component key of a name, or null. */
export function componentKey(name) {
  const t = tidy(name);
  if (!t) return null;
  for (const [key, re] of NAME_RULES) if (re.test(t)) return key;
  return null;
}

const basisFromText = (t) => {
  const s = String(t || '').toLowerCase();
  if (/w(t|eight)\s*%|wt\.?\s*%|mass/.test(s)) return 'weight';
  if (/mol(e)?\s*%|mol\s*pct|mol(e)?\s*percent|%/.test(s)) return 'percent';
  if (/fraction|frac|^z$|^y$|^x$/.test(s)) return 'fraction';
  return null;
};

/**
 * @param {string} text
 * @param {{basis?: 'auto'|'percent'|'fraction', decimal?: '.'|',', delimiter?: string}} [opts]
 * @returns {{ok: boolean, reason: ?string, zPct: ?Object<string, number>, plus: ?{mw: ?number, sg: ?number},
 *   total: ?number, basis: ?string, basisFrom: ?string, skipped: Array<{line: number, text: string, reason: string}>,
 *   ignored: string[], needsAnswer: boolean, questions: string[], summary: string}}
 */
/**
 * A composition table has its MW and SG columns filled on one row only, so
 * most rows end in empty fields and the reader would take the table as two
 * columns wide. Empty fields are written as "-" (a null word of the reader)
 * so every row keeps the width of the widest one.
 */
function fillEmptyFields(text, delimiter) {
  const rows = splitRows(text, delimiter);
  const width = Math.max(0, ...rows.map((r) => r.cells.length));
  const quote = (c) => (/["\n\r]/.test(c) || c.includes(delimiter) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => {
    if (!r.cells.some((c) => String(c).trim() !== '')) return '';
    if (r.cells.length < 2) return r.text; // a title or a comment stays as it is
    const cells = Array.from({ length: width }, (_, i) => {
      const c = String(r.cells[i] ?? '').trim();
      return c === '' ? '-' : quote(c);
    });
    return cells.join(delimiter);
  }).join('\n');
}

export function readComposition(text, opts = {}) {
  const src = typeof text === 'string' ? text : '';
  const delimiter = opts.delimiter || detectTableDelimiter(src);
  const table = parseTabular(delimiter === ' ' ? src : fillEmptyFields(src, delimiter), {
    delimiter,
    ...(opts.decimal ? { decimal: opts.decimal } : {}),
  });
  const skipped = table.report.skipped.map((s) => ({ line: s.line, text: String(s.text || '').trim(), reason: s.reason[0].toUpperCase() + s.reason.slice(1) }));
  const base = { ok: false, reason: null, zPct: null, plus: null, total: null, basis: null, basisFrom: null, skipped, ignored: [], needsAnswer: table.needsAnswer, questions: table.questions.map(questionText), summary: '' };
  const fail = (reason) => ({ ...base, reason, summary: reason });
  if (!table.rows.length) return fail('No table rows were found in the text.');

  // the name column: the first text column; the amount: a header saying mol or fraction, else the first number column
  const textCol = table.columns.find((c) => c.kind === 'text');
  const numCols = table.columns.filter((c) => c.kind === 'number');
  if (!textCol || !numCols.length) return fail('A composition needs a column of component names and a column of amounts.');
  const head = (c) => `${c.header || ''} ${c.unit || ''}`;
  const isMw = (c) => /\bmw\b|mol(ecular)?\.?\s*w(eigh)?t|molar\s*mass/i.test(head(c));
  const isSg = (c) => /\bsg\b|specific\s*grav|gravity|dens/i.test(head(c));
  const amountCol = numCols.find((c) => basisFromText(head(c)) && !isMw(c) && !isSg(c)) || numCols.find((c) => !isMw(c) && !isSg(c));
  if (!amountCol) return fail('No column of amounts was found beside the component names.');
  const headerBasis = basisFromText(head(amountCol));
  if (headerBasis === 'weight') return fail('The amounts are in weight percent. The model takes mole percent or mole fraction: weight percent needs the molecular weight of every component to convert. Convert the column, or take the mole percent column of the report.');
  const mwCol = numCols.find(isMw) || null;
  const sgCol = numCols.find(isSg) || null;

  const amounts = {};
  const ignored = [];
  let plusMw = null;
  let plusSg = null;
  const heavy = [];
  for (const r of table.rows) {
    const name = r.values[textCol.index];
    const v = r.values[amountCol.index];
    const t = tidy(name);
    // "C7+ molecular weight 218" and "C7+ specific gravity 0.8515" written as rows
    if (/^c7\+?.*(mw|molecularweight|molarmass)$|^(mw|molecularweight)(of)?c7\+?$/.test(t) && Number.isFinite(v)) { plusMw = v; continue; }
    if (/^c7\+?.*(sg|specificgravity|gravity|density)$|^(sg|specificgravity)(of)?c7\+?$/.test(t) && Number.isFinite(v)) { plusSg = v; continue; }
    if (/^total|^sum/.test(t)) continue;
    const key = componentKey(name);
    if (!key) {
      const m = SCN.exec(t);
      if (m && Number(m[1]) >= 7) { heavy.push(String(name)); continue; }
      if (name != null && String(name).trim()) ignored.push(String(name).trim());
      continue;
    }
    if (!Number.isFinite(v)) { skipped.push({ line: r.line, text: String(name), reason: 'No amount on this row' }); continue; }
    if (v < 0) { skipped.push({ line: r.line, text: String(name), reason: 'A negative amount' }); continue; }
    amounts[key] = (amounts[key] || 0) + v;
    if (key === 'C7+') {
      if (mwCol && Number.isFinite(r.values[mwCol.index])) plusMw = r.values[mwCol.index];
      if (sgCol && Number.isFinite(r.values[sgCol.index])) plusSg = r.values[sgCol.index];
    }
  }
  if (heavy.length && amounts['C7+'] == null) {
    return fail(`The table splits the heavy end into single carbon numbers (${heavy.slice(0, 4).join(', ')}${heavy.length > 4 ? ', ...' : ''}). The model holds one C7+ pseudo-component: give the C7+ fraction as one row, with its molecular weight and specific gravity.`);
  }
  if (!Object.keys(amounts).length) return fail('No component the model knows was found in the name column.');

  const total = Object.values(amounts).reduce((a, v) => a + v, 0);
  let basis = opts.basis && opts.basis !== 'auto' ? opts.basis : headerBasis;
  let basisFrom = opts.basis && opts.basis !== 'auto' ? 'chosen at the door' : headerBasis ? 'read from the header' : null;
  if (!basis) {
    if (Math.abs(total - 100) <= 2) basis = 'percent';
    else if (Math.abs(total - 1) <= 0.02) basis = 'fraction';
    else return { ...fail(`The amounts add up to ${total.toPrecision(5)}: neither 100 (mole percent) nor 1 (mole fraction). Choose the basis at the door.`), total };
    basisFrom = `from the total (${total.toPrecision(5)})`;
  }
  const scale = basis === 'fraction' ? 100 : 1;
  const zPct = Object.fromEntries(COMPOSITION_KEYS.map((k) => [k, amounts[k] != null ? Number((amounts[k] * scale).toPrecision(10)) : 0]));
  const totalPct = total * scale;
  const notes = [];
  if (Math.abs(totalPct - 100) > 0.5) notes.push(`The feed adds up to ${totalPct.toFixed(3)} mol%; the engine renormalises it to 100.`);
  if (heavy.length) notes.push(`Single carbon number rows (${heavy.join(', ')}) are left out: the C7+ row holds them.`);
  if (zPct['C7+'] > 0 && plusMw == null) notes.push('No C7+ molecular weight was found: enter it on the Composition tab.');
  if (zPct['C7+'] > 0 && plusSg == null) notes.push('No C7+ specific gravity was found: enter it on the Composition tab.');
  if (plusSg != null && (plusSg < 0.6 || plusSg > 1.1)) notes.push(`A C7+ specific gravity of ${plusSg} is outside the usual 0.70 to 1.00: check the column.`);

  const found = COMPOSITION_KEYS.filter((k) => amounts[k] != null);
  const decimal = table.decimal?.mark === ',' ? ' Decimal commas.' : '';
  const summary = `${found.length} component${found.length === 1 ? '' : 's'} read (${found.join(', ')}), ${basis === 'percent' ? 'mole percent' : 'mole fraction'} (${basisFrom}).`
    + `${plusMw != null ? ` C7+ molecular weight ${plusMw}.` : ''}${plusSg != null ? ` C7+ specific gravity ${plusSg}.` : ''}`
    + `${ignored.length ? ` Rows not read: ${ignored.join('; ')}.` : ''}${skipped.length ? ` ${skipped.length} line${skipped.length === 1 ? '' : 's'} not read.` : ''}`
    + `${notes.length ? ` ${notes.join(' ')}` : ''} Separator: ${table.delimiterName}.${decimal}`;
  return { ...base, ok: true, zPct, plus: { mw: plusMw, sg: plusSg }, total: totalPct, basis, basisFrom, ignored, summary };
}
