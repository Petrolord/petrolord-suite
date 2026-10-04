/**
 * The FVFs of the Voidage Replacement Monitor taken from a Fluid Systems
 * Studio project through the pvt-1 contract (VRR-U1, RL11; plan Step 0c).
 *
 * The pvt-1 block of a saved Fluid project is read by id
 * (src/lib/pvtSource.js, `?fluidProject=<id>`). Its table (pressure, Bo,
 * Rs, Bg, Bw) is kept with the VRR project in the monitor's units (Bg in
 * RB/Mscf, 1,000 times the block's RB/scf) together with the block without
 * its table, so the shared PVT intake card can say "source changed since"
 * (content) and "edited after intake".
 *
 * Two uses, both stated in the report:
 *   track     each period's Bo, Bw, Bg and Rs interpolated in the table at
 *             the period's reservoir pressure (the pressure history). A
 *             period outside the table keeps the constant set and is named;
 *             the table is never extrapolated.
 *   constant  the constant set filled from the table at one stated
 *             pressure (the single-value assumption, with its pressure).
 *
 * This file names no correlation and computes no PVT: it converts units
 * with the Suite registry and interpolates linearly in the source table.
 *
 * Pure.
 */
import { convert } from '@/lib/units/registry';
import {
  pvtContractOf, pvtContractSummary, pvtContractOrigin, validatePvtContract, PVT_PRODUCER,
} from '@/lib/inputProvenance/pvtContract';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const g5 = (v) => (finite(v) ? Number(v.toPrecision(5)) : null);

/** The fields of the shared PVT intake card in the monitor (method from the block). */
export const VRR_PVT_FIELDS = Object.freeze([
  { property: 'bo', key: 'Bo', label: 'Bo (RB/STB)' },
  { property: 'bw', key: 'Bw', label: 'Bw (RB/STB)' },
  { property: 'bg', key: 'Bg', label: 'Bg (RB/Mscf)' },
  { property: 'rs', key: 'Rs', label: 'Rs (scf/STB)' },
]);

/** The card fields with each value's method as the block names it. */
export function vrrPvtCardFields(intake) {
  const m = intake?.contract?.methods || {};
  return VRR_PVT_FIELDS.map((f) => ({ ...f, method: m[f.property]?.method || 'Method not stated by the block' }));
}

/**
 * The table of a pvt-1 block in the monitor's units, ascending in pressure.
 * @returns {{ok: boolean, errors: string[], rows?: {p: number, Bo: number, Bw: ?number, Bg: number, Rs: number}[]}}
 */
export function vrrTableFromPvt(contract) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, errors: ['The Fluid Systems Studio project carries no pvt-1 block.'] };
  const gate = validatePvtContract(b);
  if (!gate.ok) return { ok: false, errors: [`The PVT block is incomplete: ${gate.errors.join(' ')}`] };
  const u = b.units || {};
  const errors = [];
  if (u.pressure !== 'psia') errors.push(`The block states its pressures in "${u.pressure}", which this app does not read.`);
  if (u.Bo !== 'RB/STB' || (u.Bw && u.Bw !== 'RB/STB')) errors.push('The block states Bo or Bw in a unit other than RB/STB.');
  if (u.Rs !== 'scf/STB') errors.push(`The block states Rs in "${u.Rs}".`);
  if (!['RB/scf', 'RB/Mscf'].includes(u.Bg)) errors.push(`The block states Bg in "${u.Bg}".`);
  if (errors.length) return { ok: false, errors };
  const rows = (b.table || [])
    .filter((r) => finite(r?.pressure) && r.pressure > 0 && finite(r.Bo) && finite(r.Rs) && finite(r.Bg) && r.Bg > 0)
    .map((r) => ({
      p: r.pressure,
      Bo: r.Bo,
      Bw: finite(r.Bw) ? r.Bw : null,
      Bg: Number(convert('fvfGas', r.Bg, u.Bg, 'RB/Mscf').toPrecision(10)),
      Rs: r.Rs,
    }))
    .sort((a, b2) => a.p - b2.p);
  if (rows.length < 2) return { ok: false, errors: ['The PVT block holds fewer than two pressures with Bo, Rs and Bg.'] };
  return { ok: true, errors: [], rows };
}

