// ML Workbench worker (Data & AI D2): the postMessage shell around
// mlJobs.js handleMlMessage. All numerics are the vendored engine's.
import { handleMlMessage } from '../mlJobs';

self.onmessage = (e) => handleMlMessage(e.data, (m) => self.postMessage(m));
