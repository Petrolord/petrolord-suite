// FVF by period (WF-U2-008): Bo, Bw, Bg and Rs of the surveillance voidage
// read from the pvt-1 table at each date's reservoir pressure, instead of
// one set for the whole history (owner default until now: one PVT pressure
// per project).
//
//   reservoir pressure   dated surveys (typed on the Surveillance tab, or the
//                        surveys of a VRR Monitor project taken with its
//                        ledger), linear in time between surveys, held at the
//                        first and last survey outside them (said in the report)
//   FVF at a pressure    linear in the pvt-1 table kept with the intake
//                        (tableAt, never extrapolated); Bg converted from
//                        RB/scf (the block) to RB/Mscf through the registry
//   engine               computeFieldVRR's config.fvf_by_date (engines PR #306)
//
// If any date's pressure falls outside the table, the track is not applied
// and the reason is given; the single set is used and the report says so.
// Pure.
import { convert } from '@/lib/units/registry';
import { tableAt } from './pvtIntake';

const ISO = /^\d{4}-\d{2}(-\d{2})?$/;
const day = (d) => String(d ?? '').slice(0, 10);
// the engine's own date key (cleanRows' toDateKey): new Date(raw) as ISO day
const engineKey = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};
const ms = (d) => Date.parse(`${day(d).length === 7 ? `${day(d)}-01` : day(d)}T00:00:00Z`);

/** Clean surveys: [{date: 'YYYY-MM-DD', p_psia}] sorted, months read as their 1st. */
export function cleanSurveys(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({ date: String(s?.date ?? '').trim(), p_psia: Number(s?.p_psia) }))
    .filter((s) => ISO.test(s.date) && Number.isFinite(s.p_psia) && s.p_psia > 0)
    .map((s) => ({ date: s.date.length === 7 ? `${s.date}-01` : s.date, p_psia: s.p_psia }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Reservoir pressure at a date: linear between surveys, held outside them. */
export function pressureAt(surveys, date) {
  const t = ms(date);
  const s = surveys;
  if (!s.length || !Number.isFinite(t)) return { p: null, held: false };
  if (t <= ms(s[0].date)) return { p: s[0].p_psia, held: t < ms(s[0].date) };
  if (t >= ms(s[s.length - 1].date)) return { p: s[s.length - 1].p_psia, held: t > ms(s[s.length - 1].date) };
  for (let i = 1; i < s.length; i += 1) {
    const a = ms(s[i - 1].date);
    const b = ms(s[i].date);
    if (t <= b) return { p: s[i - 1].p_psia + ((s[i].p_psia - s[i - 1].p_psia) * (t - a)) / (b - a), held: false };
  }
  return { p: s[s.length - 1].p_psia, held: true };
}

/** The columns of a pvt-1 table the track needs, kept with the intake. */
export function trackTableOf(table) {
  return (table || []).filter((r) => Number.isFinite(r?.pressure)).map((r) => ({ pressure: r.pressure, Bo: r.Bo, Bw: r.Bw, Bg: r.Bg, Rs: r.Rs }));
}

/**
 * The FVF track of a history.
 * @param {string[]} dates the field dates of the history (any order, repeats allowed)
 * @param {Array<{date: string, p_psia: number}>} surveyList
 * @param {?object} pvtIntake the project's pvt-1 intake (with trackTable)
 * @returns {{ok: boolean, problems: string[], fvfByDate?: object, rows?: object[], held?: number, pRange?: number[]}}
 */
export function buildFvfTrack(dates, surveyList, pvtIntake) {
  const problems = [];
  const table = pvtIntake?.trackTable;
  if (!pvtIntake) problems.push('Take PVT from a Fluid Systems Studio project first: the track reads its table.');
  else if (!Array.isArray(table) || !table.length) problems.push('The PVT intake was taken before October 2026 and keeps no table: take it again from the Fluid Systems Studio project.');
  const surveys = cleanSurveys(surveyList);
  if (!surveys.length) problems.push('Enter at least one dated reservoir pressure survey.');
  if (problems.length) return { ok: false, problems };
  const ps = table.map((r) => r.pressure);
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const uniq = [...new Set((dates || []).map(engineKey).filter(Boolean))].sort();
  const fvfByDate = {};
  const rows = [];
  let held = 0;
  const outside = [];
  for (const d of uniq) {
    const { p, held: h } = pressureAt(surveys, d);
    if (h) held += 1;
    const Bo = tableAt(table, 'Bo', p);
    const Bw = tableAt(table, 'Bw', p);
    const BgScf = tableAt(table, 'Bg', p);
    const Rs = tableAt(table, 'Rs', p);
    if (Bo == null || Bw == null) { outside.push(`${d} (${Math.round(p)} psia)`); continue; }
    const e = { Bo, Bw };
    if (BgScf != null) e.Bg = convert('fvfGas', BgScf, 'RB/scf', 'RB/Mscf');
    if (Rs != null) e.Rs = Rs;
    fvfByDate[d] = e;
    rows.push({ date: d, p_psia: p, held: h, ...e });
  }
  if (outside.length) {
    return { ok: false, problems: [`The pressure of ${outside.length} date${outside.length === 1 ? '' : 's'} falls outside the PVT table (${lo} to ${hi} psia), for example ${outside.slice(0, 3).join(', ')}. Values are not extrapolated: the single FVF set is used.`] };
  }
  return { ok: true, problems: [], fvfByDate, rows, held, surveys, pRange: [Math.min(...rows.map((r) => r.p_psia)), Math.max(...rows.map((r) => r.p_psia))] };
}

/** The engine config with the track applied when the mode asks for it (and it can be built). */
export function surveillanceConfigWithTrack(baseConfig, rawConfig, rows, pvtIntake) {
  if (rawConfig?.fvf_mode !== 'by-period') return { config: baseConfig, track: null };
  const track = buildFvfTrack((rows || []).map((r) => r.date), rawConfig.pressure_surveys, pvtIntake);
  return { config: track.ok ? { ...baseConfig, fvf_by_date: track.fvfByDate } : baseConfig, track };
}
