// Job kinds this worker runs. Each handler is async (ctx) => resultRefs.
// The list doubles as the claim filter, so a worker never claims a kind it
// cannot run (useful when hosts run different versions during a rollout).
import { noop } from './noop.js';

export const HANDLERS = Object.freeze({
  noop,
});

export const KINDS = Object.freeze(Object.keys(HANDLERS));
