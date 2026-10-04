// The average pressure of a saved Well Test Analysis Studio project taken as
// a pressure point of the data table, by id (WTA-U2-005; Material Balance
// U2-010 named it: "pressure rows from VRR Monitor or Well Test where a
// saved source exists").
//
// The saved source: the `wta-1` record every Well Test save writes
// (src/lib/wellTestSource.js, payload key `wta`). Its pressure block gives
// the value (`average_psia`, absolute; at the datum when the test stated a
// gradient, at the gauge otherwise, and `basis` says which), the method
// (`method_label` p* or pi, with `average_method` in words) and the day it
// belongs to (`date`, the end of the test). The point lands on the data row
// of the same day; nothing else changes, so the case's numbers move only
// when the analyst takes a point and runs the engine again.
//
// Each point taken is recorded in the study record under its own key
// (`wta_point_<timestep>`), so several tests can each land on their row;
// the report cites each one and says when its value was edited afterwards.
import { wtaContractOf, validateWtaContract, WTA_APP, WTA_TABLE } from '@/lib/wellTestSource';

export { WTA_APP, WTA_TABLE };
export const WTA_POINT_KEY = 'wta_point_';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * What a saved Well Test project offers as a pressure point.
 * @returns {{ok: boolean, reason?: string, p_psia?: number, date?: string, label?: string, method?: string,
 *   basis?: string, project?: string, id?: string}}
 */
export function wellTestPressurePoint(row) {
  const c = wtaContractOf(row?.inputs_data);
  const name = row?.project_name || c?.project?.name || 'Well test project';
  if (!c) return { ok: false, reason: `"${name}" was saved before it carried its results (wta-1). Open it in ${WTA_APP} and save it once.` };
  const check = validateWtaContract(c);
  if (!check.ok) return { ok: false, reason: `The results of "${name}" are incomplete: ${check.errors.join(' ')}` };
  const p = c.pressure?.average_psia;
  if (!finite(p) || !(p > 0)) return { ok: false, reason: `"${name}" holds no average pressure.` };
  const date = c.pressure?.date || null;
  if (!date) return { ok: false, reason: `"${name}" has no test date. Type the test dates on its Data tab in ${WTA_APP} and save it; the date decides which row of this case the pressure belongs to.` };
  const label = c.pressure?.method_label || (finite(c.pressure?.p_star_psia) ? 'p*' : 'pi');
  return {
    ok: true, p_psia: p, date, label,
    method: c.pressure?.average_method || '',
    basis: c.pressure?.basis || '',
    project: name, id: row?.id ?? c.project?.id ?? null, well: c.project?.well || null,
  };
}

/**
 * Where the point would land, and what would change.
 * @returns {{error?: string, point?: object, match?: {timestep_index: number, date: string, from: number, to: number}}}
 */
export function planWellTestPoint(row, rows) {
  const point = wellTestPressurePoint(row);
  if (!point.ok) return { error: point.reason };
  const hits = (rows ?? []).filter((r) => String(r.observation_date ?? '').slice(0, 10) === point.date);
  if (!hits.length) return { error: `No dated row of this case falls on the test date ${point.date}. Add a row for that day (with its cumulative volumes) and choose the project again.`, point };
  if (hits.length > 1) return { error: `More than one row of this case is dated ${point.date}; the point is not taken.`, point };
  const r = hits[0];
  if (r.timestep_index === 0) return { error: 'The test date falls on the initial row, whose pressure is the case input "initial pressure". Type it there if this test measured it.', point };
  return { point, match: { timestep_index: r.timestep_index, date: point.date, from: Number(r.pressure_psia), to: point.p_psia } };
}

/** The new data rows and the study handoff when the analyst takes the point. */
export function takeWellTestPoint(row, rows, { now = new Date().toISOString() } = {}) {
  const plan = planWellTestPoint(row, rows);
  if (plan.error) return { error: plan.error };
  const { point, match } = plan;
  const nextRows = rows.map((r) => (r.timestep_index === match.timestep_index ? { ...r, pressure_psia: point.p_psia } : r));
  const handoff = {
    app: WTA_APP,
    record: `${point.project} (${point.id})`,
    value: point.p_psia,
    at: now,
    text: `Timestep ${match.timestep_index} (${point.date}): ${point.label} from ${WTA_APP} project "${point.project}"${point.well ? `, well ${point.well}` : ''}, test of ${point.date}, ${point.basis}. ${point.method}`.trim(),
    rows: { [String(match.timestep_index)]: point.p_psia },
  };
  return { rows: nextRows, handoff, key: `${WTA_POINT_KEY}${match.timestep_index}`, match, point };
}

/**
 * What the report says about every Well Test point taken: one sentence each,
 * with the edit after the handoff said. Null when none was taken.
 */
export function wellTestPointProvenance(study, rows) {
  const keys = Object.keys(study?.handoffs ?? {}).filter((k) => k.startsWith(WTA_POINT_KEY)).sort((a, b) => Number(a.slice(WTA_POINT_KEY.length)) - Number(b.slice(WTA_POINT_KEY.length)));
  if (!keys.length) return null;
  const byStep = new Map((rows ?? []).map((r) => [r.timestep_index, r]));
  const edited = [];
  const lines = keys.map((k) => {
    const h = study.handoffs[k];
    const t = Number(k.slice(WTA_POINT_KEY.length));
    const r = byStep.get(t);
    const p = Number(r?.pressure ?? r?.pressure_psia);
    const was = finite(h.value) ? h.value : Number(h.rows?.[String(t)]);
    const changed = !r || !finite(p) || Math.abs(p - was) > 1e-6 * Math.max(1, was);
    if (changed) edited.push(t);
    return `${h.text} Record ${h.record}, taken ${String(h.at).slice(0, 10)}.${changed ? ` Edited in this app after the handoff (received ${was} psia).` : ''}`;
  });
  return { steps: keys.map((k) => Number(k.slice(WTA_POINT_KEY.length))), edited, text: `Pressure points from ${WTA_APP}: ${lines.join(' ')}` };
}

/** The saved Well Test projects the user can read, newest first. */
export async function listWellTestProjects(supabase) {
  const { data, error } = await supabase.from(WTA_TABLE).select('*').order('updated_at', { ascending: false });
  return { data: data ?? [], error };
}
