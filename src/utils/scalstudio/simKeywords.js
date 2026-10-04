/**
 * Simulator keyword export of SCAL Studio (SCAL-U2-001; RL11).
 *
 * The working oil-water and gas-oil Corey sets as SWOF and SGOF keywords,
 * with the capillary pressure of the working Leverett J in the SWOF Pcow
 * column, and comment lines above them that say where the curves came from
 * (the kr-1 block), the units and the conventions.
 *
 * The keywords are written by the emitters the Simulation Studio deck
 * builder uses (packages/engines/engines/sim/emitSatFns.js), on rows shaped
 * the way its buildSatFns shapes them: SWOF runs from Swc to Sw = 1 (a
 * terminal row with krw at its end point and krow 0), and SGOF from Sg = 0
 * to 1 - Swc, so the two tables close (the SPE1 lesson). With the
 * capillary pressure off, the blocks are the builder's own for the same
 * Corey sets, character for character.
 *
 * The Pcow column is the engine's pcFromJ evaluated at each table Sw (the
 * same uniform grid, the same arithmetic), not interpolated. SGOF Pcog is
 * zero: the studio has no gas-oil capillary pressure model, and the comment
 * lines say so.
 *
 * A small reader for the two keywords is here too: it is what the
 * round-trip test reads the export back with. The reader that decides is
 * the simulator: the worker gate runs a deck that carries this export
 * through OPM Flow (worker/sim-worker/tests/integration/test_scal_export_deck.py).
 *
 * Owner default 2026-10-03: the keywords are exported now; Simulation
 * Studio reading them by id is the Simulation round.
 *
 * Pure.
 */
import { emitSWOF, emitSGOF } from '@/utils/simDeckGeneration';
import { buildCoreyOilWater, buildCoreyGasOil, pcFromJ } from '@/utils/scalCalculations';
import { describeKrContract, krContractOf } from '@/lib/inputProvenance/krContract';
import { convert } from '@/lib/units/registry';

/** Deck unit systems the export writes. Pc is the only dimensional column. */
export const SAT_DECK_UNITS = Object.freeze({
  FIELD: { label: 'FIELD', pc: 'psi' },
  METRIC: { label: 'METRIC', pc: 'bar' },
});

/** Rows per mobile range, as the deck builder samples them. */
export const SAT_TABLE_INTERVALS = 20;

const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Pc in psi at one water saturation from the working J, through the engine. */
export function pcPsiAt(jSpec, reservoirProps, Sw) {
  const res = pcFromJ(jSpec, reservoirProps, { n: 1, SwMin: Sw, SwMax: Sw });
  return res.ok && res.rows.length ? res.rows[0].Pc_psi : NaN;
}

/**
 * The SWOF and SGOF rows of the working sets, in psi.
 * @param {{ow: ?object, go: ?object, jSpec?: ?object, reservoir?: ?object, withPc?: boolean, n?: number}} a
 *   `ow`, `go` the validated Corey parameter sets (the studio's ow.params, go.params)
 * @returns {{ok: boolean, swof: ?object[], sgof: ?object[], errors: string[], warnings: string[]}}
 */
export function satFnRows({ ow, go, jSpec = null, reservoir = null, withPc = true, n = SAT_TABLE_INTERVALS }) {
  const errors = [];
  const warnings = [];
  if (!ow) errors.push('The oil-water Corey set is not valid; fix it on the Curves tab.');
  if (!go) errors.push('The gas-oil Corey set is not valid; fix it on the Curves tab.');
  if (ow && go && Math.abs(ow.Swc - go.Swc) > 1e-9) {
    errors.push(`The gas-oil set is at Swc ${go.Swc} and the oil-water set at Swc ${ow.Swc}. The simulator takes one connate water: SGOF must end at 1 - Swc of SWOF. Make the two Swc equal.`);
  }
  if (withPc) {
    if (!jSpec || !reservoir) errors.push('There is no working J curve with reservoir rock to give Pc. Set it on the Capillary tab, or export without capillary pressure.');
    else if (ow && !(ow.Swc > jSpec.Swirr + 1e-9)) {
      errors.push(`Swc ${ow.Swc} of the oil-water set is at or below Swirr ${jSpec.Swirr} of the J curve, where the power-law Pc has no finite value. Raise Swc above Swirr, or export without capillary pressure.`);
    }
  }
  if (errors.length) return { ok: false, swof: null, sgof: null, errors, warnings };

  let swof = buildCoreyOilWater(ow, { n }).rows.map((r) => ({ Sw: r.Sw, krw: r.krw, krow: r.kro, pcow: 0 }));
  if (1 - ow.Sor < 1 - 1e-9) swof.push({ Sw: 1, krw: ow.krwMax, krow: 0, pcow: 0 });
  if (withPc) {
    const grid = pcFromJ(jSpec, reservoir, { n, SwMin: ow.Swc, SwMax: 1 - ow.Sor });
    swof = swof.map((r, i) => ({ ...r, pcow: i <= n && grid.ok ? grid.rows[i].Pc_psi : pcPsiAt(jSpec, reservoir, r.Sw) }));
  }

  const sgof = [];
  if (go.Sgc > 1e-9) sgof.push({ Sg: 0, krg: 0, krog: go.krogMax, pcog: 0 });
  buildCoreyGasOil(go, { n }).rows.forEach((r) => sgof.push({ Sg: r.Sg, krg: r.krg, krog: r.krog, pcog: 0 }));
  if (go.Sorg > 1e-9) sgof.push({ Sg: 1 - go.Swc, krg: go.krgMax, krog: 0, pcog: 0 });

  if (Math.abs(go.krogMax - ow.kroMax) > 1e-9) {
    warnings.push(`krog at Sg = 0 (${go.krogMax}) differs from krow at Swc (${ow.kroMax}). Both are the oil relative permeability at connate water; a three-phase model expects them equal.`);
  }
  return { ok: true, swof, sgof, errors, warnings };
}

