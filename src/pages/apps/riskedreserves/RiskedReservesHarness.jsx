// Dev-only harness (/dev/risked-reserves): the workstation on an in-memory
// ReservoirCalc Pro inventory with two risked prospects, no auth or DB.
import React, { useMemo } from 'react';
import RrvWorkstation from './components/RrvWorkstation';
import { makeInMemoryProspectsBackend } from '../ReservoirCalcPro/services/prospectsService';

export default function RiskedReservesHarness() {
  const backend = useMemo(() => makeInMemoryProspectsBackend([
    { name: 'Ekene North', pg_factors: { trap: 0.8, reservoir: 0.8, charge: 0.5, seal: 1 }, inputs: { mean: 38, p90: 12, p50: 30, p10: 75 }, risked: { pg: 0.32, risked_mean: 12.2, success: { p90: 12, p50: 30, p10: 75, mean: 38 } } },
    { name: 'Ekene Deep', pg_factors: { trap: 0.6, reservoir: 0.6, charge: 0.5, seal: 1 }, inputs: { mean: 118, p90: 40, p50: 95, p10: 230 }, risked: { pg: 0.18, risked_mean: 21.2, success: { p90: 40, p50: 95, p10: 230, mean: 118 } } },
  ]), []);
  return <div className="h-screen w-full overflow-hidden"><RrvWorkstation backend={backend} /></div>;
}
