/**
 * Simulator keyword export of Fluid Systems Studio (FLUID-U2-003; RL11).
 *
 * The black-oil table of the pvt-1 block as PVTO, PVDG and PVTW keywords
 * in FIELD units, with the origin, the method behind every property, the
 * basis, the units and the conventions as comment lines above them. The
 * keywords are written by the emitters the Simulation Studio deck builder
 * uses (packages/engines/engines/sim/emitPvt.js), on rows shaped the way
 * the builder shapes them, so for the same fluid the blocks are the
 * builder's own, character for character.
 *
 * A small reader for the three keywords is here too: it is what the
 * round-trip test reads the export back with, and what a consumer inside
 * the Suite can use. The reader that decides is the simulator: the worker
 * gate runs a deck that carries this export through OPM Flow
 * (worker/sim-worker/tests/integration/test_fluid_export_deck.py).
 *
 * Pure.
 */
import { emitPVTO, emitPVDG, emitPVTW, pvtoRecordsFromTable } from '@/utils/simDeckGeneration';
import { pvtContractOf, pvtContractCsvHeader, PVT1_PB_SOURCES } from '@/lib/inputProvenance/pvtContract';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?');

/**
 * The slope of a column at a pressure, as a fraction of its value there:
 * (1 / y) dy/dp by central difference over the two table rows that
 * bracket the pressure (one-sided at an end of the table).
 */
export function relativeSlopeAt(rows, key, pressure) {
  const pts = [...(rows || [])].filter((r) => finite(r.pressure) && finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  if (pts.length < 2) return null;
  const below = pts.filter((r) => r.pressure < pressure);
  const above = pts.filter((r) => r.pressure > pressure);
  let lo = below.length ? below[below.length - 1] : pts[0];
  let hi = above.length ? above[0] : pts[pts.length - 1];
  if (hi === lo) { if (above.length > 1) hi = above[1]; else lo = pts[pts.length - 2]; }
  if (!(hi.pressure > lo.pressure)) return null;
  const mid = 0.5 * (lo[key] + hi[key]);
  return (hi[key] - lo[key]) / (hi.pressure - lo.pressure) / mid;
}

const valueAt = (rows, key, pressure) => {
  const pts = [...(rows || [])].filter((r) => finite(r.pressure) && finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  if (!pts.length) return null;
  if (pressure <= pts[0].pressure) return pts[0][key];
  for (let i = 1; i < pts.length; i += 1) {
    if (pressure <= pts[i].pressure) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[key] + ((b[key] - a[key]) * (pressure - a.pressure)) / (b.pressure - a.pressure);
    }
  }
  return pts[pts.length - 1][key];
};

/**
 * The deck rows of a pvt-1 table: PVTO records, PVDG rows and the PVTW
 * record, in FIELD units (Rs Mscf/STB, Bg RB/Mscf).
 * @param {object} contract a pvt-1 block
 * @returns {{ok: boolean, reasons: string[], pvtoRecords?: object[], pvdg?: object[], pvtw?: object, pb?: number}}
 */
export function simRowsFromContract(contract) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, reasons: ['There is no PVT block to export.'] };
  if (b.model_detail?.saturation_kind === 'dew') {
    return { ok: false, reasons: ['This fluid has a dew point at the table temperature: a gas condensate needs the wet gas keyword PVTG, which this export does not write.'] };
  }
  const table = [...(b.table || [])].filter((r) => finite(r.pressure)).sort((x, y) => x.pressure - y.pressure);
  const pb = b.at_saturation?.pressure;
  const saturated = table.filter((r) => r.phase !== 'undersaturated' && r.pressure >= 14.7 && finite(r.Rs) && finite(r.Bo) && finite(r.mu_o));
  const undersat = table.filter((r) => r.phase === 'undersaturated' && finite(pb) && r.pressure > pb + 1 && finite(r.Bo) && finite(r.mu_o));
  const reasons = [];
  if (!saturated.length) reasons.push('The table holds no saturated row to write PVTO from.');
  if (!undersat.length) reasons.push('The table holds no row above the bubble point: PVTO needs an undersaturated branch on its last node.');
  if (reasons.length) return { ok: false, reasons };

  const pvtoRecords = pvtoRecordsFromTable(
    saturated.map((r) => ({ p: r.pressure, rs: r.Rs / 1000, bo: r.Bo, muo: r.mu_o })),
    undersat.map((r) => ({ p: r.pressure, bo: r.Bo, muo: r.mu_o })),
  );
  const pvdg = [];
  for (const r of table) {
    if (r.pressure < 14.7 || !(r.Bg > 0) || !finite(r.mu_g)) continue;
    const last = pvdg[pvdg.length - 1];
    if (last && !(r.pressure > last.p + 0.5)) continue;
    pvdg.push({ p: r.pressure, bg: r.Bg * 1000, mug: r.mu_g });
  }
  if (!pvdg.length) return { ok: false, reasons: ['The table holds no gas row to write PVDG from.'] };

  // PVTW at the bubble point: Bw and water viscosity from the table, the
  // compressibility and the viscosibility from the slope of their columns
  const pref = finite(pb) ? pb : table[table.length - 1].pressure;
  const bw = valueAt(table, 'Bw', pref);
  const muw = valueAt(table, 'mu_w', pref);
  const bwSlope = relativeSlopeAt(table, 'Bw', pref);
  const muSlope = relativeSlopeAt(table, 'mu_w', pref);
  const pvtw = finite(bw) && finite(muw) && bwSlope !== null
    ? { pref, bw, cw: -bwSlope, muw, viscosibility: muSlope ?? 0 }
    : null;
  return { ok: true, reasons: [], pvtoRecords, pvdg, pvtw, pb };
}

