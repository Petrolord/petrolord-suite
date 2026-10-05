// Job kinds this worker runs. Each handler is async (ctx) => resultRefs.
// The list doubles as the claim filter, so a worker never claims a kind it
// cannot run (useful when hosts run different versions during a rollout).
// Handlers that need services (Supabase, the object store, scratch disk)
// get them from createHandlers(deps); main.js builds the real ones.
import { noop } from './noop.js';
import { stackToV4 } from './stackToV4.js';

export const KINDS = Object.freeze(['noop', 'stack_to_v4']);

export function createHandlers(deps = {}) {
  return Object.freeze({
    noop,
    stack_to_v4: (ctx) => stackToV4(ctx, deps),
  });
}
