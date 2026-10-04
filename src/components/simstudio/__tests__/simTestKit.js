// Simulation U1 test kit: stored runs the worker really produced (OPM Flow
// 2026.04 in the worker image, summaries built by the worker's own
// build_summary with the PRT diagnostics, 2026-10-04: src/dev/fixtures), the
// case rows and run rows as the database holds them, and the decks they ran.
import fs from 'fs';
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { defaultBuilderForm } from '@/utils/simDeckBuilder';

export const AT = new Date('2026-10-04T12:00:00Z');
export const BUILD = 'Petrolord Suite test (fixture)';
export const logo = chartLogo();
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

export const spe1Summary = () => JSON.parse(read('src/dev/fixtures/sim-spe1-summary.json'));
export const builtSummary = () => JSON.parse(read('src/dev/fixtures/sim-built-summary.json'));
export const builtS4Summary = () => JSON.parse(read('src/dev/fixtures/sim-built-s4-summary.json'));
export const spe1Deck = () => read('public/sim-templates/spe1/SPE1CASE1.DATA');
export const builtDeck = () => read('worker/sim-worker/tests/integration/fixtures/generated/BUILT.DATA');
export const builtS4Deck = () => read('worker/sim-worker/tests/integration/fixtures/generated/BUILT_S4.DATA');

/** A summary as the worker build of August 2026 wrote it: no diagnostics, no steps, no unit system. */
export function legacySummary(s = spe1Summary()) {
  const { diagnostics, run, unit_system: _u, steps, ...rest } = s;
  return rest;
}

export const spe1Case = () => ({
  id: 'case-spe1', user_id: 'u1', name: 'SPE1 benchmark', deck_source: 'template', template_slug: 'SPE1CASE1',
  deck_path: 'u1/case-spe1/deck/SPE1CASE1.DATA', deck_bytes: 12500,
});
export const runOf = (summary, over = {}) => ({
  id: 'run-0001-aaaa', case_id: 'case-spe1', user_id: 'u1', status: 'complete', attempt: 1, worker_id: 'vps-sim-worker-1',
  queued_at: '2026-10-04T09:00:00Z', claimed_at: '2026-10-04T09:00:02Z', finished_at: '2026-10-04T09:00:09Z',
  deck_sha256: summary.deck_sha256, opm_version: summary.opm_version, exit_code: 0,
  elapsed_seconds: summary.run?.elapsed_seconds ?? 6.1, active_cells: summary.diagnostics?.active_cells ?? null,
  report_steps: summary.steps?.report_steps ?? null, result_path: 'u1/case-spe1/runs/run-0001/summary.json',
  ...over,
});

/** The builder's default form as saved with a case after Generate. */
export function builtForm(summary = builtSummary()) {
  const f = defaultBuilderForm();
  f.identification = { company: 'Ekene Energy', field: 'Obodo', licence: 'OML 999', reservoir: 'D-2 sand', analyst: 'A. Engineer' };
  f.lastGenerated = { at: '2026-10-04T08:59:00Z', deckSha256: summary.deck_sha256, fileName: 'MY_FIRST_SIMULATION_MODEL.DATA' };
  return f;
}
export const builtCase = () => ({
  id: 'case-built', user_id: 'u1', name: 'Builder model', deck_source: 'generated', template_slug: null,
  deck_path: 'u1/case-built/deck/MY_FIRST_SIMULATION_MODEL.DATA', deck_bytes: 9000,
});
