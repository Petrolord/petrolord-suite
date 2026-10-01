// The basin run's worker protocol (AppUpgrade BF-U2-009, BF-U1-031). Pure:
// the worker file only wires `self` to handleRunMessage, so jest runs the
// exact code the worker runs.
//
// BF-U1-031: 60 layers over 300 Ma took about 20 s on the page's thread
// (the page froze, no progress, no way to stop). The engine
// (SimulationEngine.run, unchanged) now runs in a Web Worker; the page
// shows progress and Cancel terminates the worker.
//
// Messages in:  { type: 'run', id, inputs }
// Messages out: { type: 'progress', id, percent }
//               { type: 'done', id, result }
//               { type: 'error', id, message }

import { SimulationEngine } from './SimulationEngine';

/** Only what the engine reads (the app state also carries results and scenarios). */
export function engineInputs(state) {
  return {
    stratigraphy: state?.stratigraphy || [],
    heatFlow: state?.heatFlow || null,
    erosionEvents: state?.erosionEvents || [],
    settings: state?.settings || {},
  };
}

/** Run one message; `post` sends a reply. */
export async function handleRunMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, inputs } = msg;
  let last = -1;
  try {
    const result = await SimulationEngine.run(inputs, (p) => {
      const pct = Math.floor(p);
      if (pct !== last) { last = pct; post({ type: 'progress', id, percent: p }); }
    });
    post({ type: 'done', id, result });
  } catch (e) {
    post({ type: 'error', id, message: String(e?.message || e) });
  }
}
