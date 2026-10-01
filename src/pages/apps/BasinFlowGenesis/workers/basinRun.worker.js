// Basin & Charge Modeling run worker (upgrade U2-009). The protocol and the
// engine live in services; this file only connects them to `self`.
import { handleRunMessage } from '../services/runWorkerProtocol';

self.onmessage = (e) => { handleRunMessage(e.data, (m) => self.postMessage(m)); };
