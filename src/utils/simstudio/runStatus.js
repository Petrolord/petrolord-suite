/**
 * What the app may say about a completed run (SIM-U1-002; PL4, RL8). Before,
 * "Latest run complete." meant only that the simulator exited and the
 * summary parsed. Now the words come from what the simulator printed: the
 * material balance closure and the convergence statistics in its PRT, read
 * by the worker. A summary from a worker build that did not read the PRT
 * says so and claims nothing.
 *
 * Pure.
 */
import { NOT_REPORTED } from './reportModel.js';

const n = (v) => (Number.isFinite(Number(v)) && v != null ? Number(v).toLocaleString('en-US') : 'n/a');

/** @returns {{balance: 'closes'|'open'|'not_reported'|'not_requested', chops: ?number, text: string}} */
export function runStatus(summary) {
  const d = summary?.diagnostics;
  if (!d) return { balance: 'not_reported', chops: null, text: `Material balance and convergence: ${NOT_REPORTED}.` };
  const mb = d.material_balance;
  const chops = d.chops?.count ?? 0;
  const conv = d.complete
    ? (chops ? `${n(chops)} time steps cut after convergence failures` : 'no time step cut')
    : 'convergence statistics not in the PRT';
  if (!mb?.computed) {
    return { balance: 'not_requested', chops, text: `Material balance not reported (${mb?.reason === 'no_fip_report' ? 'the deck does not ask for the FIP report' : mb?.reason === 'no_well_totals' ? 'the deck does not ask for the well totals' : (mb?.reason || 'unknown').replace(/_/g, ' ')}); ${conv}.` };
  }
  const worst = Object.values(mb.phases).reduce((a, p) => Math.max(a, Math.abs(p.relative_error ?? 0)), 0);
  return mb.closes
    ? { balance: 'closes', chops, text: `Material balance closes (largest error ${worst.toExponential(1)} of the original in place); ${conv}.` }
    : { balance: 'open', chops, text: `Material balance does not close (largest error ${worst.toExponential(1)} of the original in place); ${conv}. Read the report before using these results.` };
}

export const runStatusLine = (summary) => runStatus(summary).text;