/**
 * The export text: comment lines, then SWOF and SGOF.
 * @param {{contract?: ?object, ow: ?object, go: ?object, jSpec?: ?object, reservoir?: ?object,
 *   withPc?: boolean, units?: 'FIELD'|'METRIC', displayUnits?: ?string}} a
 * @returns {{ok: boolean, text: ?string, errors: string[], warnings: string[], rows: ?object}}
 */
export function buildSatKeywords(a) {
  const units = SAT_DECK_UNITS[a.units] ? a.units : 'FIELD';
  const withPc = a.withPc !== false;
  const rows = satFnRows({ ow: a.ow, go: a.go, jSpec: a.jSpec, reservoir: a.reservoir, withPc });
  if (!rows.ok) return { ok: false, text: null, errors: rows.errors, warnings: rows.warnings, rows: null };
  const toDeck = (psi) => (units === 'METRIC' ? convert('pressure', psi, 'psi', 'bar') : psi);
  const swof = rows.swof.map((r) => ({ ...r, pcow: toDeck(r.pcow) }));
  const sgof = rows.sgof.map((r) => ({ ...r, pcog: toDeck(r.pcog) }));
  const pcUnit = SAT_DECK_UNITS[units].pc;
  const block = krContractOf(a.contract);
  const lines = [
    `Saturation functions exported by Petrolord SCAL Studio (SWOF and SGOF, ${units} units).`,
    ...(block ? describeKrContract(block).map(([k, v]) => `${k}: ${v}`) : ['Source: SCAL Studio, no saved project (the kr-1 block was not available).']),
    `Units: saturations and kr as fractions; Pc in ${pcUnit} (${units} deck units)${units === 'METRIC' ? ', converted from psi with 1 psi = 0.0689476 bar' : ''}.`,
    'SWOF columns: Sw, krw, krow, Pcow. Pcow = Po - Pw, a pressure difference, non-increasing in Sw.',
    withPc
      ? `Pcow: drainage Pc of the working Leverett J (J = ${a.jSpec.a.toPrecision(6)} Sw*^(-${a.jSpec.b.toPrecision(6)}), Swirr ${a.jSpec.Swirr}) scaled to k ${a.reservoir.k_md} md, porosity ${a.reservoir.phi}, IFT ${a.reservoir.sigma_dyncm} dyn/cm, contact angle ${a.reservoir.thetaDeg} deg, evaluated at each Sw of the table.`
      : 'Pcow: zero in every row (exported without capillary pressure).',
    `SWOF runs from Swc ${a.ow.Swc} (connate water immobile) to Sw = 1: ${SAT_TABLE_INTERVALS} Corey intervals over Swc to 1 - Sor, then a terminal row with krw at its end point and krow 0.`,
    'SGOF columns: Sg, krg, krog, Pcog. Pcog = Pg - Po. Zero in every row: SCAL Studio has no gas-oil capillary pressure model.',
    `SGOF runs from Sg = 0 to 1 - Swc = ${(1 - a.go.Swc).toPrecision(6)}, so it closes with SWOF; the gas-oil set is at connate water.`,
    'Two-phase Corey curves: no hysteresis, no end-point scaling. The three-phase oil relative permeability is left to the simulator (its default or the STONE keywords).',
    ...rows.warnings.map((w) => `Warning: ${w}`),
    ...(a.displayUnits ? [`The project shows ${a.displayUnits}; this file uses the deck units above.`] : []),
  ].map((l) => `-- ${ascii(l).replace(/[\r\n]+/g, ' ')}`);
  const text = `${lines.join('\n')}\n\n${emitSWOF(swof)}\n${emitSGOF(sgof)}`;
  return { ok: true, text, errors: [], warnings: rows.warnings, rows: { swof, sgof } };
}

/**
 * Read SWOF and SGOF tables back from deck text: comment lines (`--`) and
 * blank lines skipped, four numbers per row until the closing slash.
 * @returns {{SWOF: ?number[][], SGOF: ?number[][]}}
 */
export function readSatKeywords(text) {
  const out = { SWOF: null, SGOF: null };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/--.*$/, '').trim());
  let current = null;
  for (const l of lines) {
    if (!l) continue;
    if (/^[A-Z][A-Z0-9]*$/.test(l)) {
      current = Object.prototype.hasOwnProperty.call(out, l) ? l : null;
      if (current) out[current] = [];
      continue;
    }
    if (!current) continue;
    const ended = l.includes('/');
    const nums = l.replace('/', ' ').trim().split(/\s+/).filter(Boolean).map(Number);
    if (nums.length) {
      if (nums.length !== 4 || !nums.every(finite)) throw new Error(`${current}: a row must hold four numbers, read "${l}"`);
      out[current].push(nums);
    }
    if (ended) current = null;
  }
  return out;
}
