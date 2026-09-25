// AI Evaluation Studio worker (Data & AI D5): the postMessage shell around
// evalJobs.js handleEvalMessage. All numerics are the vendored engine's.
import { handleEvalMessage } from '../evalJobs';

self.onmessage = (e) => handleEvalMessage(e.data, (m) => self.postMessage(m));
