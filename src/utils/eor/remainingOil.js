/**
 * Remaining oil saturation from Material Balance (EOR-U2-005), for the oil
 * saturation input of the screening (Taber 1997 screens "oil saturation at
 * the start of the EOR project").
 *
 *   So = (1 - Np/N) (Bo/Boi) (1 - Swi)
 *
 * the volumetric material balance form: the reservoir volume of the oil
 * left, (N - Np) Bo, over the pore volume, N Boi / (1 - Swi), unchanged
 * since discovery. It holds with no water influx, no injection and no gas
 * cap; a case whose run says otherwise gets no estimate. N, Np and the
 * initial and last pressures come from the mbal-1 intake, Bo and Boi from
 * the pvt-1 intake's table at those pressures (never extrapolated), Swi is
 * stated by the user. An average over the whole reservoir: swept zones hold
 * less, unswept more. Pure.
 */
import { tableAt } from './intakes.js';

const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const g4 = (v) => String(parseFloat(Number(v).toPrecision(4)));

export const REMAINING_OIL_EQUATION = 'So = (1 - Np/N) (Bo/Boi) (1 - Swi)';

/** @param {{intakes: object, context: object}} inputs */
export function remainingOilEstimate({ intakes = {}, context = {} } = {}) {
  const no = (reason) => ({ ok: false, reason });
  const m = intakes.mbal;
  const p = intakes.pvt;
  if (!m?.balance) return no('Take a Material Balance case (mbal-1) first: it gives N, Np and the pressures.');
  if (!p?.bo_table?.length) return no('Take a Fluid Systems Studio project (pvt-1) first: it gives Bo at the initial and last pressures.');
  const b = m.balance;
  const N = num(m.values?.ooipStb);
  if (!(N > 0)) return no('The Material Balance case gives no OOIP.');
  if (!finite(b.np_stb)) return no('The Material Balance run carries no cumulative oil (Np) at its last timestep.');
  if ((b.aquifer_model && b.aquifer_model !== 'none') || (finite(b.wdi) && b.wdi > 1e-6)) return no(`The case has an aquifer (${b.aquifer_model || 'water drive'}): water influx changes the pore volume the oil shares, so the volumetric form does not hold.`);
  if ((finite(b.winj_di) && b.winj_di > 1e-6) || (finite(b.ginj_di) && b.ginj_di > 1e-6)) return no('The case has water or gas injection: the volumetric form does not hold.');
  const swiPct = num(context.swiPct);
  if (swiPct == null || swiPct < 0 || swiPct >= 100) return no('State the initial water saturation (0 to 100 % PV) to estimate the remaining oil.');
  const Boi = tableAt(p.bo_table, 'Bo', b.p_initial_psia);
  const Bo = tableAt(p.bo_table, 'Bo', b.p_last_psia);
  if (!finite(Boi) || !finite(Bo)) {
    const ps = p.bo_table.map((r) => r.pressure);
    return no(`The initial (${g4(b.p_initial_psia)} psia) or last (${g4(b.p_last_psia)} psia) pressure is outside the PVT table of the Fluid project (${g4(Math.min(...ps))} to ${g4(Math.max(...ps))} psia). Values are not extrapolated.`);
  }
  const swi = swiPct / 100;
  const so = (1 - b.np_stb / N) * (Bo / Boi) * (1 - swi);
  const mbalName = m.from?.recordName ? `case "${m.from.recordName}"` : 'the case';
  const pvtName = p.from?.recordName ? `project "${p.from.recordName}"` : 'the Fluid project';
  return {
    ok: true,
    soPct: 100 * so,
    terms: { N, Np: b.np_stb, Bo, Boi, swi, pInitial: b.p_initial_psia, pLast: b.p_last_psia },
    method: `Material balance remaining oil, ${REMAINING_OIL_EQUATION}: N ${g4(N)} STB and Np ${g4(b.np_stb)} STB from Material Balance Studio ${mbalName}; Bo ${g4(Bo)} at ${g4(b.p_last_psia)} psia and Boi ${g4(Boi)} at ${g4(b.p_initial_psia)} psia from Fluid Systems Studio ${pvtName}; Swi ${g4(swiPct)} % PV stated. Volumetric reservoir (no influx, no injection, no gas cap); a reservoir average`,
  };
}
