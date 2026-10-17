// Earth Modeling build worker (U2-004): runs buildModel off the main
// thread; the protocol lives in services/buildWorkerProtocol.js.
import { serveBuild } from '../services/buildWorkerProtocol';

const handle = serveBuild((m, transfer) => self.postMessage(m, transfer || []));
self.onmessage = (ev) => { handle(ev.data); };