/**
 * The export text.
 * @param {object} contract a pvt-1 block
 * @returns {{ok: boolean, reasons: string[], text?: string, blocks?: {pvto: string, pvdg: string, pvtw: ?string},
 *   rows?: object, fileName?: string}}
 */
export function buildSimKeywords(contract) {
  const rows = simRowsFromContract(contract);
  if (!rows.ok) return { ok: false, reasons: rows.reasons };
  const b = pvtContractOf(contract);
  const sc = b.standard_conditions || {};
  const blocks = {
    pvto: emitPVTO(rows.pvtoRecords),
    pvdg: emitPVDG(rows.pvdg),
    pvtw: rows.pvtw ? emitPVTW(rows.pvtw) : null,
  };
  const pbWords = finite(rows.pb) ? `${rows.pb} psia, ${PVT1_PB_SOURCES[b.pb_source] || 'source not stated'}` : 'not stated';
  const comment = [
    'Black-oil PVT keywords for a reservoir simulator, written by Petrolord Fluid Systems Studio.',
    ...pvtContractCsvHeader(b, { prefix: '' }),
    `Bubble point pressure: ${pbWords}`,
    `Table temperature: ${b.inputs?.temperature ?? 'not stated'} degF`,
    '',
    'UNITS (FIELD), whatever the display units of the project:',
    '  pressure psia, absolute',
    '  Rs Mscf/STB (thousand standard cubic feet per stock-tank barrel)',
    '  Bo and Bw RB/STB',
    '  Bg RB/Mscf',
    '  viscosity cP',
    '  compressibility and viscosibility 1/psi',
    `  standard conditions ${sc.pressure_psia} psia and ${sc.temperature_degF} degF`,
    '',
    'CONVENTIONS:',
    '  PVTO: one record per saturated node, Rs ascending: Rs, the bubble point pressure of that Rs, Bo, oil viscosity.',
    '        The last node (the bubble point of this fluid) carries the undersaturated branch at constant Rs:',
    '        pressure, Bo, oil viscosity. Nodes of equal Rs are written once.',
    '  PVDG: pressure, Bg, gas viscosity, pressure ascending. Dry gas: no vaporised oil.',
    `  PVTW: reference pressure, Bw, water compressibility, water viscosity, viscosibility, at the ${finite(rows.pb) ? 'bubble point' : 'highest table pressure'}.`,
    '        The compressibility is -(1/Bw) dBw/dp and the viscosibility (1/muw) dmuw/dp, from the slope of the Bw and',
    '        water viscosity columns of the table at the reference pressure.',
    ...(blocks.pvtw ? [] : ['        Not written: the table holds no water columns.']),
    '  The rows are the rows of the PVT table of the project, as it hands them to other Petrolord apps.',
  ].map((l) => (l === '' ? '--' : `-- ${ascii(l)}`));

  const text = [...comment, '', blocks.pvto, blocks.pvdg, ...(blocks.pvtw ? [blocks.pvtw] : [])].join('\n');
  const base = String(b.project_name || 'fluid').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_') || 'fluid';
  return { ok: true, reasons: [], text, blocks, rows, fileName: `${base}_PVT.INC` };
}

