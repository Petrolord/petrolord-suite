// Probabilistic run worker (Petrophysics Studio PT10d): the postMessage
// shell around services/probabilistic.js handleRunMessage, so a run of a
// few hundred realisations over a long well never blocks the UI (the Well
// Data Manager LAS worker pattern). All numerics live in the engine.
import { handleRunMessage } from '../services/probabilistic';

self.onmessage = (e) => handleRunMessage(e.data, (m, transfer) => self.postMessage(m, transfer || []));
