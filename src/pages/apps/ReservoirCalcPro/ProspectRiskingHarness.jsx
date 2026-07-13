// Dev-only harness route (/dev/prospect-risking, DEV builds only): the
// Prospect Risking panel on the in-memory backend — the full flow (Pg
// factors → risked readout → inventory → portfolio) drivable by
// Playwright without auth or DB. Seeds one prospect + a fixed unrisked
// run so the risked/portfolio numbers are deterministic.

import React, { useMemo } from 'react';
import ProspectRiskingPanel from './components/tools/ProspectRiskingPanel';
import { makeInMemoryProspectsBackend } from './services/prospectsService';

export default function ProspectRiskingHarness() {
  const backend = useMemo(() => makeInMemoryProspectsBackend([
    { name: 'Seed Prospect', pg_factors: { trap: 0.5, reservoir: 0.5, charge: 1, seal: 1 }, inputs: { mean: 100 }, risked: { risked_mean: 25 } },
  ]), []);
  const unrisked = useMemo(() => ({ mean: 40, p90: 12, p50: 33, p10: 78 }), []);
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto">
        <ProspectRiskingPanel backend={backend} unrisked={unrisked} />
      </div>
    </div>
  );
}
