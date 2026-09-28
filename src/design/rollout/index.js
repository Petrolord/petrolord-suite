// The cold-load path list, one file per rollout batch
// (docs/scope/DesignSystem-Rollout.md, Wave 0A). Each batch registers its
// migrated route prefixes in its own file (w1a.js ... w6g.js) and never edits
// this index, so parallel batches do not collide. Every batch file exists
// already (an empty list until the batch lands); the test
// src/design/__tests__/rolloutFiles.test.js fails if a file in this folder
// is not aggregated here, or if two batches register the same prefix.
import pilots from './pilots.js';
import w1a from './w1a.js';
import w1b from './w1b.js';
import w1c from './w1c.js';
import w1d from './w1d.js';
import w1e from './w1e.js';
import w2a from './w2a.js';
import w2b from './w2b.js';
import w2c from './w2c.js';
import w2d from './w2d.js';
import w2e from './w2e.js';
import w2f from './w2f.js';
import w3a from './w3a.js';
import w3b from './w3b.js';
import w3c from './w3c.js';
import w3d from './w3d.js';
import w3e from './w3e.js';
import w3f from './w3f.js';
import w4a from './w4a.js';
import w4b from './w4b.js';
import w4c from './w4c.js';
import w4d from './w4d.js';
import w4e from './w4e.js';
import w4f from './w4f.js';
import w5a from './w5a.js';
import w5b from './w5b.js';
import w5c from './w5c.js';
import w5d from './w5d.js';
import w5e from './w5e.js';
import w5f from './w5f.js';
import w6a from './w6a.js';
import w6b from './w6b.js';
import w6c from './w6c.js';
import w6d from './w6d.js';
import w6e from './w6e.js';
import w6f from './w6f.js';
import w6g from './w6g.js';

/** Every batch's list, by batch id (pilots first). */
export const ROLLOUT_BATCHES = Object.freeze({
  pilots,
  w1a, w1b, w1c, w1d, w1e, w2a, w2b, w2c,
  w2d, w2e, w2f, w3a, w3b, w3c, w3d, w3e,
  w3f, w4a, w4b, w4c, w4d, w4e, w4f, w5a,
  w5b, w5c, w5d, w5e, w5f, w6a, w6b, w6c,
  w6d, w6e, w6f, w6g,
});

/** All themed app prefixes, in batch order. */
export const THEMED_APP_PREFIXES = Object.freeze(Object.values(ROLLOUT_BATCHES).flat());
