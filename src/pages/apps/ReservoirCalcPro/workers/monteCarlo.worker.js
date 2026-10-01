// ReservoirCalc Pro Monte Carlo worker (upgrade U2-006). The protocol and
// the engine live in services; this file only connects them to `self`.
import { handleMcMessage } from '../services/mcWorkerProtocol';

self.onmessage = (e) => handleMcMessage(e.data, (m) => self.postMessage(m));
