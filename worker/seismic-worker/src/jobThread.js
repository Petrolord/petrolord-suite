// Worker-thread entry for one job (bundled as dist/jobThread.mjs beside
// main.mjs). See threadEntry.js for the protocol.
import { runInThread } from './threadEntry.js';
import { createHandlers } from './handlers/index.js';
import { buildDeps } from './deps.js';

runInThread({ createHandlers, buildDeps });
