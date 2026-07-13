// Dev-only harness route (/dev/well-correlation, DEV builds only): the
// FULL Well Correlation app on the in-memory backend — no auth or DB.
// The seeded 3-well synthetic section (services/sampleSection.js) lets
// the Playwright suite assert exact geometry: flatten on Top Dome and
// the correlation line is flat across all wells (shifts 0/-40/+30).
// The registry-backed app (G3.3 tile) mounts the same
// CorrelationWorkstation on makeRegistryBackend.

import React, { useMemo } from 'react';
import CorrelationWorkstation from './components/CorrelationWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';

export default function WellCorrelationHarness() {
  const backend = useMemo(() => makeInMemoryBackend(), []);
  return (
    <div className="h-screen w-full overflow-hidden">
      <CorrelationWorkstation backend={backend} />
    </div>
  );
}