/**
 * Read PVTO, PVDG and PVTW back from deck text. Comments (from "--" to the
 * end of the line) are dropped; any other keyword is skipped.
 * @returns {{PVTO: ?Array<{rs: number, p: number, bo: number, muo: number, undersat: Array<{p: number, bo: number, muo: number}>}>,
 *   PVDG: ?Array<{p: number, bg: number, mug: number}>,
 *   PVTW: ?{pref: number, bw: number, cw: number, muw: number, viscosibility: number}, comments: string[]}}
 */
export function readSimKeywords(text) {
  const comments = [];
  const lines = String(text || '').split(/\r\n|\r|\n/).map((line) => {
    const i = line.indexOf('--');
    if (i >= 0) comments.push(line.slice(i + 2).trim());
    return (i >= 0 ? line.slice(0, i) : line).trim();
  }).filter((l) => l !== '');
  const out = { PVTO: null, PVDG: null, PVTW: null, comments };
  let i = 0;
  const isKeyword = (l) => /^[A-Z][A-Z0-9]*$/.test(l);
  // the records of a keyword: token groups, each closed by a slash; an empty group closes a table keyword
  const records = () => {
    const recs = [];
    let cur = [];
    while (i < lines.length && !isKeyword(lines[i])) {
      for (const tok of lines[i].split(/\s+/)) {
        if (tok === '/') { recs.push(cur); cur = []; } else if (tok.endsWith('/')) { cur.push(tok.slice(0, -1)); recs.push(cur); cur = []; } else cur.push(tok);
      }
      i += 1;
    }
    if (cur.length) recs.push(cur);
    return recs;
  };
  const nums = (tokens) => tokens.map(Number);
  while (i < lines.length) {
    const kw = lines[i];
    i += 1;
    if (!isKeyword(kw)) continue;
    const recs = records();
    if (kw === 'PVTO') {
      out.PVTO = recs.filter((r) => r.length).map((r) => {
        const v = nums(r);
        const undersat = [];
        for (let k = 4; k + 2 < v.length; k += 3) undersat.push({ p: v[k], bo: v[k + 1], muo: v[k + 2] });
        return { rs: v[0], p: v[1], bo: v[2], muo: v[3], undersat };
      });
    } else if (kw === 'PVDG') {
      const v = nums(recs.filter((r) => r.length).flat());
      out.PVDG = [];
      for (let k = 0; k + 2 < v.length; k += 3) out.PVDG.push({ p: v[k], bg: v[k + 1], mug: v[k + 2] });
    } else if (kw === 'PVTW') {
      const v = nums(recs.find((r) => r.length) || []);
      out.PVTW = { pref: v[0], bw: v[1], cw: v[2], muw: v[3], viscosibility: v[4] ?? 0 };
    }
  }
  return out;
}
