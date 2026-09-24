// Electrofacies Studio worker (Data & AI D3): the postMessage shell around
// faciesJobs.js handleFaciesMessage. All numerics are the vendored engine's.
import { handleFaciesMessage } from '../faciesJobs';

self.onmessage = (e) => handleFaciesMessage(e.data, (m) => self.postMessage(m));
