// Risked Reserves Valuation (T1 rebuild, 2026-09-26): valuation of the
// prospects risked in ReservoirCalc Pro. The previous page ran its own
// NPV Monte Carlo over five variables with P10 and P90 read as the min
// and max of a triangle and called P(NPV > 0) the chance of success; it is
// retired (report docs/testing/RiskedReservesValuation-T1.md). Upgrade U1
// (2026-10-02): valuations are saved to the account (rrv_valuations).

import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import RrvWorkstation from './riskedreserves/components/RrvWorkstation';
import { makeRegistryRrvBackend } from './riskedreserves/services/rrvBackend';

export default function RiskedReservesValuation() {
  const backend = useMemo(() => makeRegistryRrvBackend(), []);
  return (
    <>
      <Helmet>
        <title>Risked Reserves Valuation - Petrolord Suite</title>
        <meta name="description" content="Commercial chance, expected monetary value and the risked expectation curve for prospects risked in ReservoirCalc Pro." />
      </Helmet>
      <div className="h-screen w-full overflow-hidden"><RrvWorkstation backend={backend} /></div>
    </>
  );
}