/** Linear interpolation of one column at a pressure; null outside the table or where the column is empty. */
function at(rows, key, p) {
  const pts = rows.filter((r) => finite(r[key]));
  if (!pts.length || !finite(p) || p < pts[0].p - 1e-9 || p > pts[pts.length - 1].p + 1e-9) return null;
  for (let i = 1; i < pts.length; i += 1) {
    if (p <= pts[i].p) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.p === a.p ? b[key] : a[key] + ((b[key] - a[key]) * (p - a.p)) / (b.p - a.p);
    }
  }
  return pts[pts.length - 1][key];
}

/** Bo, Bw, Bg and Rs at one pressure (psia) from the kept table; null outside it. Bw null when the table has none. */
export function fvfAt(rows, p) {
  if (!Array.isArray(rows) || rows.length < 2 || !finite(p)) return null;
  if (p < rows[0].p - 1e-9 || p > rows[rows.length - 1].p + 1e-9) return null;
  return { Bo: at(rows, 'Bo', p), Bw: at(rows, 'Bw', p), Bg: at(rows, 'Bg', p), Rs: at(rows, 'Rs', p) };
}

/**
 * Per-period FVFs from the kept table at the period pressures.
 * @returns {{overrides: Array<?object>, outside: number[], range: [number, number]}}
 *   overrides[i] null where the period has no pressure or lies outside the table (the constant set applies)
 */
export function periodFvfFromTable(rows, pressures) {
  const outside = [];
  const overrides = (pressures || []).map((p, i) => {
    if (!finite(p)) return null;
    const v = fvfAt(rows, p);
    if (!v) { outside.push(i); return null; }
    const o = { Bo: v.Bo, Bg: v.Bg, Rs: v.Rs };
    if (finite(v.Bw)) o.Bw = v.Bw; // no Bw column: the constant Bw applies
    return o;
  });
  return { overrides, outside, range: rows?.length ? [rows[0].p, rows[rows.length - 1].p] : [null, null] };
}

/**
 * What the monitor keeps with its project when it takes a pvt-1 block.
 * @param {object} contract the block (with project_id and project_name)
 * @param {{pressurePsia?: ?number, at?: string}} [o] the pressure the constant set is filled at (blank: the bubble point)
 * @returns {{ok: boolean, errors: string[], intake?: object, constant?: object}}
 */
export function vrrPvtIntake(contract, { pressurePsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const t = vrrTableFromPvt(contract);
  if (!t.ok) return { ok: false, errors: t.errors };
  const b = pvtContractOf(contract);
  const sat = b.at_saturation || {};
  const stated = finite(pressurePsia);
  const p = stated ? pressurePsia : sat.pressure;
  const v = fvfAt(t.rows, p);
  if (!v) {
    return { ok: false, errors: [`The pressure ${finite(p) ? `${p} psia` : '(none stated)'} is outside the PVT table of the project (${t.rows[0].p} to ${t.rows[t.rows.length - 1].p} psia). The table is not extrapolated.`] };
  }
  const values = { Bo: String(g5(v.Bo)), Bg: String(g5(v.Bg)), Rs: String(g5(v.Rs)) };
  if (finite(v.Bw)) values.Bw = String(g5(v.Bw));
  return {
    ok: true,
    errors: [],
    constant: values,
    intake: {
      from: {
        app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null,
        at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema,
      },
      pressure_psia: p,
      pressure_from: stated ? 'stated' : 'the bubble point of the block',
      values,
      table: t.rows,
      contract: pvtContractSummary(b),
    },
  };
}

/** The Source column words of Bo, Bw, Bg or Rs taken from the block, or null. */
export function vrrPvtSourceText(intake, key, { track = false } = {}) {
  if (!intake?.contract) return null;
  const m = intake.contract.methods?.[{ Bo: 'bo', Bw: 'bw', Bg: 'bg', Rs: 'rs' }[key]]?.method;
  const how = track
    ? `interpolated in the PVT table at each period's reservoir pressure (${intake.table?.length || 0} rows, ${intake.table?.[0]?.p} to ${intake.table?.[intake.table.length - 1]?.p} psia)`
    : `taken from the PVT table at ${intake.pressure_psia} psia (${intake.pressure_from})`;
  // the per-period use covers all four values: their methods are in the block printed with the report
  return `${how}${m && !track ? `; method ${m}` : ''}${track ? '; the method of each value is in the pvt-1 block' : ''}${pvtContractOrigin(intake.contract)}`;
}
