// The Monte Carlo worker's message protocol (ReservoirCalc Pro upgrade
// U2-006, 2026-10-01). Pure: the worker file only wires `self` to
// `handleMcMessage`, so jest runs the exact code the worker runs.
//
// RCP-U1-032: a 50,000-realization run took 3 s and 200,000 took 12 s on
// the page's thread with no progress and no way to stop it. The canonical
// engine (MonteCarloEngine.simulate) now runs in a Web Worker; the page
// shows progress and Cancel terminates the worker.
//
// Messages in:  { type: 'run', id, config, inputs, progressEvery? }
// Messages out: { type: 'progress', id, done, total }
//               { type: 'done', id, result }
//               { type: 'error', id, message }

import { MonteCarloEngine } from './MonteCarloEngine';
import { hypsometryTable } from './hypsometry';

/** A config the structured clone can carry: the hypsometry as its table. */
export function cloneableConfig(config) {
  const c = { ...config };
  if (c.hypsometry) c.hypsometry = hypsometryTable(c.hypsometry);
  if (c.baseCase) {
    // only the base volumes are read by the engine
    const r = c.baseCase.results || {};
    c.baseCase = { results: { stooip: r.stooip ?? null, giip: r.giip ?? null } };
  }
  return c;
}

/** Run one message; `post` sends a reply. */
export function handleMcMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, config, inputs, progressEvery } = msg;
  try {
    const result = MonteCarloEngine.simulate(config, inputs, {
      progressEvery,
      onProgress: (done, total) => post({ type: 'progress', id, done, total }),
    });
    post({ type: 'done', id, result });
  } catch (e) {
    post({ type: 'error', id, message: String(e?.message || e) });
  }
}
