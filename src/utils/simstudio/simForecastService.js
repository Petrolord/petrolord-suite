// Reads Reservoir Simulation Studio cases and publishes each completed run
// as the `sim-forecast-1` contract (./simForecastContract.js). The receivers
// (Forecast Scenario Hub, Petroleum Economics Studio) call these with their
// Supabase client. The reads are plain selects on the rows the signed-in
// user may read (their own cases, and those shared with them under the
// record sharing rules) and downloads of the run's summary.json from the
// owner's folder of the private `sim` bucket, which the same rules open to a
// colleague; no policy changes.
//
// The deck of the case is read too: when its SHA-256 equals the run's (the
// deck that ran), its unit keyword and history end are taken from it, so a
// history-matched run can be sent as the prediction alone. `hash` is the
// SHA-256 used (WebCrypto in the browser; a test passes its own). When the deck
// changed after the run, the prediction phase is refused with that reason.
import { buildSimForecastContract, SIM_TABLE } from './simForecastContract.js';
import { summarizeDeck } from './deckSummary.js';

const BUCKET = 'sim';
const RUN_COLUMNS = 'id, case_id, status, finished_at, queued_at, deck_sha256, opm_version, worker_id, result_path';
const CASE_COLUMNS = 'id, name, user_id, deck_path, deck_source, updated_at';

async function webSha256Hex(text) {
  const c = globalThis.crypto;
  if (!c?.subtle) return null;
  const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function download(supabase, path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message || String(error));
  return data.text();
}

/** What the case's current deck says, when it is the deck that ran. */
async function deckFacts(supabase, caseRow, run, hash = webSha256Hex) {
  if (!caseRow?.deck_path) return { historyEnd: null, deckSystem: null, why: 'the case has no deck' };
  try {
    const text = await download(supabase, caseRow.deck_path);
    const sha = await hash(text);
    if (!sha || !run.deck_sha256 || sha !== run.deck_sha256) return { historyEnd: null, deckSystem: null, why: 'the case deck changed after this run' };
    const d = summarizeDeck(text);
    return { historyEnd: d.schedule?.historyControls ? d.schedule.lastDate || null : null, deckSystem: d.unitSystem || null, why: d.schedule?.historyControls ? null : 'the deck has no history phase' };
  } catch (e) {
    return { historyEnd: null, deckSystem: null, why: `the deck could not be read (${e.message})` };
  }
}

/** The run's summary and the facts of its deck, or the reason they cannot be read. */
async function loadRun(supabase, caseRow, run, hash) {
  try {
    const summary = JSON.parse(await download(supabase, run.result_path));
    return { summary, facts: await deckFacts(supabase, caseRow, run, hash) };
  } catch (e) {
    return { error: `The run's summary could not be read: ${e.message}` };
  }
}

function contractOf(caseRow, run, loaded, phase, build) {
  if (loaded.error) return { ok: false, reason: loaded.error };
  const { summary, facts } = loaded;
  const got = buildSimForecastContract({ caseRow, run, summary, phase, historyEnd: facts.historyEnd, deckSystem: facts.deckSystem, build });
  if (!got.ok && phase === 'prediction' && facts.why) return { ok: false, reason: `No prediction phase to send: ${facts.why}.` };
  return got;
}

async function contractOfRun(supabase, caseRow, run, phase, build, hash) {
  return contractOf(caseRow, run, await loadRun(supabase, caseRow, run, hash), phase, build);
}

const completeRuns = async (supabase, caseIds, limit) => {
  const { data, error } = await supabase.from('sim_runs').select(RUN_COLUMNS).in('case_id', caseIds).eq('status', 'complete').order('finished_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read the simulation runs: ${error.message}`);
  return (data || []).filter((r) => r.result_path);
};

/**
 * The completed runs the user may read, newest first, each with its
 * whole-run contract (or the refusal and its reason), and a prediction
 * entry when the run's deck has a history phase.
 */
export async function listSimForecasts(supabase, { limit = 12, build = null, hash = webSha256Hex } = {}) {
  const { data: cases, error } = await supabase.from(SIM_TABLE).select(CASE_COLUMNS).order('updated_at', { ascending: false }).limit(50);
  if (error) throw new Error(`Could not read your Reservoir Simulation Studio cases: ${error.message}`);
  if (!cases?.length) return [];
  const byId = new Map(cases.map((c) => [c.id, c]));
  const runs = await completeRuns(supabase, cases.map((c) => c.id), limit);
  const out = [];
  for (const run of runs) {
    const caseRow = byId.get(run.case_id);
    const loaded = await loadRun(supabase, caseRow, run, hash);
    const whole = contractOf(caseRow, run, loaded, 'run', build);
    out.push({ caseId: caseRow.id, caseName: caseRow.name ?? null, runId: run.id, finishedAt: run.finished_at ?? null, phase: 'run', ...whole });
    // a run whose deck has a history phase can also be sent as its prediction alone
    const pred = whole.ok && loaded.facts?.historyEnd ? contractOf(caseRow, run, loaded, 'prediction', build) : null;
    if (pred?.ok) out.push({ caseId: caseRow.id, caseName: caseRow.name ?? null, runId: run.id, finishedAt: run.finished_at ?? null, phase: 'prediction', ...pred });
  }
  return out;
}

/**
 * One run's forecast by id, and the case's newest completed run in the same
 * phase when it is another run: { ok, contract | reason, latest }, or null
 * when the case or the run is gone (or no longer readable).
 */
export async function getSimForecast(supabase, { caseId, runId, phase = 'run' }, { build = null, hash = webSha256Hex } = {}) {
  const { data: cases, error } = await supabase.from(SIM_TABLE).select(CASE_COLUMNS).eq('id', caseId).limit(1);
  if (error) throw new Error(`Could not read the Reservoir Simulation Studio case: ${error.message}`);
  if (!cases?.length) return null;
  const caseRow = cases[0];
  const runs = await completeRuns(supabase, [caseId], 50);
  const run = runs.find((r) => r.id === runId);
  if (!run) return null;
  const got = await contractOfRun(supabase, caseRow, run, phase, build, hash);
  const newest = runs[0];
  const latest = newest && newest.id !== run.id ? await contractOfRun(supabase, caseRow, newest, phase, build, hash) : null;
  return { ...got, latest };
}
