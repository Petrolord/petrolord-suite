// Reads Well Cost & Time estimates and publishes each one's latest saved run
// as the `wct-afe-1` contract (./wctAfeContract.js). Plain selects on the
// rows the signed-in user may read (wp_wct_cases RLS follows the site), so
// no policy changes.
import { buildWctAfeContract } from './wctAfeContract';

async function namesFor(supabase, cases) {
  const wbIds = [...new Set(cases.map((c) => c.wellbore_id).filter(Boolean))];
  const dIds = [...new Set(cases.map((c) => c.design_id).filter(Boolean))];
  const wb = wbIds.length ? (await supabase.from('wp_wellbores').select('id, name').in('id', wbIds)).data || [] : [];
  const ds = dIds.length ? (await supabase.from('wp_designs').select('id, name').in('id', dIds)).data || [] : [];
  return { wb: new Map(wb.map((r) => [r.id, r])), ds: new Map(ds.map((r) => [r.id, r])) };
}

async function latestRuns(supabase, caseIds) {
  if (!caseIds.length) return new Map();
  const { data, error } = await supabase.from('wp_wct_runs').select('*').in('case_id', caseIds).order('created_at', { ascending: false });
  if (error) throw new Error(`Could not read the Well Cost & Time runs: ${error.message}`);
  const m = new Map();
  for (const r of data || []) if (!m.has(r.case_id)) m.set(r.case_id, r);
  return m;
}

/** Every estimate the user may read, newest first, each a contract or a refusal with its reason. */
export async function listWctAfes(supabase, { limit = 50, build = null } = {}) {
  const { data, error } = await supabase.from('wp_wct_cases').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read your Well Cost & Time estimates: ${error.message}`);
  const cases = data || [];
  const [runs, names] = await Promise.all([latestRuns(supabase, cases.map((c) => c.id)), namesFor(supabase, cases)]);
  return cases.map((c) => ({
    caseId: c.id,
    caseName: c.name,
    wellboreName: names.wb.get(c.wellbore_id)?.name ?? null,
    ...buildWctAfeContract({ caseRow: c, runRow: runs.get(c.id) || null, wellbore: names.wb.get(c.wellbore_id), design: names.ds.get(c.design_id), build }),
  }));
}

/** One estimate by id: the contract of its latest run, a refusal, or null when the estimate is gone. */
export async function getWctAfe(supabase, { caseId }, { build = null } = {}) {
  const { data, error } = await supabase.from('wp_wct_cases').select('*').eq('id', caseId).limit(1);
  if (error) throw new Error(`Could not read the Well Cost & Time estimate: ${error.message}`);
  if (!data || !data.length) return null;
  const c = data[0];
  const [runs, names] = await Promise.all([latestRuns(supabase, [c.id]), namesFor(supabase, [c])]);
  return buildWctAfeContract({ caseRow: c, runRow: runs.get(c.id) || null, wellbore: names.wb.get(c.wellbore_id), design: names.ds.get(c.design_id), build });
}
