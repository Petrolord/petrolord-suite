// Well Test Analysis Studio gauge import worker (WTA-U2-010). The protocol
// lives in utils/welltest/gaugeImportProtocol.js; this file only connects it
// to `self`.
import { createGaugeHandler } from '../utils/welltest/gaugeImportProtocol';

const handle = createGaugeHandler({ packed: true });
self.onmessage = (e) => handle(e.data, (m, transfer) => self.postMessage(m, transfer || []));
